const LINE_BREAK = /\r\n|\n|\r/
const TRAILING_LINE_BREAK = /(?:\r\n|\n|\r)$/

export function splitLines(content: string) {
  if (content === '') return ['']
  const lines = content.split(LINE_BREAK)
  if (TRAILING_LINE_BREAK.test(content)) lines.pop()
  return lines
}

export function replaceLines(original: string, content: string, startLine: number, endLine?: number) {
  if (startLine < 1) throw new Error('startLine must be at least 1')
  if (endLine !== undefined && endLine < startLine) {
    throw new Error('endLine must be greater than or equal to startLine')
  }

  const originalHasTrailingNewline = TRAILING_LINE_BREAK.test(original)
  const lines = splitLines(original)

  const to = endLine ?? startLine
  if (startLine > lines.length || to > lines.length) {
    throw new Error('Line range exceeds the file length (' + lines.length + ' lines)')
  }

  const newline = original.includes('\r\n') ? '\r\n' : original.includes('\r') && !original.includes('\n')
    ? '\r'
    : '\n'
  const replacement = splitLines(content)

  const updated = [...lines.slice(0, startLine - 1), ...replacement, ...lines.slice(to)].join(newline)
  return originalHasTrailingNewline ? updated + newline : updated
}
