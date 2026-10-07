# MCP

A local MCP server for working with a project through filesystem, Git, scripts, and code-quality tools.

## Features

Built-in plugins:

- **fs** — read, write, patch, delete, search, and inspect project files
- **git** — status, diff, show, log, init, add, move, commit, fetch, pull, and push
- **package-json** — run and list scripts from `package.json`
- **typescript** — TypeScript type checking
- **dprint** — formatting checks and formatting

## Installation

Build a standalone executable:

```bash
pnpm install
pnpm build
```

For Windows:

```bash
pnpm build:win
```

The resulting binary is written to `dist/`. Add that directory to your `PATH` to run `mcp` from any project.

## Configuration

Create a configuration file with:

```bash
mcp init
```

Or choose a path:

```bash
mcp init --config .mcp.json
```

The generated configuration contains a random MCP endpoint path and the project directory name as the server name and title.

The configuration can reference the JSON Schema for editor autocomplete and validation:

```json
{
  "$schema": "https://raw.githubusercontent.com/MAKS11060/mcp/main/schema/mcp.schema.json",
  "server": {
    "host": "localhost",
    "port": 443,
    "log": true
  },
  "mcp": {
    "path": "/mcp/example",
    "log": true,
    "log_path": "./.mcp/mcp.log"
  },
  "config": {
    "name": "my-project",
    "title": "My Project",
    "version": "1.0.0"
  },
  "plugins": [
    "fs",
    "git",
    "package-json",
    "typescript",
    "dprint"
  ]
}
```

### Server logging

`server.log` controls HTTP request logging and defaults to `true`.

### MCP and plugin logging

`mcp.log` controls logging of MCP tool/plugin actions:

- `true` — log actions to the console
- `false` — disable action logging
- `"file"` — write action logs to a file

When `mcp.log` is `"file"`, `mcp.log_path` specifies the log file. It defaults to `.mcp/mcp.log` relative to the configuration file.

The `config` object contains MCP server metadata. `name` is the technical server name and `title` is its human-readable title. `plugins` controls which plugins are loaded.

## Development

```bash
pnpm dev
pnpm tc
pnpm lint
pnpm fmt
pnpm build
pnpm schema
```

## Custom plugins

Plugins can be referenced by local path or module specifier:

```json
{
  "plugins": [
    "fs",
    "./my-plugin.ts"
  ]
}
```

A plugin exports a default object or a named `plugin`:

```ts
export default {
  name: 'my-plugin',

  register(server, context) {
    // register MCP tools
  },
}
```
