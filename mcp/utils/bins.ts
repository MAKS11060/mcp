import {execa} from 'execa'
import {readdir} from 'node:fs/promises'
import {join} from 'node:path'
import {getProjectRoot} from './path.ts'

export type BinAvailability = {
  local: Set<string>
  global: Set<string>
}

let cached: BinAvailability | null = null

/**
 * Собирает имена бинарников из node_modules/.bin
 * (на Windows игнорирует .cmd / .ps1 суффиксы).
 */
async function listLocalBins(): Promise<Set<string>> {
  const binDir = join(getProjectRoot(), 'node_modules', '.bin')
  const names = new Set<string>()

  try {
    const entries = await readdir(binDir)
    for (const name of entries) {
      const base = name
        .replace(/\.cmd$/i, '')
        .replace(/\.ps1$/i, '')
        .replace(/\.exe$/i, '')
      if (base && !base.endsWith('.ps1')) {
        names.add(base)
      }
    }
  } catch {
    // node_modules/.bin нет
  }

  return names
}

/** Проверяет, есть ли команда в PATH */
async function isOnPath(bin: string): Promise<boolean> {
  try {
    // Windows: where, Unix: command -v / which
    const isWin = process.platform === 'win32'
    const result = await execa(isWin ? 'where' : 'command', isWin ? [bin] : ['-v', bin], {
      reject: false,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    return result.exitCode === 0
  } catch {
    return false
  }
}

export async function getAvailableBins(checkGlobal: string[] = []): Promise<BinAvailability> {
  if (cached) return cached

  const local = await listLocalBins()
  const global = new Set<string>()

  for (const bin of checkGlobal) {
    if (local.has(bin)) continue
    if (await isOnPath(bin)) {
      global.add(bin)
    }
  }

  cached = {local, global}
  return cached
}

export function hasBin(bins: BinAvailability, name: string): boolean {
  return bins.local.has(name) || bins.global.has(name)
}

/** Локальный → через pm exec, глобальный → напрямую */
export function isLocalBin(bins: BinAvailability, name: string): boolean {
  return bins.local.has(name)
}
