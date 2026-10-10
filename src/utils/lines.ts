export function replaceLines(original: string, content: string, startLine: number, endLine?: number) {
  if (startLine < 1) throw new Error('startLine must be at least 1')
  if (endLine !== undefined && endLine < startLine) {
    throw new Error('endLine must be greater than or equal to startLine')
  }

  const lines = original.split(/\r\n|\n|\r/)
  const to = endLine ?? startLine
  if (startLine > lines.length || to > lines.length) {
    throw new Error('Line range exceeds the file length (' + lines.length + ' lines)')
  }

  const newline = original.includes('\r\n') ? '\r\n' : original.includes('\r') && !original.includes('\n')
    ? '\r'
    : '\n'
  const replacement = content.split(/\r\n|\n|\r/)
  return [...lines.slice(0, startLine - 1), ...replacement, ...lines.slice(to)].join(newline)
}
