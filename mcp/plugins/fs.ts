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
import {logAction} from '../utils/logger.ts'
import {pathExists, safeResolve, toRelative} from '../utils/path.ts'

function getLines(content: string, startLine: number, lineCount: number) {
  const lines = content.split(/\\r?\\n/)
  const start = Math.max(0, startLine - 1)
  const end = Math.min(lines.length, start + lineCount)

  return {
    text: lines.slice(start, end).join('\\n'),
    startLine: start + 1,
    endLine: end,
    totalLines: lines.length,
  }
}

export function registerFsTools(server: McpServer) {
  // --- list_dir ---
  server.registerTool(
    'fs_list_dir',
    {
      description: 'Список файлов и папок',
      annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
      inputSchema: z.object({
        path: z.string().default('.').describe('Относительный путь'),
      }),
    },
    async ({path}) => {
      const full = safeResolve(path)
      await logAction('fs', 'list_dir', {path})

      const entries = await readdir(full, {withFileTypes: true})
      const result = entries.map((e) => ({
        name: e.name,
        type: e.isDirectory() ? 'dir' : 'file',
      }))

      return {
        content: [{type: 'text', text: JSON.stringify(result, null, 2)}],
      }
    },
  )

  // --- glob ---
  server.registerTool(
    'fs_glob',
    {
      description: 'Поиск файлов по glob-паттерну (например **/*.ts, src/**/*.tsx)',
      annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
      inputSchema: z.object({
        pattern: z.string().describe('Glob-паттерн'),
        cwd: z.string().default('.').describe('Относительная директория поиска'),
      }),
    },
    async ({pattern, cwd}) => {
      const base = safeResolve(cwd)
      await logAction('fs', 'glob', {pattern, cwd})

      const files: string[] = []
      for await (const f of glob(pattern, {cwd: base})) {
        files.push(f)
      }

      const relativePaths = files.map((f) => toRelative(join(base, f)))

      return {
        content: [{
          type: 'text',
          text: relativePaths.length
            ? relativePaths.join('\\n')
            : 'Ничего не найдено',
        }],
      }
    },
  )

  // --- find ---
  server.registerTool(
    'fs_find',
    {
      description: 'Ищет текст или регулярное выражение в файлах и возвращает совпадения с номерами строк',
      annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
      inputSchema: z.object({
        pattern: z.string().describe('Текст или регулярное выражение'),
        path: z.string().default('.').describe('Файл или директория поиска'),
        include: z.string().default('**/*').describe('Glob-паттерн файлов внутри директории'),
        regex: z.boolean().default(false).describe('Интерпретировать pattern как регулярное выражение'),
        maxResults: z.number().int().min(1).max(1000).default(100).describe('Максимальное количество совпадений'),
      }),
    },
    async ({pattern, path, include, regex, maxResults}) => {
      const full = safeResolve(path)
      await logAction('fs', 'find', {pattern, path, include, regex, maxResults})

      const targetStat = await stat(full)
      const files: string[] = targetStat.isFile() ? [full] : []

      if (targetStat.isDirectory()) {
        for await (const file of glob(include, {cwd: full})) {
          const candidate = join(full, file)
          if ((await stat(candidate)).isFile()) files.push(candidate)
        }
      }

      const matcher = regex ? new RegExp(pattern) : null
      const results: string[] = []

      for (const file of files) {
        if (results.length >= maxResults) break

        let content: string
        try {
          content = await readFile(file, 'utf-8')
        } catch {
          continue
        }

        const lines = content.split(/\\r?\\n/)
        for (let i = 0; i < lines.length && results.length < maxResults; i++) {
          const matched = matcher
            ? matcher.test(lines[i])
            : lines[i].includes(pattern)

          if (matched) {
            results.push(`${toRelative(file)}:${i + 1}: ${lines[i]}`)
          }

          if (matcher) matcher.lastIndex = 0
        }
      }

      return {
        content: [{
          type: 'text',
          text: results.length
            ? results.join('\\n')
            : 'Совпадений не найдено',
        }],
      }
    },
  )

  // --- read_file ---
  server.registerTool(
    'fs_read_file',
    {
      description: 'Читает файл целиком или указанный диапазон строк',
      annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
      inputSchema: z.object({
        path: z.string(),
        startLine: z.number().int().min(1).default(1).describe('Первая строка, начиная с 1'),
        lineCount: z.number().int().min(1).max(10000).optional().describe(
          'Количество строк. Без него читает файл целиком',
        ),
      }),
    },
    async ({path, startLine, lineCount}) => {
      const full = safeResolve(path)
      await logAction('fs', 'read_file', {path, startLine, lineCount})

      if (!(await pathExists(full))) {
        throw new Error(`Файл не найден: ${path}`)
      }

      const content = await readFile(full, 'utf-8')

      if (lineCount === undefined) {
        return {content: [{type: 'text', text: content}]}
      }

      const result = getLines(content, startLine, lineCount)
      return {
        content: [{
          type: 'text',
          text: `[lines ${result.startLine}-${result.endLine} of ${result.totalLines}]\\n${result.text}`,
        }],
      }
    },
  )

  // --- patch ---
  server.registerTool(
    'fs_patch',
    {
      description:
        'Точечно изменяет файл, заменяя указанные фрагменты. Каждый old-фрагмент должен встретиться ровно один раз',
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
        throw new Error(`Файл не найден: ${path}`)
      }

      let content = await readFile(full, 'utf-8')

      for (const [index, patch] of patches.entries()) {
        const occurrences = content.split(patch.old).length - 1
        if (occurrences !== 1) {
          throw new Error(
            `Patch #${index + 1}: old-фрагмент должен встретиться ровно один раз, найдено: ${occurrences}`,
          )
        }

        content = content.replace(patch.old, patch.new)
      }

      await writeFile(full, content, 'utf-8')

      return {
        content: [{type: 'text', text: `Изменено: ${path}`}],
      }
    },
  )

  // --- write_file ---
  server.registerTool(
    'fs_write_file',
    {
      description: 'Записывает файл (создаёт папки при необходимости)',
      annotations: {readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false},
      inputSchema: z.object({
        path: z.string(),
        content: z.string(),
      }),
    },
    async ({path, content}) => {
      const full = safeResolve(path)
      await logAction('fs', 'write_file', {path, bytes: content.length})

      await mkdir(join(full, '..'), {recursive: true})
      await writeFile(full, content, 'utf-8')

      return {
        content: [{type: 'text', text: `Записано: ${path}`}],
      }
    },
  )

  // --- delete_file ---
  server.registerTool(
    'fs_delete_file',
    {
      description:
        'Удаляет файл только если он существует в последнем коммите Git. Незакоммиченные и неотслеживаемые файлы удалить нельзя',
      annotations: {readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false},
      inputSchema: z.object({
        path: z.string(),
      }),
    },
    async ({path}) => {
      const full = safeResolve(path)
      await logAction('fs', 'delete_file', {path})

      if (!(await pathExists(full))) {
        throw new Error(`Файл не найден: ${path}`)
      }

      const s = await stat(full)
      if (!s.isFile()) {
        throw new Error(`Удаление поддерживается только для файлов: ${path}`)
      }

      const tracked = await runCommand('git', ['ls-files', '--error-unmatch', '--', path])
      if (!tracked.ok) {
        throw new Error(`Удаление запрещено: файл не отслеживается Git: ${path}`)
      }

      const committed = await runCommand('git', ['cat-file', '-e', `HEAD:${path.replace(/\\\\/g, '/')}`])
      if (!committed.ok) {
        throw new Error(`Удаление запрещено: файл ещё не был сохранён в коммите Git: ${path}`)
      }

      const clean = await runCommand('git', ['diff', '--quiet', 'HEAD', '--', path])
      if (!clean.ok) {
        throw new Error(
          `Удаление запрещено: файл содержит незакоммиченные изменения: ${path}`,
        )
      }

      await rm(full)

      return {
        content: [{type: 'text', text: `Удалено: ${path} (можно восстановить из Git)`}],
      }
    },
  )

  // --- stat ---
  server.registerTool(
    'fs_stat',
    {
      description: 'Информация о файле/папке',
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
