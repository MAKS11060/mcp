import {appendFile} from 'node:fs/promises'

let enabled = true
let logFile: string | undefined = process.env.MCP_LOG_FILE

const colors = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
} as const

const categoryColors = {
  fs: colors.cyan,
  git: colors.green,
  code: colors.yellow,
  system: colors.gray,
} as const

export function configureLogger(options: {enabled?: boolean; file?: string}) {
  enabled = options.enabled ?? true
  logFile = options.file
}

export async function logAction(
  category: keyof typeof categoryColors,
  action: string,
  details?: Record<string, unknown>,
) {
  if (!enabled) return

  const suffix = details ? ` ${JSON.stringify(details)}` : ''
  const line = `[${category}] ${action}${suffix}`
  const color = categoryColors[category]

  if (logFile) {
    try {
      await appendFile(logFile, `${line}\n`, 'utf-8')
    } catch (error) {
      console.error(`${colors.red}Failed to write MCP log:${colors.reset}`, error)
    }
  }

  console.log(`${color}${line}${colors.reset}`)
}
