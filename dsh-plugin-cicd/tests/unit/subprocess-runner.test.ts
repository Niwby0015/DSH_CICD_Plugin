import { describe, expect, it } from 'vitest'
import { LocalProcessRunner, SubprocessRunner, type DshSubprocessService } from '../../src/host/git/process.js'

describe('SubprocessRunner', () => {
  it('passes explicit argv, stdin, cwd and environment to ctx.subprocess', async () => {
    let spec: Parameters<DshSubprocessService['spawn']>[0] | undefined
    const service: DshSubprocessService = {
      async resolveExecutable(name) {
        return `C:\\bin\\${name}.exe`
      },
      spawn(input) {
        spec = input
        return {
          done: Promise.resolve({ exitCode: 0, signal: null }),
          collected: {
            stdout: { readFrom: () => ({ text: 'ok' }) },
            stderr: { readFrom: () => ({ text: '' }) },
          },
        }
      },
    }
    const runner = new SubprocessRunner(service)
    const result = await runner.run(['git', 'commit', '-F', '-'], {
      cwd: 'C:\\work\\demo',
      stdin: 'message\n',
      env: { GIT_TERMINAL_PROMPT: '0' },
    })
    expect(result.code).toBe(0)
    expect(result.stdout).toBe('ok')
    expect(spec?.argv).toEqual(['C:\\bin\\git.exe', 'commit', '-F', '-'])
    expect(spec?.cwd).toBe('C:\\work\\demo')
    expect(spec?.stdio.stdin).toEqual({ data: 'message\n' })
    expect(spec?.env).toEqual({ GIT_TERMINAL_PROMPT: '0' })
  })

  it('streams local stdout chunks while the process is running', async () => {
    const chunks: string[] = []
    const result = await new LocalProcessRunner().run([
      process.execPath,
      '-e',
      "process.stdout.write('a'); setTimeout(() => process.stdout.write('b'), 50)",
    ], {
      cwd: process.cwd(),
      onData: (stream, text) => {
        if (stream === 'stdout') chunks.push(text)
      },
    })
    expect(result.stdout).toBe('ab')
    expect(chunks.join('')).toContain('a')
    expect(chunks.join('')).toContain('b')
  })
})
