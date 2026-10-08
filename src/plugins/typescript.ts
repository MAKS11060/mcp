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

export async function registerTypescriptTools(server: McpServer) {
  const bins = await getAvailableBins(['tsc'])

  // --- typecheck ---
  if (hasBin(bins, 'tsc')) {
    server.registerTool(
      'typecheck',
      {
        description: 'Run tsc --noEmit using the project package manager or a binary available on PATH',
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
}
