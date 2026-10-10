import {execa} from 'execa'
import {readdir} from 'node:fs/promises'
import {join} from 'node:path'
import {getProjectRoot} from './path.ts'

export type BinAvailability = {
  local: Set<string>
  global: Set<string>
}

let cached: BinAvailability | null = null
const checkedGlobal = new Set<string>()

/**
 * Collect executable names from node_modules/.bin
 * (ignore .cmd / .ps1 suffixes on Windows).
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
    // node_modules/.bin does not exist
  }

  return names
}

/** Check whether a command is available on PATH */
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
  if (!cached) {
    cached = {
      local: await listLocalBins(),
      global: new Set(),
    }
  }

  for (const bin of checkGlobal) {
    if (checkedGlobal.has(bin) || cached.local.has(bin)) continue

    checkedGlobal.add(bin)

    if (await isOnPath(bin)) {
      cached.global.add(bin)
    }
  }

  return cached
}

export function hasBin(bins: BinAvailability, name: string): boolean {
  return bins.local.has(name) || bins.global.has(name)
}

/** Run local binaries through the package manager and global binaries directly */
export function isLocalBin(bins: BinAvailability, name: string): boolean {
  return bins.local.has(name)
}
