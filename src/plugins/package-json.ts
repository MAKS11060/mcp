import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {z} from 'zod'
import {runCommand} from '../utils/exec.ts'
import {logAction} from '../utils/logger.ts'
import {detectPackageManager} from '../utils/package-manager.ts'
import {getProjectRoot} from '../utils/path.ts'

async function listScripts(): Promise<string[]> {
  try {
    const raw = await readFile(join(getProjectRoot(), 'package.json'), 'utf-8')
    const pkg = JSON.parse(raw) as {scripts?: Record<string, string>}
    return Object.keys(pkg.scripts ?? {})
  } catch {
    return []
  }
}

export function registerPackageJsonTools(server: McpServer) {
  server.registerTool(
    'run_script',
    {
      description:
        'Run an npm script from package.json through the detected package manager. Only existing scripts can be run',
      annotations: {readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true},
      inputSchema: z.object({
        script: z.string().min(1).describe('Script name from package.json'),
        args: z
          .array(z.string())
          .optional()
          .describe('Additional arguments passed after --'),
      }),
    },
    async ({script, args}) => {
      await logAction('code', 'run_script', {script, args})

      const scripts = await listScripts()
      if (!scripts.includes(script)) {
        return {
          content: [{
            type: 'text',
            text: `Script "${script}" was not found in package.json.\nAvailable scripts: ${
              scripts.join(', ') || '(none)'
            }`,
          }],
        }
      }

      const pm = await detectPackageManager()
      const cmdArgs = args?.length ? ['run', script, '--', ...args] : ['run', script]

      const result = await runCommand(pm, cmdArgs, {timeout: 180_000})

      return {
        content: [{
          type: 'text',
          text: result.ok
            ? (result.stdout || result.all || `✓ ${pm} run ${script}`)
            : `Command failed (${result.code}):\n${result.stderr || result.stdout || result.all}`,
        }],
      }
    },
  )

  server.registerTool(
    'list_scripts',
    {
      description: 'List scripts defined in package.json',
      annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
      inputSchema: z.object({}),
    },
    async () => {
      const scripts = await listScripts()
      let detail = ''
      try {
        const raw = await readFile(join(getProjectRoot(), 'package.json'), 'utf-8')
        const pkg = JSON.parse(raw) as {scripts?: Record<string, string>}
        detail = Object.entries(pkg.scripts ?? {})
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n')
      } catch {
        detail = scripts.join('\n')
      }

      return {
        content: [{
          type: 'text',
          text: detail || '(no scripts defined)',
        }],
      }
    },
  )
}
