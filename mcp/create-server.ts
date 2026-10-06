import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {registerCodeQualityTools} from './tools/code-quality.ts'
import {registerFsTools} from './tools/fs.ts'
import {registerGitTools} from './tools/git.ts'
import {registerRunScriptTools} from './tools/run-script.ts'

export const name = 'project-mcp'

export async function createMcpServer() {
  const server = new McpServer({
    name,
    version: '1.2.0',
  })

  registerFsTools(server)
  registerGitTools(server)
  registerRunScriptTools(server)
  await registerCodeQualityTools(server)

  return server
}
