import {Hono} from 'hono'
import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {McpConfigSchema} from '../src/config.ts'
import {McpProxyManager} from '../src/core/proxy.ts'

Deno.test('mcpServers accepts stdio configuration with optional authentication', () => {
  const config = McpConfigSchema.parse({
    mcpServers: {
      'vscode-mcp': {
        command: 'npx',
        args: ['-y', '@vscode-mcp/vscode-mcp-server@latest'],
      },
    },
  })

  assert.equal(config.mcpServers?.['vscode-mcp'].auth, undefined)
})

Deno.test('mcpServers validates token authentication', () => {
  assert.throws(() =>
    McpConfigSchema.parse({
      mcpServers: {
        example: {
          command: 'node',
          auth: {type: 'token'},
        },
      },
    })
  )
})

Deno.test('MCP proxy rejects requests with an invalid bearer token', async () => {
  const app = new Hono()
  const manager = new McpProxyManager({
    example: {
      command: 'unused',
      auth: {type: 'token', token: 'secret'},
    },
  }, Deno.cwd())

  manager.register(app)

  const response = await app.request('/mcp/example', {method: 'GET'})

  assert.equal(response.status, 401)
  assert.equal(response.headers.get('www-authenticate'), 'Bearer')

  await manager.close()
})

Deno.test('MCP proxy does not start a process for a request without a session', async () => {
  const app = new Hono()
  const manager = new McpProxyManager({
    example: {
      command: 'unused',
      auth: {type: 'token', token: 'secret'},
    },
  }, Deno.cwd())

  manager.register(app)

  const response = await app.request('/mcp/example', {
    method: 'GET',
    headers: {authorization: 'Bearer secret'},
  })

  assert.equal(response.status, 400)

  await manager.close()
})

Deno.test('MCP proxy forwards Streamable HTTP requests to a stdio server', async () => {
  const app = new Hono()
  const fixturePath = fileURLToPath(new URL('./fixtures/stdio-mcp.ts', import.meta.url))
  const manager = new McpProxyManager({
    echo: {
      command: Deno.execPath(),
      args: ['run', '-A', fixturePath],
    },
  }, Deno.cwd())

  manager.register(app)

  const headers = {
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json',
  }

  try {
    const initialize = await app.request('/mcp/echo', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: {name: 'proxy-test-client', version: '1.0.0'},
        },
      }),
    })

    assert.equal(initialize.status, 200)
    const sessionId = initialize.headers.get('mcp-session-id')
    assert.ok(sessionId)

    const listTools = await app.request('/mcp/echo', {
      method: 'POST',
      headers: {...headers, 'mcp-session-id': sessionId!},
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }),
    })

    assert.equal(listTools.status, 200)
    const listBody = await listTools.text()
    assert.match(listBody, /"name":"echo"/)

    const callTool = await app.request('/mcp/echo', {
      method: 'POST',
      headers: {...headers, 'mcp-session-id': sessionId!},
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {name: 'echo', arguments: {message: 'proxied'}},
      }),
    })

    assert.equal(callTool.status, 200)
    assert.match(await callTool.text(), /proxied/)
  } finally {
    await manager.close()
  }
})
