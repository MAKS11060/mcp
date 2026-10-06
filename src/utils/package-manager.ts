import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {getProjectRoot} from './path.ts'

export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun'

let cached: PackageManager | null = null

/**
 * Определяет package manager из package.json → packageManager
 * или по lock-файлам. По умолчанию pnpm.
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

  // fallback по lock-файлам можно добавить позже
  cached = 'pnpm'
  return cached
}

/**
 * Возвращает команду + args для запуска бинарника из node_modules.
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
