import {StreamableHTTPTransport} from '@hono/mcp'
import {Hono} from 'hono'
import {logger} from 'hono/logger'
import {loadConfig} from '../config.ts'
import {createMcpServer, name} from './create-server.ts'

const MCP_SECRET_PATH = Deno.env.get('MCP_SECRET_PATH') || '10d9153d'
const PORT = Number(Deno.env.get('PORT')) || 8787
export const MCP_PATH = `/mcp/${MCP_SECRET_PATH}`

export async function startServer(configFile?: string) {
  const cwd = Deno.cwd()
  const {config, configPath} = await loadConfig(cwd, configFile)

  const app = new Hono()

  app.all(MCP_PATH, async (c) => {
    const mcpServer = await createMcpServer(config, {cwd, configPath})
    const transport = new StreamableHTTPTransport()

    await mcpServer.connect(transport)
    return transport.handleRequest(c)
  })

  app.use(logger())

  const useTls = Deno.env.has('KEY') && Deno.env.has('CERT')

  if (useTls) {
    const key = Deno.readTextFileSync(Deno.env.get('KEY')!)
    const cert = Deno.readTextFileSync(Deno.env.get('CERT')!)
    Deno.serve({port: PORT, key, cert}, app.fetch)
  } else {
    Deno.serve({port: PORT}, app.fetch)
  }

  const scheme = useTls ? 'https' : 'http'
  const host = Deno.env.get('MCP_HOST') ?? 'localhost'

  console.log(`${scheme}://${host}:${PORT}`)
  console.log(`${scheme}://${host}:${PORT}${MCP_PATH}?t=${Math.floor(Date.now() / 1000)}  ${name}`)
}
