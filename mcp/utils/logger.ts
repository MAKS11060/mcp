import {appendFile} from 'node:fs/promises'
import {join} from 'node:path'

const LOG_FILE = process.env.MCP_LOG_FILE // например "./mcp-actions.log"

export async function logAction(
  category: 'fs' | 'git' | 'code' | 'system',
  action: string,
  details?: Record<string, unknown>,
) {
  const timestamp = new Date().toISOString()
  const line = `[${timestamp}] [${category}] ${action}${details ? ' ' + JSON.stringify(details) : ''}\n`

  // В консоль всегда
  console.log(line.trim())

  // В файл — если указан
  if (LOG_FILE) {
    try {
      await appendFile(LOG_FILE, line, 'utf-8')
    } catch (err) {
      console.error('Failed to write MCP log:', err)
    }
  }
}
