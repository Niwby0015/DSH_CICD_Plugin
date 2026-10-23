import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function has(command: string): boolean {
  const result = spawnSync(command, [command === 'go' ? 'version' : '--version'], { stdio: 'ignore' })
  return result.status === 0
}

function run(command: string, args: string[], cwd: string) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    timeout: 30_000,
  })
}

describe('language examples', () => {
  it.skipIf(!has('node'))('runs the Node example test and build', () => {
    const cwd = join(root, 'examples', 'node')
    try {
      const test = run(process.execPath, ['test.mjs'], cwd)
      expect(test.status, `${test.stdout}\n${test.stderr}`).toBe(0)
      const build = run(process.execPath, ['build.mjs'], cwd)
      expect(build.status, `${build.stdout}\n${build.stderr}`).toBe(0)
    } finally {
      rmSync(join(cwd, 'dist'), { recursive: true, force: true })
    }
  })

  it.skipIf(!has('python'))('runs the Python example unittest suite', () => {
    const cwd = join(root, 'examples', 'python')
    const test = run('python', ['-m', 'unittest', 'discover', '-s', 'tests', '-v'], cwd)
    expect(test.status, `${test.stdout}\n${test.stderr}`).toBe(0)
  })

  it.skipIf(!has('go'))('runs the Go example tests', () => {
    const cwd = join(root, 'examples', 'go')
    const test = run('go', ['test', './...'], cwd)
    expect(test.status, `${test.stdout}\n${test.stderr}`).toBe(0)
  })
})
