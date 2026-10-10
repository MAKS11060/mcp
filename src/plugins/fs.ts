import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  glob, // Node 22+
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import {join} from 'node:path'
import {z} from 'zod'
import {runCommand} from '../utils/exec.ts'
import {replaceLines} from '../utils/lines.ts'
import {logAction} from '../utils/logger.ts'
import {pathExists, safeResolve, toRelative} from '../utils/path.ts'

function getLines(content: string, startLine: number, endLine?: number, lineCount?: number) {
  const lines = content.split(/\r\n|\n|\r/)
  const start = Math.max(0, startLine - 1)
  const end = Math.min(lines.length, endLine ?? (start + (lineCount ?? lines.length)))

  return {
    text: lines.slice(start, Math.max(start, end)).join('\n'),
    startLine: start + 1,
    endLine: Math.max(start, end),
    totalLines: lines.length,
  }
}

function limitResults<T>(items: T[], maxResults: number) {
  return {
    items: items.slice(0, maxResults),
    truncated: items.length > maxResults,
    total: items.length,
  }
}

function isIgnoredPath(path: string, ignore: string[]) {
  return ignore.some((pattern) => path === pattern || path.startsWith(`${pattern}/`))
}

export function registerFsTools(server: McpServer) {
  // --- list_dir ---
  server.registerTool(
    'fs_list_dir',
    {
      description: 'List files and directories',
      annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
      inputSchema: z.object({
        path: z.string().default('.').describe('Directory to list, relative to the project root'),
        recursive: z.boolean().default(false).describe('Include nested directories'),
        depth: z.number().int().min(1).max(20).optional().describe('Maximum directory depth when recursive'),
        filesOnly: z.boolean().default(false).describe('Return files only'),
        dirsOnly: z.boolean().default(false).describe('Return directories only'),
        include: z.string().optional().describe('Glob pattern to filter entry paths'),
        maxResults: z.number().int().min(1).max(5000).default(500).describe('Maximum number of entries to return'),
      }),
    },
    async ({path, recursive, depth, filesOnly, dirsOnly, include, maxResults}) => {
      const full = safeResolve(path)
      await logAction('fs', 'list_dir', {path, recursive, depth, filesOnly, dirsOnly, include, maxResults})

      const result: {path: string; type: 'dir' | 'file'}[] = []
      const visit = async (dir: string, currentDepth: number): Promise<void> => {
        if (recursive && depth !== undefined && currentDepth > depth) return
        const entries = await readdir(dir, {withFileTypes: true})

        for (const entry of entries) {
          const entryPath = join(dir, entry.name)
          const relativePath = toRelative(entryPath)
          const isDir = entry.isDirectory()
          if (
            (!filesOnly || !isDir) && (!dirsOnly || isDir)
            && (!include || (await import('node:path')).matchesGlob(relativePath, include))
          ) {
            result.push({path: relativePath, type: isDir ? 'dir' : 'file'})
          }
          if (recursive && isDir && (depth === undefined || currentDepth < depth)) {
            await visit(entryPath, currentDepth + 1)
          }
        }
      }

      await visit(full, 1)
      const limited = limitResults(result, maxResults)

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({...limited, items: limited.items}, null, 2),
        }],
      }
    },
  )

  // --- glob ---
  server.registerTool(
    'fs_glob',
    {
      description: 'Find files matching a glob pattern, such as **/*.ts or src/**/*.tsx',
      annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
      inputSchema: z.object({
        pattern: z.string().describe('Glob pattern'),
        cwd: z.string().default('.').describe('Search directory, relative to the project root'),
        ignore: z.array(z.string()).default(['node_modules', '.git', 'dist']).describe(
          'Directory names or paths to ignore',
        ),
        respectGitignore: z.boolean().default(true).describe('Skip paths listed in .gitignore'),
        maxResults: z.number().int().min(1).max(10000).default(1000).describe(
          'Maximum number of matching paths to return',
        ),
      }),
    },
    async ({pattern, cwd, ignore, respectGitignore, maxResults}) => {
      const base = safeResolve(cwd)
      await logAction('fs', 'glob', {pattern, cwd, ignore, respectGitignore, maxResults})

      const ignored = new Set(ignore)
      if (respectGitignore) {
        try {
          const gitignore = await readFile(join(base, '.gitignore'), 'utf-8')
          for (const line of gitignore.split(/\r?\n/)) {
            const trimmed = line.trim()
            const rule = trimmed.startsWith('/') ? trimmed.slice(1).replace(/\/$/, '') : trimmed.replace(/\/$/, '')
            if (rule && !rule.startsWith('#') && !rule.startsWith('!') && !rule.includes('*')) ignored.add(rule)
          }
        } catch {
          // No .gitignore file
        }
      }

      const files: string[] = []
      let truncated = false
      for await (const f of glob(pattern, {cwd: base})) {
        const normalized = f.replace(/\\/g, '/')
        if (isIgnoredPath(normalized, [...ignored])) continue
        if (files.length >= maxResults) {
          truncated = true
          break
        }
        files.push(f)
      }

      const relativePaths = files.map((f) => toRelative(join(base, f)))

      return {
        content: [{
          type: 'text',
          text: `${relativePaths.length ? relativePaths.join('\n') : 'No matches found'}${
            truncated ? `\n\nResults truncated at ${maxResults} paths` : ''
          }`,
        }],
      }
    },
  )

  // --- find ---
  server.registerTool(
    'fs_find',
    {
      description: 'Search files for text or a regular expression and return matching lines with line numbers',
      annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
      inputSchema: z.object({
        pattern: z.string().describe('Text or regular expression to search for'),
        path: z.string().default('.').describe('File or directory to search'),
        include: z.string().default('**/*').describe('Glob pattern for files inside the directory'),
        exclude: z.array(z.string()).default(['node_modules/**', '.git/**', 'dist/**']).describe(
          'Glob patterns to exclude',
        ),
        regex: z.boolean().default(false).describe('Interpret pattern as a regular expression'),
        caseInsensitive: z.boolean().default(false).describe('Match without regard to letter case'),
        contextLines: z.number().int().min(0).max(20).default(0).describe(
          'Number of context lines before and after each match',
        ),
        maxResults: z.number().int().min(1).max(1000).default(100).describe('Maximum number of matches'),
      }),
    },
    async ({pattern, path, include, exclude, regex, caseInsensitive, contextLines, maxResults}) => {
      const full = safeResolve(path)
      await logAction('fs', 'find', {pattern, path, include, exclude, regex, caseInsensitive, contextLines, maxResults})

      const targetStat = await stat(full)
      const files: string[] = targetStat.isFile() ? [full] : []

      if (targetStat.isDirectory()) {
        for await (const file of glob(include, {cwd: full})) {
          const candidate = join(full, file)
          if (exclude.some((rule) => file === rule || file.startsWith(rule.replace(/\*\*$/, '')))) continue
          if ((await stat(candidate)).isFile()) files.push(candidate)
        }
      }

      const matcher = regex ? new RegExp(pattern, caseInsensitive ? 'i' : '') : null
      const searchPattern = caseInsensitive ? pattern.toLowerCase() : pattern
      const results: string[] = []
      const emitted = new Set<string>()

      for (const file of files) {
        if (results.length >= maxResults) break

        let content: string
        try {
          content = await readFile(file, 'utf-8')
        } catch {
          continue
        }

        const lines = content.split(/\r\n|\n|\r/)
        for (let i = 0; i < lines.length && results.length < maxResults; i++) {
          const candidate = caseInsensitive ? lines[i].toLowerCase() : lines[i]
          const matched = matcher ? matcher.test(lines[i]) : candidate.includes(searchPattern)

          if (matched) {
            const from = Math.max(0, i - contextLines)
            const to = Math.min(lines.length, i + contextLines + 1)
            for (let line = from; line < to; line++) {
              const key = `${file}:${line + 1}`
              if (emitted.has(key)) continue
              emitted.add(key)
              results.push(`${toRelative(file)}:${line + 1}${line === i ? ':' : '-'} ${lines[line]}`)
              if (results.length >= maxResults) break
            }
          }

          if (matcher) matcher.lastIndex = 0
        }
      }

      return {
        content: [{
          type: 'text',
          text: results.length
            ? results.join('\n')
            : 'No matches found',
        }],
      }
    },
  )

  // --- read_file ---
  server.registerTool(
    'fs_read_file',
    {
      description: 'Read a file completely or read a specified range of lines',
      annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
      inputSchema: z.object({
        path: z.string(),
        startLine: z.number().int().min(1).default(1).describe('First line number, starting at 1'),
        endLine: z.number().int().min(1).optional().describe('Last line number, inclusive'),
        lineCount: z.number().int().min(1).max(10000).optional().describe('Number of lines to read'),
        tail: z.number().int().min(1).max(10000).optional().describe('Read the last N lines'),
        maxBytes: z.number().int().min(1).max(5_000_000).default(200_000).describe(
          'Maximum number of file bytes to return',
        ),
      }),
    },
    async ({path, startLine, endLine, lineCount, tail, maxBytes}) => {
      const full = safeResolve(path)
      await logAction('fs', 'read_file', {path, startLine, endLine, lineCount, tail, maxBytes})

      if (!(await pathExists(full))) {
        throw new Error(`File not found: ${path}`)
      }

      const fileStat = await stat(full)
      const content = await readFile(full, 'utf-8')
      const totalLines = content.split(/\r\n|\n|\r/).length

      if (tail !== undefined && (endLine !== undefined || lineCount !== undefined || startLine !== 1)) {
        throw new Error('tail cannot be combined with startLine, endLine, or lineCount')
      }
      if (endLine !== undefined && lineCount !== undefined) {
        throw new Error('Use either endLine or lineCount, not both')
      }

      let selected: string
      let rangeLabel: string
      if (tail !== undefined) {
        const result = getLines(content, Math.max(1, totalLines - tail + 1), totalLines)
        selected = result.text
        rangeLabel = `[last ${Math.min(tail, totalLines)} lines of ${totalLines}]`
      } else if (endLine !== undefined || lineCount !== undefined) {
        const result = getLines(content, startLine, endLine ?? (startLine + (lineCount ?? totalLines) - 1))
        selected = result.text
        rangeLabel = `[lines ${result.startLine}-${result.endLine} of ${result.totalLines}]`
      } else {
        selected = content
        rangeLabel = ''
      }

      const selectedBytes = Buffer.byteLength(selected, 'utf-8')
      if (selectedBytes > maxBytes) {
        let truncated = selected
        while (Buffer.byteLength(truncated, 'utf-8') > maxBytes) {
          truncated = truncated.slice(0, Math.floor(truncated.length * 0.8))
        }
        selected = truncated
      }

      const truncated = selectedBytes > maxBytes
      return {
        content: [{
          type: 'text',
          text: `${rangeLabel ? `${rangeLabel}\n` : ''}${selected}${
            truncated ? `\n\n[Output truncated at ${maxBytes} bytes; file size: ${fileStat.size} bytes]` : ''
          }`,
        }],
      }
    },
  )

  // --- read_files ---
  server.registerTool(
    'fs_read_files',
    {
      description: 'Read multiple files in one call',
      annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
      inputSchema: z.object({
        paths: z.array(z.string().min(1)).min(1).max(50).describe('Project-relative file paths to read'),
        maxBytesPerFile: z.number().int().min(1).max(1_000_000).default(100_000).describe(
          'Maximum bytes to return for each file',
        ),
      }),
    },
    async ({paths, maxBytesPerFile}) => {
      await logAction('fs', 'read_files', {paths, maxBytesPerFile})
      const results = []
      for (const path of paths) {
        try {
          const full = safeResolve(path)
          const info = await stat(full)
          if (!info.isFile()) throw new Error('Not a file')
          const content = await readFile(full, 'utf-8')
          const bytes = Buffer.byteLength(content, 'utf-8')
          let text = content
          if (bytes > maxBytesPerFile) {
            text = content.slice(0, maxBytesPerFile)
            while (Buffer.byteLength(text, 'utf-8') > maxBytesPerFile) {
              text = text.slice(0, -1)
            }
            text += `\n[Truncated at ${maxBytesPerFile} bytes; file size: ${bytes} bytes]`
          }
          results.push({path, ok: true, size: bytes, content: text})
        } catch (error) {
          results.push({path, ok: false, error: error instanceof Error ? error.message : String(error)})
        }
      }
      return {content: [{type: 'text', text: JSON.stringify(results, null, 2)}]}
    },
  )

  // --- patch ---
  server.registerTool(
    'fs_patch',
    {
      description: 'Apply targeted replacements to a file. Each old fragment must occur exactly once',
      annotations: {readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false},
      inputSchema: z.object({
        path: z.string(),
        patches: z.array(z.object({
          old: z.string().min(1),
          new: z.string(),
        })).min(1),
      }),
    },
    async ({path, patches}) => {
      const full = safeResolve(path)
      await logAction('fs', 'patch', {path, patches: patches.length})

      if (!(await pathExists(full))) {
        throw new Error(`File not found: ${path}`)
      }

      let content = await readFile(full, 'utf-8')

      for (const [index, patch] of patches.entries()) {
        const occurrences = content.split(patch.old).length - 1
        if (occurrences !== 1) {
          throw new Error(
            `Patch #${index + 1}: old fragment must occur exactly once; found: ${occurrences}`,
          )
        }

        const matchIndex = content.indexOf(patch.old)
        content = content.slice(0, matchIndex) + patch.new + content.slice(matchIndex + patch.old.length)
      }

      await writeFile(full, content, 'utf-8')

      return {
        content: [{type: 'text', text: `Updated: ${path}`}],
      }
    },
  )

  // --- mkdir ---
  server.registerTool(
    'fs_mkdir',
    {
      description: 'Create a directory and any missing parent directories',
      annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false},
      inputSchema: z.object({
        path: z.string().min(1).describe('Directory path relative to the project root'),
        recursive: z.boolean().default(true).describe('Create missing parent directories'),
      }),
    },
    async ({path, recursive}) => {
      const full = safeResolve(path)
      await logAction('fs', 'mkdir', {path, recursive})
      await mkdir(full, {recursive})
      return {content: [{type: 'text', text: `Directory created: ${path}`}]}
    },
  )

  // --- write_file ---
  server.registerTool(
    'fs_write_file',
    {
      description: 'Write a file and create parent directories when needed',
      annotations: {readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false},
      inputSchema: z.object({
        path: z.string(),
        content: z.string(),
        mode: z.enum(['overwrite', 'append', 'replace_lines']).default('overwrite').describe(
          'How to write the content',
        ),
        startLine: z.number().int().min(1).optional().describe(
          'First line to replace, inclusive; required for replace_lines',
        ),
        endLine: z.number().int().min(1).optional().describe('Last line to replace, inclusive; defaults to startLine'),
        dryRun: z.boolean().default(false).describe('Preview the change without writing to disk'),
        maxPreviewLines: z.number().int().min(1).max(500).default(100).describe(
          'Maximum diff lines to return in preview mode',
        ),
      }),
    },
    async ({path, content, mode, startLine, endLine, dryRun, maxPreviewLines}) => {
      const full = safeResolve(path)
      await logAction('fs', 'write_file', {path, mode, bytes: content.length, dryRun})

      const exists = await pathExists(full)
      const original = exists ? await readFile(full, 'utf-8') : ''
      let updated: string

      if (mode === 'append') {
        updated = original + content
      } else if (mode === 'replace_lines') {
        if (startLine === undefined) throw new Error('startLine is required for replace_lines')
        updated = replaceLines(original, content, startLine, endLine)
      } else {
        updated = content
      }

      if (dryRun) {
        const before = original.split(/\r\n|\n|\r/)
        const after = updated.split(/\r\n|\n|\r/)
        const preview = [
          ...before.slice(0, maxPreviewLines).map((line) => `- ${line}`),
          ...after.slice(0, maxPreviewLines).map((line) => `+ ${line}`),
        ].slice(0, maxPreviewLines)
        return {
          content: [{
            type: 'text',
            text: `Dry run — no changes written to ${path}\n${preview.join('\n')}${
              before.length + after.length > maxPreviewLines ? '\n... preview truncated' : ''
            }`,
          }],
        }
      }

      await mkdir(join(full, '..'), {recursive: true})
      await writeFile(full, updated, 'utf-8')

      return {
        content: [{type: 'text', text: `Written: ${path} (${mode})`}],
      }
    },
  )

  // --- delete_file ---
  server.registerTool(
    'fs_delete_file',
    {
      description:
        'Delete a file only if it exists in the latest Git commit. Uncommitted and untracked files cannot be deleted',
      annotations: {readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false},
      inputSchema: z.object({
        path: z.string(),
        allowUntracked: z.boolean().default(false).describe(
          'Explicitly allow deleting untracked files; tracked files must still be clean and committed',
        ),
      }),
    },
    async ({path, allowUntracked}) => {
      const full = safeResolve(path)
      await logAction('fs', 'delete_file', {path, allowUntracked})

      if (!(await pathExists(full))) {
        throw new Error(`File not found: ${path}`)
      }

      const s = await stat(full)
      if (!s.isFile()) {
        throw new Error(`Only files can be deleted: ${path}`)
      }

      const normalizedPath = path.replace(/\\/g, '/')
      const tracked = await runCommand('git', ['ls-files', '--error-unmatch', '--', normalizedPath])
      if (!tracked.ok) {
        if (tracked.code !== 1) {
          throw new Error(`Unable to verify Git tracking status for ${path}: ${tracked.stderr || tracked.stdout}`)
        }
        if (!allowUntracked) {
          throw new Error(`Deletion denied: file is untracked; set allowUntracked=true to delete it: ${path}`)
        }
      } else {
        const committed = await runCommand('git', ['cat-file', '-e', `HEAD:${normalizedPath}`])
        if (!committed.ok) {
          throw new Error(`Deletion denied: file is not present in HEAD: ${path}`)
        }

        const clean = await runCommand('git', ['diff', '--quiet', 'HEAD', '--', normalizedPath])
        if (!clean.ok) {
          throw new Error(`Deletion denied: file has uncommitted changes: ${path}`)
        }
      }

      await rm(full)

      return {
        content: [{type: 'text', text: `Deleted: ${path} (can be restored from Git)`}],
      }
    },
  )

  // --- stat ---
  server.registerTool(
    'fs_stat',
    {
      description: 'Get information about a file or directory',
      annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
      inputSchema: z.object({path: z.string()}),
    },
    async ({path}) => {
      const full = safeResolve(path)
      await logAction('fs', 'stat', {path})

      const s = await stat(full)
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(
            {
              path,
              isFile: s.isFile(),
              isDirectory: s.isDirectory(),
              size: s.size,
              mtime: s.mtime.toISOString(),
            },
            null,
            2,
          ),
        }],
      }
    },
  )
}
