import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {resolvePluginPath} from './config.ts'
import type {McpConfig} from './config.ts'
import type {McpPlugin, McpPluginContext} from './plugin.ts'
import {registerCodeQualityTools} from './plugins/code-quality.ts'
import {registerFsTools} from './plugins/fs.ts'
import {registerGitTools} from './plugins/git.ts'
import {registerRunScriptTools} from './plugins/run-script.ts'

const builtinPlugins: Record<string, McpPlugin> = {
  fs: {
    name: 'fs',
    register: registerFsTools,
  },
  git: {
    name: 'git',
    register: registerGitTools,
  },
  'run-script': {
    name: 'run-script',
    register: registerRunScriptTools,
  },
  'code-quality': {
    name: 'code-quality',
    register: registerCodeQualityTools,
  },
}

export async function loadPlugins(
  server: McpServer,
  config: McpConfig,
  context: McpPluginContext,
) {
  const plugins = config.plugins ?? ['fs', 'git', 'run-script', 'code-quality']

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
