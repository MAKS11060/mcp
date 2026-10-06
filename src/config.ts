import {readFile} from 'node:fs/promises'
import {dirname, isAbsolute, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {z} from 'zod'
import {pathExists} from './utils/path.ts'

const McpServerConfigSchema = z.object({
  name: z.string().optional(),
  version: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  websiteUrl: z.string().url().optional(),
  icons: z.array(z.object({
    src: z.url(),
    mimeType: z.string().optional(),
    sizes: z.array(z.string()).optional(),
    theme: z.enum(['light', 'dark']).optional(),
  })).optional(),
})

export const McpConfigSchema = z.object({
  $schema: z.string().optional(),
  config: McpServerConfigSchema.optional(),
  plugins: z.array(z.string()).optional(),
})

export type McpConfig = z.infer<typeof McpConfigSchema>

export const mcpConfigJsonSchema = z.toJSONSchema(McpConfigSchema)

export const DEFAULT_CONFIG = '.mcp.json'

export const DEFAULT_MCP_CONFIG: McpConfig = {
  $schema: 'https://raw.githubusercontent.com/MAKS11060/mcp/main/schema/mcp.schema.json',
  config: {},
  plugins: ['fs', 'git', 'run-script', 'code-quality'],
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
