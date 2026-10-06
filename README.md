# MCP

A local MCP server for working with a project through filesystem, Git, scripts, and code-quality tools.

## Features

Built-in plugins:

- **fs** — read, write, patch, delete, search, and inspect project files
- **git** — status, diff, show, log, init, add, move, commit, fetch, pull, and push
- **run-script** — run scripts from `package.json`
- **code-quality** — TypeScript checks and dprint formatting

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

The configuration can reference the JSON Schema for editor autocomplete and validation:

```json
{
  "$schema": "https://raw.githubusercontent.com/MAKS11060/mcp/main/schema/mcp.schema.json",
  "config": {
    "name": "my-mcp",
    "version": "1.0.0"
  },
  "plugins": [
    "fs",
    "git",
    "run-script",
    "code-quality"
  ]
}
```

The `config` object contains the MCP server metadata. `plugins` controls which plugins are loaded.

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
    "./mcp/my-plugin.ts"
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
