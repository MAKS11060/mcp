import {mkdir, writeFile} from 'node:fs/promises'
import {mcpConfigJsonSchema} from '../mcp/config.ts'

await mkdir('schema', {recursive: true})
await writeFile(
  'schema/mcp.schema.json',
  JSON.stringify(mcpConfigJsonSchema, null, 2) + '\n',
)
