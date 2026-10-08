import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {join} from 'node:path'
import {z} from 'zod'
import {runCommand} from '../utils/exec.ts'
import {logAction} from '../utils/logger.ts'
import {getProjectRoot, pathExists, safeResolve} from '../utils/path.ts'

function gitPaths(files?: string[]) {
  return files?.length
    ? files.map((file) => {
      safeResolve(file)
      return file.replace(/\\/g, '/')
    })
    : ['.']
}

export function registerGitTools(server: McpServer) {
  // --- status ---
  server.registerTool(
    'git_status',
    {
      description: 'Show git status --short and verify that a Git repository exists',
      annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
      inputSchema: z.object({}),
    },
    async () => {
      await logAction('git', 'status')

      const gitDir = join(getProjectRoot(), '.git')
      const hasGit = await pathExists(gitDir)

      if (!hasGit) {
        return {
          content: [{type: 'text', text: 'Репозиторий git не инициализирован (.git отсутствует)'}],
        }
      }

      const result = await runCommand('git', ['status', '--short', '--branch'])
      return {
        content: [{type: 'text', text: result.all || 'Рабочая директория чистая'}],
      }
    },
  )

  // --- diff ---
  server.registerTool(
    'git_diff',
    {
      description: 'Show working tree changes or staged changes',
      annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
      inputSchema: z.object({
        staged: z.boolean().default(false).describe('Show staged changes'),
        files: z.array(z.string()).optional().describe('Only the specified files'),
      }),
    },
    async ({staged, files}) => {
      await logAction('git', 'diff', {staged, files})
      const paths = files?.length ? gitPaths(files) : []

      const result = await runCommand('git', [
        'diff',
        ...(staged ? ['--cached'] : []),
        '--',
        ...paths,
      ])

      return {
        content: [{type: 'text', text: result.ok ? result.stdout || 'Изменений нет' : result.stderr || result.stdout}],
      }
    },
  )

  // --- show ---
  server.registerTool(
    'git_show',
    {
      description: 'Show the contents of a commit or its diff',
      annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
      inputSchema: z.object({
        commit: z.string().default('HEAD').describe('Commit reference, such as HEAD, HEAD~1, or a hash'),
        files: z.array(z.string()).optional().describe('Limit output to the specified files'),
      }),
    },
    async ({commit, files}) => {
      await logAction('git', 'show', {commit, files})
      const paths = files?.length ? gitPaths(files) : []

      const result = await runCommand('git', [
        'show',
        '--stat',
        '--patch',
        commit,
        ...(paths.length ? ['--', ...paths] : []),
      ])

      return {
        content: [{type: 'text', text: result.ok ? result.stdout || 'Commit пустой' : result.stderr || result.stdout}],
      }
    },
  )

  // --- init ---
  server.registerTool(
    'git_init',
    {
      description: 'Initialize a Git repository if one does not already exist',
      annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false},
      inputSchema: z.object({}),
    },
    async () => {
      await logAction('git', 'init')

      const gitDir = join(getProjectRoot(), '.git')
      if (await pathExists(gitDir)) {
        return {content: [{type: 'text', text: 'Репозиторий уже существует'}]}
      }

      const result = await runCommand('git', ['init'])
      return {
        content: [{type: 'text', text: result.ok ? 'git init выполнен успешно' : result.stderr}],
      }
    },
  )

  // --- log ---
  server.registerTool(
    'git_log',
    {
      description: 'Show recent commits',
      annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
      inputSchema: z.object({
        limit: z.number().min(1).max(50).default(10).describe('Number of commits'),
        file: z.string().optional().describe('Show history for the specified file only'),
      }),
    },
    async ({limit, file}) => {
      await logAction('git', 'log', {limit, file})

      const result = await runCommand('git', [
        'log',
        `--max-count=${limit}`,
        '--pretty=format:%h | %an | %ar | %s',
        ...(file ? ['--', ...gitPaths([file])] : []),
      ])

      return {
        content: [{type: 'text', text: result.ok ? result.stdout || 'Нет коммитов' : result.stderr}],
      }
    },
  )

  // --- add ---
  server.registerTool(
    'git_add',
    {
      description: 'Stage files with git add. If files is omitted, stage all files',
      annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false},
      inputSchema: z.object({
        files: z.array(z.string()).optional().describe(
          'List of relative paths. If omitted, stage all files (.)',
        ),
      }),
    },
    async ({files}) => {
      await logAction('git', 'add', {files})
      const paths = gitPaths(files)
      const result = await runCommand('git', ['add', '--', ...paths])

      return {
        content: [{
          type: 'text',
          text: result.ok
            ? `Добавлено в индекс: ${paths.join(', ')}`
            : `git add failed:\\n${result.stderr || result.stdout}`,
        }],
      }
    },
  )

  // --- mv ---
  server.registerTool(
    'git_mv',
    {
      description: 'Move or rename a file or directory using git mv',
      annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false},
      inputSchema: z.object({
        source: z.string().min(1).describe('Source path'),
        destination: z.string().min(1).describe('Destination path'),
      }),
    },
    async ({source, destination}) => {
      safeResolve(source)
      safeResolve(destination)
      await logAction('git', 'mv', {source, destination})

      const result = await runCommand('git', [
        'mv',
        '--',
        source.replace(/\\/g, '/'),
        destination.replace(/\\/g, '/'),
      ])

      return {
        content: [{
          type: 'text',
          text: result.ok
            ? `Перемещено: ${source} -> ${destination}`
            : `git mv failed:\\n${result.stderr || result.stdout}`,
        }],
      }
    },
  )

  // --- fetch ---
  server.registerTool(
    'git_fetch',
    {
      description: 'Fetch changes from a remote repository using git fetch',
      annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true},
      inputSchema: z.object({
        remote: z.string().default('origin').describe('Удалённый репозиторий'),
        prune: z.boolean().default(false).describe('Prune references to deleted remote branches'),
      }),
    },
    async ({remote, prune}) => {
      await logAction('git', 'fetch', {remote, prune})
      const result = await runCommand('git', ['fetch', ...(prune ? ['--prune'] : []), remote])
      return {
        content: [{
          type: 'text',
          text: result.ok ? result.stdout || 'git fetch выполнен успешно' : result.stderr || result.stdout,
        }],
      }
    },
  )

  // --- pull ---
  server.registerTool(
    'git_pull',
    {
      description: 'Fetch and integrate changes from a remote repository using git pull',
      annotations: {readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true},
      inputSchema: z.object({
        remote: z.string().default('origin').describe('Удалённый репозиторий'),
        branch: z.string().optional().describe('Ветка. Если не указана, используется upstream текущей ветки'),
        strategy: z.enum(['merge', 'rebase', 'ff-only']).default('merge').describe('Способ интеграции изменений'),
      }),
    },
    async ({remote, branch, strategy}) => {
      await logAction('git', 'pull', {remote, branch, strategy})
      const strategyArg = strategy === 'rebase' ? '--rebase' : strategy === 'ff-only' ? '--ff-only' : '--no-rebase'
      const result = await runCommand('git', ['pull', strategyArg, remote, ...(branch ? [branch] : [])])
      return {
        content: [{
          type: 'text',
          text: result.ok ? result.stdout || 'git pull выполнен успешно' : result.stderr || result.stdout,
        }],
      }
    },
  )

  // --- push ---
  server.registerTool(
    'git_push',
    {
      description: 'Push local commits to a remote repository using git push',
      annotations: {readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true},
      inputSchema: z.object({
        remote: z.string().default('origin').describe('Удалённый репозиторий'),
        branch: z.string().optional().describe('Ветка. Если не указана, используется upstream текущей ветки'),
        setUpstream: z.boolean().default(false).describe('Set the branch upstream (-u)'),
      }),
    },
    async ({remote, branch, setUpstream}) => {
      await logAction('git', 'push', {remote, branch, setUpstream})
      const result = await runCommand('git', [
        'push',
        ...(setUpstream ? ['--set-upstream'] : []),
        remote,
        ...(branch ? [branch] : []),
      ])
      return {
        content: [{
          type: 'text',
          text: result.ok ? result.stdout || 'git push выполнен успешно' : result.stderr || result.stdout,
        }],
      }
    },
  )

  // --- commit ---
  server.registerTool(
    'git_commit',
    {
      description:
        'Create a commit. If files are provided, stage them first; otherwise commit only already staged changes',
      annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false},
      inputSchema: z.object({
        message: z.string().min(1).describe('Commit message'),
        files: z.array(z.string()).optional().describe(
          'Files to stage before committing. If omitted, commit only staged changes',
        ),
      }),
    },
    async ({message, files}) => {
      await logAction('git', 'commit', {message, files})

      if (files?.length) {
        const paths = gitPaths(files)
        const add = await runCommand('git', ['add', '--', ...paths])
        if (!add.ok) {
          return {content: [{type: 'text', text: `git add failed:\\n${add.stderr || add.stdout}`}]}
        }
      }

      const commit = await runCommand('git', ['commit', '-m', message])
      return {
        content: [{
          type: 'text',
          text: commit.ok
            ? `Коммит создан:\\n${commit.stdout}`
            : `Ошибка коммита:\\n${commit.stderr || commit.stdout}`,
        }],
      }
    },
  )
}
