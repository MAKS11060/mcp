import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import type {McpConfig} from '../config.ts'
import {loadPlugins} from '../plugins.ts'

export async function createMcpServer(
  config: McpConfig = {},
  context = {cwd: Deno.cwd(), configPath: '.mcp.json'},
) {
  const serverConfig = config.config ?? {}

  const server = new McpServer({
    name: serverConfig.name ?? 'mcp',
    version: serverConfig.version ?? '1.0.0',
    ...serverConfig,
  })

  await loadPlugins(server, config, context)

  return server
}
