import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {rm, writeFile} from 'node:fs/promises'
import {z} from 'zod'
import {getAvailableBins, hasBin, isLocalBin} from '../utils/bins.ts'
import {runBin, runCommand} from '../utils/exec.ts'
import {logAction} from '../utils/logger.ts'
import {safeResolve} from '../utils/path.ts'

async function runToolBin(bin: string, args: string[], timeout?: number) {
  const bins = await getAvailableBins([bin])
  if (isLocalBin(bins, bin)) {
    return runBin(bin, args, {timeout})
  }
  return runCommand(bin, args, {timeout})
}

export async function registerTypescriptTools(server: McpServer) {
  const bins = await getAvailableBins(['tsc'])

  if (hasBin(bins, 'tsc')) {
    server.registerTool(
      'typecheck',
      {
        description: 'Run TypeScript type checking using a tsconfig file and return structured diagnostics',
        annotations: {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false},
        inputSchema: z.object({
          maxOutput: z.number().int().min(1).max(2000).default(200).describe(
            'Maximum number of diagnostics to return',
          ),
          tsconfigPath: z.string().default('tsconfig.json').describe(
            'Path to the TypeScript configuration file, relative to the project root',
          ),
          files: z.array(z.string().min(1)).optional().describe(
            'Optionally check only these project-relative TypeScript files and their imports using the selected tsconfig options',
          ),
          path: z.string().optional().describe(
            'Only return diagnostics from files matching this path prefix, such as src/modules/adapters/**',
          ),
        }),
      },
      async ({maxOutput, tsconfigPath, files, path}) => {
        await logAction('code', 'typecheck', {maxOutput, tsconfigPath, files, path})

        const configPath = safeResolve(tsconfigPath)
        const args = ['--noEmit', '--pretty', 'false']
        let temporaryConfig: string | undefined

        if (files?.length) {
          const safeFiles = files.map((file) => {
            const fullPath = safeResolve(file)
            if (!/\.tsx?$/.test(fullPath)) throw new Error(`Not a TypeScript file: ${file}`)
            return fullPath
          })
          temporaryConfig = safeResolve(`.mcp-typecheck-${crypto.randomUUID()}.json`)
          await writeFile(
            temporaryConfig,
            JSON.stringify({
              extends: configPath,
              files: safeFiles,
              include: [],
            }),
            'utf-8',
          )
          args.push('--project', temporaryConfig)
        } else {
          args.push('--project', configPath)
        }

        let result
        try {
          result = await runToolBin('tsc', args, 120_000)
        } finally {
          if (temporaryConfig) {
            await rm(temporaryConfig, {force: true})
          }
        }

        const output = result.stderr || result.stdout
        const normalizedFilter = path?.replace(/\\/g, '/').replace(/\*\*$/, '')
        const diagnostics = result.ok ? [] : output.split('\n').filter(Boolean).map((line) => {
          const match = line.match(/^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/)
          return match
            ? {
              file: match[1].replace(/\\/g, '/'),
              line: Number(match[2]),
              column: Number(match[3]),
              code: match[4],
              message: match[5],
            }
            : {message: line}
        }).filter((diagnostic) => {
          if (!normalizedFilter || !('file' in diagnostic)) return true
          return diagnostic.file?.includes(normalizedFilter) ?? false
        })

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(
              {
                ok: result.ok,
                exitCode: result.code,
                totalErrors: diagnostics.length,
                truncated: diagnostics.length > maxOutput,
                errors: diagnostics.slice(0, maxOutput),
                ...(files?.length ? {checkedFiles: files} : {}),
                tsconfigPath,
                ...(path ? {pathFilter: path} : {}),
                ...(!result.ok && diagnostics.length === 0 ? {output: output.slice(0, 20_000)} : {}),
              },
              null,
              2,
            ),
          }],
        }
      },
    )
  }
}
