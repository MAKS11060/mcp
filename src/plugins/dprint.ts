import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {z} from 'zod'
import {getAvailableBins, hasBin, isLocalBin} from '../utils/bins.ts'
import {runBin, runCommand} from '../utils/exec.ts'
import {logAction} from '../utils/logger.ts'

async function runToolBin(bin: string, args: string[], timeout?: number) {
  const bins = await getAvailableBins([bin])
  if (isLocalBin(bins, bin)) {
    return runBin(bin, args, {timeout, env: {NO_COLOR: '1'}})
  }
  // глобальная команда
  return runCommand(bin, args, {timeout, env: {NO_COLOR: '1'}})
}

export async function registerDprintTools(server: McpServer) {
  const bins = await getAvailableBins(['dprint'])

  // --- dprint_check ---
  if (hasBin(bins, 'dprint')) {
    server.registerTool(
      'dprint_check',
      {
        description: 'Check files for formatting issues using dprint',
        annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
        inputSchema: z.object({
          files: z.array(z.string()).optional().describe('Specific files to check (optional)'),
          json: z.boolean().default(false).describe('Output results as JSON'),
          maxOutput: z.number().int().min(1).max(2000).default(200).describe(
            'Maximum number of output lines to return',
          ),
        }),
      },
      async ({files, json, maxOutput}) => {
        await logAction('code', 'dprint_check', {files, json, maxOutput})

        const args = ['check']
        if (json) args.push('--json')
        if (files?.length) args.push(...files)

        const result = await runToolBin('dprint', args)
        const output = result.stdout || result.stderr
        const lines = output.split('\n')
        const truncated = lines.length > maxOutput

        return {
          content: [{
            type: 'text',
            text: result.ok
              ? '✓ Форматирование в порядке'
              : `${lines.slice(0, maxOutput).join('\n')}${
                truncated ? `\n\n... output truncated (${lines.length} lines total)` : ''
              }`,
          }],
        }
      },
    )

    // --- dprint_fmt ---
    server.registerTool(
      'dprint_fmt',
      {
        description: 'Format files using dprint',
        annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false},
        inputSchema: z.object({
          files: z.array(z.string()).optional().describe('Specific files to format'),
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
