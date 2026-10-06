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
      description: 'Показывает git status --short и проверяет наличие репозитория',
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
      description: 'Показывает изменения в рабочем дереве или staged-изменения',
      annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
      inputSchema: z.object({
        staged: z.boolean().default(false).describe('Показывать staged-изменения'),
        files: z.array(z.string()).optional().describe('Только указанные файлы'),
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
      description: 'Показывает содержимое commit или его diff',
      annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
      inputSchema: z.object({
        commit: z.string().default('HEAD').describe('Commit, например HEAD, HEAD~1 или hash'),
        files: z.array(z.string()).optional().describe('Ограничить указанными файлами'),
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
      description: 'Инициализирует git-репозиторий (git init), если его ещё нет',
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
      description: 'Показывает последние коммиты',
      annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
      inputSchema: z.object({
        limit: z.number().min(1).max(50).default(10).describe('Количество коммитов'),
        file: z.string().optional().describe('Показывать историю только указанного файла'),
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
      description: 'Добавляет файлы в индекс (git add). Без files — git add .',
      annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false},
      inputSchema: z.object({
        files: z.array(z.string()).optional().describe(
          'Список относительных путей. Если не указан — добавляет всё (.)',
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

  // --- commit ---
  server.registerTool(
    'git_commit',
    {
      description:
        'Создаёт коммит. Если передан files — сначала git add этих файлов, иначе коммитит уже проиндексированное (без add .).',
      annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false},
      inputSchema: z.object({
        message: z.string().min(1).describe('Сообщение коммита'),
        files: z.array(z.string()).optional().describe(
          'Файлы для git add перед коммитом. Если не указаны — только staged изменения',
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
