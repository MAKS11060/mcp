import {lstatSync, realpathSync} from 'node:fs'
import {access, constants} from 'node:fs/promises'
import {dirname, isAbsolute, normalize, relative, resolve} from 'node:path'

const PROJECT_ROOT = resolve(process.cwd())
const REAL_PROJECT_ROOT = realpathSync(PROJECT_ROOT)

/**
 * Safely resolve a user-provided path relative to the project root.
 */
export function safeResolve(userPath: string): string {
  if (!userPath || typeof userPath !== 'string') {
    throw new Error('Path cannot be empty')
  }

  // Normalize the path and remove a leading ./ prefix
  let cleaned = normalize(userPath).replace(/\\/g, '/')
  if (cleaned.startsWith('./')) cleaned = cleaned.slice(2)

  if (isAbsolute(cleaned) || cleaned.startsWith('..') || cleaned.includes('/../')) {
    throw new Error(`Unsafe path: ${userPath}`)
  }

  const fullPath = resolve(PROJECT_ROOT, cleaned)
  const rel = relative(PROJECT_ROOT, fullPath)

  // Additional protection against escaping the project root
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Path escapes the project root: ${userPath}`)
  }

  // Resolve existing path segments to prevent symlinks from escaping the project root.
  let existingPath = fullPath
  while (true) {
    try {
      lstatSync(existingPath)
      break
    } catch {
      const parent = dirname(existingPath)
      if (parent === existingPath) throw new Error('Unable to resolve path: ' + userPath)
      existingPath = parent
    }
  }

  const realPath = realpathSync(existingPath)
  const realRelative = relative(REAL_PROJECT_ROOT, realPath)
  if (realRelative.startsWith('..') || isAbsolute(realRelative)) {
    throw new Error('Path resolves outside the project root: ' + userPath)
  }

  return fullPath
}

export function toRelative(fullPath: string): string {
  return relative(PROJECT_ROOT, fullPath).replace(/\\/g, '/')
}

export function getProjectRoot() {
  return PROJECT_ROOT
}

export async function pathExists(fullPath: string): Promise<boolean> {
  try {
    await access(fullPath, constants.F_OK)
    return true
  } catch {
    return false
  }
}
