import {StreamableHTTPTransport} from '@hono/mcp'
import {Hono} from 'hono'
import {mkdir} from 'node:fs/promises'
import {dirname, resolve} from 'node:path'
import {loadConfig} from '../config.ts'
import {configureLogger} from '../utils/logger.ts'
import {createMcpServer, name} from './create-server.ts'
import {getProjectRoot} from '../utils/path.ts'

export async function startServer(configFile?: string) {
  const cwd = Deno.cwd()
  const {config, configPath} = await loadConfig(cwd, configFile)

  const serverConfig = config.server ?? {}
  const mcpConfig = config.mcp ?? {}
  const port = serverConfig.port ?? (Number(Deno.env.get('PORT')) || 8787)
  const host = serverConfig.host ?? Deno.env.get('MCP_HOST') ?? '0.0.0.0'
  const mcpPath = mcpConfig.path ?? Deno.env.get('MCP_PATH') ?? '/mcp'

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

  const keyPath = serverConfig.key ?? Deno.env.get('KEY')
  const certPath = serverConfig.cert ?? Deno.env.get('CERT')

  if (Boolean(keyPath) !== Boolean(certPath)) {
    throw new Error('server.key и server.cert должны быть указаны вместе')
  }

  const useTls = Boolean(keyPath && certPath)

  const onListen = (addr: Deno.NetAddr) => {
    const scheme = useTls ? 'https' : 'http'
    console.log(`${scheme}://${addr.hostname}:${addr.port}`)
    console.log(`${scheme}://${addr.hostname}:${addr.port}${mcpPath}?t=${Math.floor(Date.now() / 1000)} | ${name}`)

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
