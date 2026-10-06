import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'
import {getAvailableBins, hasBin, isLocalBin} from '../utils/bins.ts'
import {runBin, runCommand} from '../utils/exec.ts'
import {logAction} from '../utils/logger.ts'

async function runToolBin(bin: string, args: string[], timeout?: number) {
  const bins = await getAvailableBins([bin])
  if (isLocalBin(bins, bin)) {
    return runBin(bin, args, {timeout})
  }
  // глобальная команда
  return runCommand(bin, args, {timeout})
}

export async function registerCodeQualityTools(server: McpServer) {
  const bins = await getAvailableBins(['tsc', 'dprint'])

  // --- typecheck ---
  if (hasBin(bins, 'tsc')) {
    server.registerTool(
      'typecheck',
      {
        description: 'tsc --noEmit (через package manager или PATH)',
        annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
        inputSchema: z.object({}),
      },
      async () => {
        await logAction('code', 'typecheck')
        const result = await runToolBin('tsc', ['--noEmit'], 120_000)

        if (result.ok) {
          return {content: [{type: 'text', text: '✓ Ошибок типов нет'}]}
        }

        return {
          content: [{
            type: 'text',
            text: `Ошибки TypeScript:\n\n${result.stderr || result.stdout}`,
          }],
        }
      },
    )
  }

  // --- dprint_check ---
  if (hasBin(bins, 'dprint')) {
    server.registerTool(
      'dprint_check',
      {
        description: 'dprint check (можно указать конкретные файлы)',
        annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
        inputSchema: z.object({
          files: z.array(z.string()).optional().describe('Конкретные файлы (опционально)'),
          json: z.boolean().default(false).describe('Вывод в JSON'),
        }),
      },
      async ({files, json}) => {
        await logAction('code', 'dprint_check', {files, json})

        const args = ['check']
        if (json) args.push('--json')
        if (files?.length) args.push(...files)

        const result = await runToolBin('dprint', args)

        return {
          content: [{
            type: 'text',
            text: result.ok
              ? '✓ Форматирование в порядке'
              : (result.stdout || result.stderr),
          }],
        }
      },
    )

    // --- dprint_fmt ---
    server.registerTool(
      'dprint_fmt',
      {
        description: 'dprint fmt (можно указать конкретные файлы)',
        annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false},
        inputSchema: z.object({
          files: z.array(z.string()).optional().describe('Конкретные файлы'),
        }),
      },
      async ({files}) => {
        await logAction('code', 'dprint_fmt', {files})

        const args = ['fmt']
        if (files?.length) args.push(...files)

        const result = await runToolBin('dprint', args)

        return {
          content: [{
            type: 'text',
            text: result.ok
              ? `✓ Отформатировано${files?.length ? `: ${files.join(', ')}` : ''}`
              : (result.stderr || result.stdout),
          }],
        }
      },
    )
  }
}
