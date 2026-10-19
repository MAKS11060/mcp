import {createHash} from 'node:crypto'

export function getFileRevision(content: string) {
  return createHash('sha256').update(content, 'utf-8').digest('hex')
}
