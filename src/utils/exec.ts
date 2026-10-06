import {execa} from 'execa'
import {resolveBin} from './package-manager.ts'
import {getProjectRoot} from './path.ts'

export async function runCommand(
  command: string,
  args: string[] = [],
  options: {cwd?: string; timeout?: number} = {},
) {
  const cwd = options.cwd ?? getProjectRoot()

  const result = await execa(command, args, {
    cwd,
    timeout: options.timeout ?? 90_000,
    reject: false,
    all: true,
  })

  return {
    ok: result.exitCode === 0,
    code: result.exitCode ?? 1,
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? '',
    all: result.all?.trim() ?? '',
  }
}

/**
 * Запускает бинарник из зависимостей проекта через package manager
 * (pnpm exec / npx / yarn / bunx).
 */
export async function runBin(
  bin: string,
  binArgs: string[] = [],
  options: {cwd?: string; timeout?: number} = {},
) {
  const {command, args} = await resolveBin(bin, binArgs)
  return runCommand(command, args, options)
}
