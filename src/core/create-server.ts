import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import type {McpConfig} from '../config.ts'
import {loadPlugins} from '../plugins.ts'

export const name = 'mcp'
export const version = '1.0.0'

export async function createMcpServer(
  config: McpConfig = {},
  context = {cwd: Deno.cwd(), configPath: '.mcp.json'},
) {
  const serverConfig = config.config ?? {}

  const server = new McpServer({
    name: serverConfig.name ?? name,
    version: serverConfig.version ?? version,
    ...serverConfig,
  })

  await loadPlugins(server, config, context)

  return server
}
