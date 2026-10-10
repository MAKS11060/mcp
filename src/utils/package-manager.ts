import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {getProjectRoot} from './path.ts'

export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun'

let cached: PackageManager | null = null

/**
 * Detect the package manager from package.json → packageManager
 * or from lockfiles. Defaults to pnpm.
 */
export async function detectPackageManager(): Promise<PackageManager> {
  if (cached) return cached

  const root = getProjectRoot()

  try {
    const pkgRaw = await readFile(join(root, 'package.json'), 'utf-8')
    const pkg = JSON.parse(pkgRaw) as {packageManager?: string}

    if (pkg.packageManager) {
      const name = pkg.packageManager.split('@')[0]?.toLowerCase()
      if (name === 'pnpm' || name === 'npm' || name === 'yarn' || name === 'bun') {
        cached = name
        return cached
      }
    }
  } catch {
    // ignore
  }

  // Lockfile-based fallback can be added later
  cached = 'pnpm'
  return cached
}

/**
 * Return the command and arguments used to run a binary from node_modules.
 * pnpm → pnpm exec <bin> ...
 * npm  → npx <bin> ...
 * yarn → yarn <bin> ...
 * bun  → bunx <bin> ...
 */
export async function resolveBin(
  bin: string,
  binArgs: string[] = [],
): Promise<{command: string; args: string[]}> {
  const pm = await detectPackageManager()

  switch (pm) {
    case 'pnpm':
      return {command: 'pnpm', args: ['exec', bin, ...binArgs]}
    case 'npm':
      return {command: 'npx', args: [bin, ...binArgs]}
    case 'yarn':
      return {command: 'yarn', args: [bin, ...binArgs]}
    case 'bun':
      return {command: 'bunx', args: [bin, ...binArgs]}
    default:
      return {command: 'pnpm', args: ['exec', bin, ...binArgs]}
  }
}
