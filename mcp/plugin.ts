import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'

export interface McpPluginContext {
  cwd: string
  configPath: string
}

export interface McpPlugin {
  name: string
  register(server: McpServer, context: McpPluginContext): void | Promise<void>
}
