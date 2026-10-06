import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {resolvePluginPath} from './config.ts'
import type {McpConfig} from './config.ts'
import type {McpPlugin, McpPluginContext} from './plugin.ts'
import {registerDprintTools} from './plugins/dprint.ts'
import {registerFsTools} from './plugins/fs.ts'
import {registerGitTools} from './plugins/git.ts'
import {registerPackageJsonTools} from './plugins/package-json.ts'
import {registerTypescriptTools} from './plugins/typescript.ts'

const builtinPlugins: Record<string, McpPlugin> = {
  fs: {
    name: 'fs',
    register: registerFsTools,
  },
  git: {
    name: 'git',
    register: registerGitTools,
  },
  'package-json': {
    name: 'package-json',
    register: registerPackageJsonTools,
  },
  'typescript': {
    name: 'typescript',
    register: registerTypescriptTools,
  },
  dprint: {
    name: 'dprint',
    register: registerDprintTools,
  },
}

export async function loadPlugins(
  server: McpServer,
  config: McpConfig,
  context: McpPluginContext,
) {
  const plugins = config.plugins ?? ['fs', 'git', 'package-json', 'typescript', 'dprint']

  for (const plugin of plugins) {
    const builtin = builtinPlugins[plugin]

    if (builtin) {
      await builtin.register(server, context)
      continue
    }

    const module = await import(resolvePluginPath(context.configPath, plugin))
    const loaded = (module.default ?? module.plugin) as McpPlugin

    if (!loaded?.name || typeof loaded.register !== 'function') {
      throw new Error(`Invalid MCP plugin: ${plugin}`)
    }

    await loaded.register(server, context)
  }
}
