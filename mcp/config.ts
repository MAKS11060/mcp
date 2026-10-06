import {readFile} from 'node:fs/promises'
import {dirname, isAbsolute, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {pathExists} from './utils/path.ts'

export interface McpConfig {
  name?: string
  version?: string
  plugins?: string[]
}

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

  const config = JSON.parse(await readFile(configPath, 'utf8')) as McpConfig

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
