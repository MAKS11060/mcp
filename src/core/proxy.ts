import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js'
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import {resolve} from 'node:path'
import type {McpStdioServerConfig} from '../config.ts'

type ProxySession = {
  transport: WebStandardStreamableHTTPServerTransport
  clientTransport: StdioClientTransport
  close: () => Promise<void>
}

export class McpProxyManager {
  private readonly sessions = new Map<string, ProxySession>()
  private readonly activeSessions = new Set<ProxySession>()

  constructor(
    private readonly servers: Record<string, McpStdioServerConfig>,
    private readonly configDir: string,
  ) {}

  register(app: {all: (path: string, handler: (context: any) => Promise<Response>) => unknown}) {
    for (const [key, config] of Object.entries(this.servers)) {
      const path = `/mcp/${key}`

      app.all(path, async (context) => {
        if (!this.authorized(context.req.raw, config)) {
          return context.json({error: 'Unauthorized'}, 401, {
            'WWW-Authenticate': 'Bearer',
          })
        }

        const sessionId = context.req.header('mcp-session-id')
        let session = sessionId ? this.sessions.get(sessionId) : undefined

        if (sessionId && !session) {
          return context.json({error: 'Session not found'}, 404)
        }

        const isNewSession = !session

        if (!session) {
          if (context.req.method !== 'POST') {
            return context.json({error: 'MCP session is not initialized'}, 400)
          }

          try {
            session = await this.createSession(key, config)
          } catch (error) {
            console.error(`[mcp] Failed to start ${key}:`, error)
            return context.json({error: `Failed to start MCP server: ${key}`}, 502)
          }
        }

        const response = await session.transport.handleRequest(context.req.raw)

        if (isNewSession && !session.transport.sessionId) {
          await session.close()
        }

        return response
      })
    }
  }

  async close() {
    await Promise.all([...this.activeSessions].map((session) => session.close()))
    this.sessions.clear()
    this.activeSessions.clear()
  }

  private authorized(request: Request, config: McpStdioServerConfig) {
    if (!config.auth || config.auth.type === 'none') return true

    const authorization = request.headers.get('authorization')
    if (!authorization?.startsWith('Bearer ')) return false

    const provided = authorization.slice(7)
    const expected = config.auth.token

    if (provided.length !== expected.length) return false

    let mismatch = 0
    for (let i = 0; i < expected.length; i++) {
      mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
    }

    return mismatch === 0
  }

  private async createSession(
    key: string,
    config: McpStdioServerConfig,
  ): Promise<ProxySession> {
    let sessionId: string | undefined
    let closed = false

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (id) => {
        sessionId = id
        this.sessions.set(id, session)
      },
      onsessionclosed: async (id) => {
        this.sessions.delete(id)
        await session?.close()
      },
    })

    const clientTransport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env,
      cwd: config.cwd ? resolve(this.configDir, config.cwd) : undefined,
      stderr: 'inherit',
    })

    const session: ProxySession = {
      transport,
      clientTransport,
      close: async () => {
        if (closed) return
        closed = true
        if (sessionId) this.sessions.delete(sessionId)
        this.activeSessions.delete(session)
        await Promise.allSettled([
          clientTransport.close(),
          transport.close(),
        ])
      },
    }

    transport.onmessage = (message) => {
      void clientTransport.send(message).catch((error) => {
        console.error(`[mcp] Proxy request failed (${key}):`, error)
      })
    }

    clientTransport.onmessage = (message) => {
      void transport.send(message).catch((error) => {
        console.error(`[mcp] Proxy response failed (${key}):`, error)
      })
    }

    clientTransport.onerror = (error) => {
      console.error(`[mcp] Child process error (${key}):`, error)
    }

    clientTransport.onclose = () => {
      void session.close()
    }

    this.activeSessions.add(session)

    try {
      await clientTransport.start()
      await transport.start()
    } catch (error) {
      await session.close()
      throw error
    }

    return session
  }
}
