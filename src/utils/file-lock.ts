const locks = new Map<string, Promise<void>>()

export async function withFileLock<T>(path: string, action: () => Promise<T>): Promise<T> {
  const previous = locks.get(path) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })

  locks.set(path, current)
  await previous

  try {
    return await action()
  } finally {
    release()
    if (locks.get(path) === current) locks.delete(path)
  }
}
