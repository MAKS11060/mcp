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

export async function registerDprintTools(server: McpServer) {
  const bins = await getAvailableBins(['dprint'])

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
