import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
import {z} from 'zod'

const server = new McpServer({name: 'proxy-test', version: '1.0.0'})

server.registerTool('echo', {
  inputSchema: {message: z.string()},
}, async ({message}) => ({
  content: [{type: 'text', text: message}],
}))

await server.connect(new StdioServerTransport())
