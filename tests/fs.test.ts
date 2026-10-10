import assert from 'node:assert/strict'
import {replaceLines} from '../src/utils/lines.ts'

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

Deno.test('replaceLines rejects invalid line ranges', () => {
  assert.throws(() => replaceLines('one\ntwo', 'replacement', 0), /startLine/)
  assert.throws(() => replaceLines('one\ntwo', 'replacement', 2, 1), /endLine/)
  assert.throws(() => replaceLines('one\ntwo', 'replacement', 3), /exceeds/)
})
