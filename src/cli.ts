#!/usr/bin/env -S deno run -A

import {mkdir, writeFile} from 'node:fs/promises'
import {dirname} from 'node:path'
import {parseArgs} from 'node:util'
import {DEFAULT_CONFIG, DEFAULT_MCP_CONFIG, loadConfig} from './config.ts'
import {startServer} from './core/server.ts'

const {values, positionals} = parseArgs({
  options: {
    config: {type: 'string', short: 'c'},
    init: {type: 'boolean'},
  },
  allowPositionals: true,
  strict: true,
})

const command = positionals[0]
const configFile = values.config ?? DEFAULT_CONFIG

if (command === 'init' || values.init) {
  const cwd = Deno.cwd()
  const {configPath} = await loadConfig(cwd, configFile)

  try {
    await Deno.stat(configPath)
    console.error(`Конфигурация уже существует: ${configPath}`)
    Deno.exit(1)
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error
  }

  await mkdir(dirname(configPath), {recursive: true})
  await writeFile(configPath, JSON.stringify(DEFAULT_MCP_CONFIG, null, 2) + '\\n')
  console.log(`Создана конфигурация: ${configPath}`)
  Deno.exit(0)
}

await startServer(configFile)
