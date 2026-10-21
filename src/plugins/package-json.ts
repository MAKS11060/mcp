import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {readFile} from 'node:fs/promises'
import {dirname} from 'node:path'
import {z} from 'zod'
import {runCommand} from '../utils/exec.ts'
import {logAction} from '../utils/logger.ts'
import {detectPackageManager} from '../utils/package-manager.ts'
import {safeResolve} from '../utils/path.ts'

async function readPackageJson(packageJsonPath: string) {
  const fullPath = safeResolve(packageJsonPath)
  const raw = await readFile(fullPath, 'utf-8')
  const pkg = JSON.parse(raw) as {scripts?: Record<string, string>}
  return {fullPath, pkg}
}

export function registerPackageJsonTools(server: McpServer) {
  server.registerTool(
    'run_script',
    {
      description:
        'Run an npm script from a selected package.json through the detected package manager. Only existing scripts can be run',
      annotations: {readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true},
      inputSchema: z.object({
        script: z.string().min(1).describe('Script name from package.json'),
        packageJsonPath: z.string().default('package.json').describe(
          'Path to package.json, relative to the project root',
        ),
        args: z
          .array(z.string())
          .optional()
          .describe('Additional arguments passed after --'),
      }),
    },
    async ({script, packageJsonPath, args}) => {
      await logAction('code', 'run_script', {script, packageJsonPath, args})

      let fullPath: string
      let scripts: string[]
      try {
        const result = await readPackageJson(packageJsonPath)
        fullPath = result.fullPath
        scripts = Object.keys(result.pkg.scripts ?? {})
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Failed to read package.json at "${packageJsonPath}": ${
              error instanceof Error ? error.message : String(error)
            }`,
          }],
          isError: true,
        }
      }

      if (!scripts.includes(script)) {
        return {
          content: [{
            type: 'text',
            text: `Script "${script}" was not found in ${packageJsonPath}.\nAvailable scripts: ${
              scripts.join(', ') || '(none)'
            }`,
          }],
        }
      }

      const pm = await detectPackageManager()
      const cmdArgs = args?.length ? ['run', script, '--', ...args] : ['run', script]

      const result = await runCommand(pm, cmdArgs, {
        cwd: dirname(fullPath),
        timeout: 180_000,
      })

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
      description: 'List scripts defined in a selected package.json',
      annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
      inputSchema: z.object({
        packageJsonPath: z.string().default('package.json').describe(
          'Path to package.json, relative to the project root',
        ),
      }),
    },
    async ({packageJsonPath}) => {
      await logAction('code', 'list_scripts', {packageJsonPath})

      try {
        const {pkg} = await readPackageJson(packageJsonPath)
        const detail = Object.entries(pkg.scripts ?? {})
          .map(([name, command]) => `${name}: ${command}`)
          .join('\n')

        return {
          content: [{
            type: 'text',
            text: detail || '(no scripts defined)',
          }],
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Failed to read package.json at "${packageJsonPath}": ${
              error instanceof Error ? error.message : String(error)
            }`,
          }],
          isError: true,
        }
      }
    },
  )
}
