import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import type {McpConfig} from '../config.ts'
import {loadPlugins} from '../plugins.ts'

export const name = 'mcp'
export const version = '1.0.0'

export async function createMcpServer(
  config: McpConfig = {},
  context = {cwd: Deno.cwd(), configPath: '.mcp.json'},
) {
  const server = new McpServer({
    name: config.name ?? name,
    version: config.version ?? version,
  })

  await loadPlugins(server, config, context)

  return server
}
