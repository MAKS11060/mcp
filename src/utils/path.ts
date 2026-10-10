import {access, constants} from 'node:fs/promises'
import {isAbsolute, join, normalize, relative, resolve, sep} from 'node:path'

const PROJECT_ROOT = resolve(process.cwd())

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
