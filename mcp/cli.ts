#!/usr/bin/env -S deno run -A

import {startServer} from './core/server.ts'

const configIndex = Deno.args.indexOf('--config')
const configFile = configIndex >= 0 ? Deno.args[configIndex + 1] : undefined

if (configIndex >= 0 && !configFile) {
  throw new Error('--config requires a file path')
}

await startServer(configFile)
