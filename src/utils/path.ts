import {access, constants} from 'node:fs/promises'
import {isAbsolute, join, normalize, relative, resolve, sep} from 'node:path'

const PROJECT_ROOT = resolve(process.cwd())

/**
 * Безопасно резолвит пользовательский путь относительно корня проекта.
 */
export function safeResolve(userPath: string): string {
  if (!userPath || typeof userPath !== 'string') {
    throw new Error('Путь не может быть пустым')
  }

  // Нормализуем и убираем ведущие ./
  let cleaned = normalize(userPath).replace(/\\/g, '/')
  if (cleaned.startsWith('./')) cleaned = cleaned.slice(2)

  if (isAbsolute(cleaned) || cleaned.startsWith('..') || cleaned.includes('/../')) {
    throw new Error(`Небезопасный путь: ${userPath}`)
  }

  const fullPath = resolve(PROJECT_ROOT, cleaned)
  const rel = relative(PROJECT_ROOT, fullPath)

  // Дополнительная защита от выхода
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Выход за пределы проекта запрещён: ${userPath}`)
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
