import {StreamableHTTPTransport} from '@hono/mcp'
import {Hono} from 'hono'
import {mkdir} from 'node:fs/promises'
import {dirname, resolve} from 'node:path'
import process from 'node:process'
import {loadConfig} from '../config.ts'
import {configureLogger} from '../utils/logger.ts'
import {getProjectRoot} from '../utils/path.ts'
import {createMcpServer} from './create-server.ts'

export async function startServer(configFile?: string) {
  const cwd = Deno.cwd()
  const {config, configPath} = await loadConfig(cwd, configFile)

  const serverConfig = config.server ?? {}
  const mcpConfig = config.mcp ?? {}
  const port = process.env.PORT !== undefined
    ? Number(process.env.PORT)
    : serverConfig.port ?? 8787
  const host = process.env.HOST ?? serverConfig.host ?? '0.0.0.0'
  const configuredMcpPath = process.env.MCP_PATH ?? mcpConfig.path ?? '/mcp'
  const mcpPath = configuredMcpPath.startsWith('/') ? configuredMcpPath : `/${configuredMcpPath}`

  const logFile = mcpConfig.log === 'file'
    ? resolve(dirname(configPath), mcpConfig.log_path ?? '.mcp/mcp.log')
    : undefined

  if (logFile) {
    await mkdir(dirname(logFile), {recursive: true})
  }

  configureLogger({
    enabled: mcpConfig.log === 'file' ? true : mcpConfig.log ?? true,
    file: logFile,
  })

  const app = new Hono()
  if (serverConfig.log ?? true) {
    app.use(async (c, next) => {
      await next()
      console.log(
        `%c[http] %c${c.res.status} %c${c.req.method} %c${c.req.path}`,
        'color: orange',
        c.res.ok ? 'color: green' : 'color: red',
        'color: lime',
        'color: orange',
      )
    })
  }

  app.all(mcpPath, async (c) => {
    const mcpServer = await createMcpServer(config, {cwd, configPath})
    const transport = new StreamableHTTPTransport()

    await mcpServer.connect(transport)
    return transport.handleRequest(c)
  })

  const keyPath = process.env.KEY ?? serverConfig.key
  const certPath = process.env.CERT ?? serverConfig.cert

  if (Boolean(keyPath) !== Boolean(certPath)) {
    throw new Error('server.key and server.cert must be provided together')
  }

  const useTls = Boolean(keyPath && certPath)

  const onListen = (addr: Deno.NetAddr) => {
    const scheme = useTls ? 'https' : 'http'
    const endpoint = new URL(`${scheme}://${addr.hostname}:${addr.port}${mcpPath}`)
    endpoint.searchParams.set('t', String(Math.floor(Date.now() / 1000)))
    console.log(`${endpoint.href} | ${config.config?.name ?? 'mcp'}`)

    console.log(`Project root %c${getProjectRoot()}`, 'color: green')
  }

  if (useTls) {
    const key = Deno.readTextFileSync(resolve(dirname(configPath), keyPath!))
    const cert = Deno.readTextFileSync(resolve(dirname(configPath), certPath!))
    Deno.serve({
      onListen,
      hostname: host,
      port,
      key,
      cert,
    }, app.fetch)
  } else {
    Deno.serve({
      onListen,
      hostname: host,
      port,
    }, app.fetch)
  }
}
