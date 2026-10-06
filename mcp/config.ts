import {readFile} from 'node:fs/promises'
import {dirname, isAbsolute, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {z} from 'zod'
import {pathExists} from './utils/path.ts'

export const McpConfigSchema = z.object({
  $schema: z.string().optional(),
  name: z.string().optional(),
  version: z.string().optional(),
  plugins: z.array(z.string()).optional(),
})

export type McpConfig = z.infer<typeof McpConfigSchema>

export const mcpConfigJsonSchema = z.toJSONSchema(McpConfigSchema)

const DEFAULT_CONFIG = '.mcp.json'

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
