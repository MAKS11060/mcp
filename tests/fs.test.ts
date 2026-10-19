import assert from 'node:assert/strict'
import {withFileLock} from '../src/utils/file-lock.ts'
import {replaceLines, splitLines} from '../src/utils/lines.ts'

Deno.test('splitLines does not count a trailing newline as an extra line', () => {
  assert.deepEqual(splitLines('A\nB\nC\n'), ['A', 'B', 'C'])
  assert.deepEqual(splitLines('A\r\nB\r\n'), ['A', 'B'])
  assert.deepEqual(splitLines(''), [''])
})

Deno.test('replaceLines replaces a single line without appending the old line', () => {
  assert.equal(replaceLines('one\ntwo\nthree\n', 'replacement', 2), 'one\nreplacement\nthree\n')
})

Deno.test('replaceLines replaces an inclusive range', () => {
  assert.equal(replaceLines('one\ntwo\nthree\nfour', 'replacement', 2, 3), 'one\nreplacement\nfour')
})

Deno.test('replaceLines supports multiline replacement content', () => {
  assert.equal(replaceLines('one\ntwo\nthree', 'first\nsecond', 2), 'one\nfirst\nsecond\nthree')
})

Deno.test('replaceLines preserves CRLF line endings', () => {
  assert.equal(replaceLines('one\r\ntwo\r\nthree\r\n', 'replacement', 2), 'one\r\nreplacement\r\nthree\r\n')
})

Deno.test('replaceLines supports files without a trailing newline', () => {
  assert.equal(replaceLines('one\ntwo\nthree', 'replacement', 3), 'one\ntwo\nreplacement')
})

Deno.test('replaceLines ignores a trailing newline in replacement content', () => {
  assert.equal(replaceLines('1\n2\n3\n4\n5\n6\n', 'A\nB\nC\n', 3, 5), '1\n2\nA\nB\nC\n6\n')
})

Deno.test('replaceLines preserves the original trailing-newline state', () => {
  assert.equal(replaceLines('1\n2\n3\n4', 'A\nB\n', 2, 3), '1\nA\nB\n4')
})

Deno.test('withFileLock serializes concurrent operations on the same path', async () => {
  const order: string[] = []
  let releaseFirst!: () => void
  let signalStarted!: () => void
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve
  })

  const first = withFileLock('same-path', async () => {
    order.push('first-start')
    signalStarted()
    await firstGate
    order.push('first-end')
  })
  await started

  const second = withFileLock('same-path', async () => {
    order.push('second')
  })

  assert.deepEqual(order, ['first-start'])
  releaseFirst()
  await Promise.all([first, second])
  assert.deepEqual(order, ['first-start', 'first-end', 'second'])
})

Deno.test('withFileLock allows independent paths to proceed independently', async () => {
  let releaseFirst!: () => void
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  let secondStarted = false

  const first = withFileLock('path-a', () => firstGate)
  await withFileLock('path-b', async () => {
    secondStarted = true
  })

  assert.equal(secondStarted, true)
  releaseFirst()
  await first
})

Deno.test('replaceLines rejects invalid line ranges', () => {
  assert.throws(() => replaceLines('one\ntwo', 'replacement', 0), /startLine/)
  assert.throws(() => replaceLines('one\ntwo', 'replacement', 2, 1), /endLine/)
  assert.throws(() => replaceLines('one\ntwo', 'replacement', 3), /exceeds/)
})
