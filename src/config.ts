import {readFile} from 'node:fs/promises'
import {basename, dirname, isAbsolute, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {z} from 'zod'
import {pathExists} from './utils/path.ts'

const McpServerConfigSchema = z.object({
  name: z.string().optional(),
  version: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  websiteUrl: z.url().optional(),
  icons: z.array(z.object({
    src: z.url(),
    mimeType: z.string().optional(),
    sizes: z.array(z.string()).optional(),
    theme: z.enum(['light', 'dark']).optional(),
  })).optional(),
})

export const McpServerOptionsSchema = z.object({
  host: z.string().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  cert: z.string().optional(),
  key: z.string().optional(),
  log: z.boolean().optional(),
})

export const McpOptionsSchema = z.object({
  path: z.string().optional(),
  log: z.union([z.boolean(), z.literal('file')]).optional(),
  log_path: z.string().optional(),
})

export const McpConfigSchema = z.object({
  $schema: z.string().optional(),
  server: McpServerOptionsSchema.optional(),
  mcp: McpOptionsSchema.optional(),
  config: McpServerConfigSchema.optional(),
  plugins: z.array(z.string()).optional(),
})

export type McpConfig = z.infer<typeof McpConfigSchema>

export const mcpConfigJsonSchema = z.toJSONSchema(McpConfigSchema)

export const DEFAULT_CONFIG = '.mcp.json'

export const DEFAULT_MCP_CONFIG: McpConfig = {
  $schema: 'https://raw.githubusercontent.com/MAKS11060/mcp/main/schema/mcp.schema.json',
  server: {
    log: true,
  },
  mcp: {
    log: true,
  },
  config: {
    version: '1.0.0',
    name: basename(process.cwd()),
    title: basename(process.cwd()),
  },
  plugins: ['fs', 'git', 'package-json', 'typescript', 'dprint'],
}

export async function loadConfig(cwd: string, configFile = DEFAULT_CONFIG) {
  const configPath = isAbsolute(configFile)
    ? configFile
    : resolve(cwd, configFile)

  if (!(await pathExists(configPath))) {
    return {
      config: {} as McpConfig,
      configPath,
    }
  }

  const config = McpConfigSchema.parse(JSON.parse(await readFile(configPath, 'utf8')))

  return {
    config,
    configPath,
  }
}

export function resolvePluginPath(configPath: string, plugin: string) {
  if (plugin.startsWith('.') || plugin.startsWith('/')) {
    return pathToFileURL(resolve(dirname(configPath), plugin)).href
  }

  return plugin
}
