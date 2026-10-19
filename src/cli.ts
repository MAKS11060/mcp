#!/usr/bin/env -S deno run -A

import {mkdir, writeFile} from 'node:fs/promises'
import {dirname} from 'node:path'
import process from 'node:process'
import {parseArgs} from 'node:util'
import {DEFAULT_CONFIG, DEFAULT_MCP_CONFIG, loadConfig, type McpConfig} from './config.ts'
import {startServer} from './core/server.ts'

const args = [...process.argv.slice(2)]
const envFileIndex = args.indexOf('--env-file')
const envFileRequested = args.some((arg) => arg === '--env-file' || arg.startsWith('--env-file='))

if (envFileIndex !== -1 && (!args[envFileIndex + 1] || args[envFileIndex + 1].startsWith('--'))) {
  args[envFileIndex] = '--env-file=.env'
}

const {values, positionals} = parseArgs({
  args,
  options: {
    config: {type: 'string', short: 'c'},
    'env-file': {type: 'string'},
    init: {type: 'boolean'},
  },
  allowPositionals: true,
  strict: true,
})

const envKeys = ['PORT', 'HOST', 'CERT', 'KEY', 'MCP_PATH'] as const
const hasEnvOverrides = envKeys.some((key) => process.env[key] !== undefined)

if (values['env-file'] !== undefined || hasEnvOverrides) {
  try {
    process.loadEnvFile(values['env-file'] ?? '.env')
  } catch (error) {
    if (
      envFileRequested
      || !(error instanceof Error && 'code' in error && error.code === 'ENOENT')
    ) {
      throw error
    }
  }
}

const command = positionals[0]
const configFile = values.config ?? DEFAULT_CONFIG

if (command === 'init' || values.init) {
  const cwd = Deno.cwd()
  const {configPath} = await loadConfig(cwd, configFile)

  try {
    await Deno.stat(configPath)
    console.error(`Configuration already exists: ${configPath}`)
    Deno.exit(1)
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error
  }

  const mcpPath = `/mcp/${crypto.getRandomValues(new Uint8Array(5)).toHex()}`
  const port = 443
  const name = cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? 'mcp'

  const config = {
    ...DEFAULT_MCP_CONFIG,
    mcp: {
      ...DEFAULT_MCP_CONFIG.mcp,
      path: mcpPath,
    },
    server: {
      ...DEFAULT_MCP_CONFIG.server,
      port,
    },
    config: {
      ...DEFAULT_MCP_CONFIG.config,
      name,
      title: name,
    },
  } satisfies McpConfig

  await mkdir(dirname(configPath), {recursive: true})
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n')
  console.log(`Configuration created: ${configPath}`)
  Deno.exit(0)
}

await startServer(configFile)
