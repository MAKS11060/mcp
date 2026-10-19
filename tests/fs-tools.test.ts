import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import assert from 'node:assert/strict'
import {readFile, rm, writeFile} from 'node:fs/promises'
import {registerFsTools} from '../src/plugins/fs.ts'
import {getFileRevision} from '../src/utils/file-revision.ts'

type Handler = (args: Record<string, unknown>) => Promise<unknown>

function getHandlers() {
  const handlers = new Map<string, Handler>()
  const server = {
    registerTool(name: string, _config: unknown, handler: Handler) {
      handlers.set(name, handler)
    },
  }
  registerFsTools(server as unknown as McpServer)
  return handlers
}

Deno.test('fs_write_file accepts lineCount and replaces exactly that many lines', async () => {
  const handler = getHandlers().get('fs_write_file')
  assert.ok(handler)
  const path = `tests/.fs-write-${crypto.randomUUID()}.txt`
  await writeFile(path, '1\n2\n3\n4\n5\n', 'utf-8')

  try {
    await handler({
      path,
      content: 'A\nB\n',
      mode: 'replace_lines',
      startLine: 2,
      lineCount: 2,
      expectedRevision: getFileRevision('1\n2\n3\n4\n5\n'),
      dryRun: false,
      maxPreviewLines: 100,
    })
    assert.equal(await readFile(path, 'utf-8'), '1\nA\nB\n4\n5\n')
  } finally {
    await rm(path, {force: true})
  }
})

Deno.test('concurrent replace_lines calls with the same revision reject the stale write', async () => {
  const handler = getHandlers().get('fs_write_file')
  assert.ok(handler)
  const path = `tests/.fs-write-${crypto.randomUUID()}.txt`
  const original = '1\n2\n3\n4\n'
  const expectedRevision = getFileRevision(original)
  await writeFile(path, original, 'utf-8')

  try {
    const results = await Promise.allSettled([
      handler({
        path,
        content: 'A\nB',
        mode: 'replace_lines',
        startLine: 2,
        lineCount: 2,
        expectedRevision,
        dryRun: false,
        maxPreviewLines: 100,
      }),
      handler({
        path,
        content: 'X\nY',
        mode: 'replace_lines',
        startLine: 2,
        lineCount: 2,
        expectedRevision,
        dryRun: false,
        maxPreviewLines: 100,
      }),
    ])

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1)
    const content = await readFile(path, 'utf-8')
    assert.ok(content === '1\nA\nB\n4\n' || content === '1\nX\nY\n4\n')
  } finally {
    await rm(path, {force: true})
  }
})

Deno.test('fs_patch treats replacement content literally and checks the revision', async () => {
  const handler = getHandlers().get('fs_patch')
  assert.ok(handler)
  const path = `tests/.fs-patch-${crypto.randomUUID()}.txt`
  const original = 'before target after'
  await writeFile(path, original, 'utf-8')

  try {
    await handler({
      path,
      patches: [{old: 'target', new: '$&-changed'}],
      expectedRevision: getFileRevision(original),
    })
    assert.equal(await readFile(path, 'utf-8'), 'before $&-changed after')

    await assert.rejects(
      handler({
        path,
        patches: [{old: 'changed', new: 'stale'}],
        expectedRevision: getFileRevision(original),
      }),
      /File changed since it was read/,
    )
    assert.equal(await readFile(path, 'utf-8'), 'before $&-changed after')
  } finally {
    await rm(path, {force: true})
  }
})

Deno.test('concurrent fs_write_file appends do not overwrite each other', async () => {
  const handler = getHandlers().get('fs_write_file')
  assert.ok(handler)
  const path = `tests/.fs-write-${crypto.randomUUID()}.txt`
  await writeFile(path, 'base', 'utf-8')

  try {
    await Promise.all([
      handler({path, content: '-A', mode: 'append', dryRun: false, maxPreviewLines: 100}),
      handler({path, content: '-B', mode: 'append', dryRun: false, maxPreviewLines: 100}),
    ])
    const result = await readFile(path, 'utf-8')
    assert.equal(result.length, 'base-A-B'.length)
    assert.ok(result.startsWith('base'))
    assert.ok(result.includes('-A'))
    assert.ok(result.includes('-B'))
  } finally {
    await rm(path, {force: true})
  }
})
