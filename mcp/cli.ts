#!/usr/bin/env -S deno run -A

import {parseArgs} from 'node:util'
import {startServer} from './core/server.ts'

const {values} = parseArgs({
  options: {
    config: {type: 'string', short: 'c'},
  },
  strict: true,
})

await startServer(values.config)
