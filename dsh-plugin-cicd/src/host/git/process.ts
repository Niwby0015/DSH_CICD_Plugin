import { spawn } from 'node:child_process'

export interface ProcessResult {
  code: number
  stdout: string
  stderr: string
  timedOut: boolean
}

export interface ProcessOptions {
  cwd: string
  env?: Record<string, string>
  stdin?: string
  signal?: AbortSignal
  timeoutMs?: number
  maxBytes?: number
  onData?: (stream: 'stdout' | 'stderr', text: string) => void
}

export interface ProcessRunner {
  run(argv: string[], options: ProcessOptions): Promise<ProcessResult>
}

export interface DshSubprocessService {
  resolveExecutable(name: string): Promise<string>
  spawn(spec: {
    argv: string[]
    cwd: string
    stdio: {
      stdin: 'ignore' | { data: string }
      stdout: { maxBytes: number }
      stderr: { maxBytes: number }
    }
    graceMs: number
    signal?: AbortSignal
    env?: Record<string, string>
  }): {
    done: Promise<{ exitCode: number | null; signal?: string | null }>
    collected?: {
      stdout?: { readFrom(offset: number): { text: string } }
      stderr?: { readFrom(offset: number): { text: string } }
    }
    terminate?(): void
  }
}

function timeoutSignal(signal: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; timedOut(): boolean; dispose(): void } {
  const controller = new AbortController()
  let timedOut = false
  const onAbort = () => controller.abort(signal?.reason)
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason)
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort(new Error('process timed out'))
  }, timeoutMs)
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

/** Local runner used by tests and as a fallback outside a DSH Host. */
export class LocalProcessRunner implements ProcessRunner {
  async run(argv: string[], options: ProcessOptions): Promise<ProcessResult> {
    if (argv.length === 0) throw new Error('empty argv')
    const maxBytes = options.maxBytes ?? 4 * 1024 * 1024
    const timeoutMs = options.timeoutMs ?? 60_000
    const time = timeoutSignal(options.signal, timeoutMs)
    return new Promise<ProcessResult>((resolve, reject) => {
      let stdout = Buffer.alloc(0)
      let stderr = Buffer.alloc(0)
      let settled = false
      const child = spawn(argv[0] as string, argv.slice(1), {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        signal: time.signal,
      })
      const finish = (code: number) => {
        if (settled) return
        settled = true
        time.dispose()
        resolve({
          code,
          stdout: stdout.toString('utf8'),
          stderr: stderr.toString('utf8'),
          timedOut: time.timedOut(),
        })
      }
      child.stdout?.on('data', (chunk: Buffer) => {
        stdout = Buffer.concat([stdout, chunk])
        if (stdout.length > maxBytes) stdout = stdout.subarray(stdout.length - maxBytes)
        options.onData?.('stdout', chunk.toString('utf8'))
      })
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr = Buffer.concat([stderr, chunk])
        if (stderr.length > maxBytes) stderr = stderr.subarray(stderr.length - maxBytes)
        options.onData?.('stderr', chunk.toString('utf8'))
      })
      child.on('error', (error) => {
        if (settled) return
        settled = true
        time.dispose()
        reject(error)
      })
      child.on('close', (code, signal) => {
        finish(code ?? (time.timedOut() ? 124 : signal ? 1 : 1))
      })
      if (options.stdin !== undefined) child.stdin?.end(options.stdin)
      else child.stdin?.end()
    })
  }
}

/** DSH Host runner: explicit argv, managed range, collected output. */
export class SubprocessRunner implements ProcessRunner {
  constructor(private readonly subprocess: DshSubprocessService) {}

  async run(argv: string[], options: ProcessOptions): Promise<ProcessResult> {
    if (argv.length === 0) throw new Error('empty argv')
    const maxBytes = options.maxBytes ?? 4 * 1024 * 1024
    const timeoutMs = options.timeoutMs ?? 60_000
    const time = timeoutSignal(options.signal, timeoutMs)
    try {
      const executable = await this.subprocess.resolveExecutable(argv[0] as string)
      const handle = this.subprocess.spawn({
        argv: [executable, ...argv.slice(1)],
        cwd: options.cwd,
        stdio: {
          stdin: options.stdin === undefined ? 'ignore' : { data: options.stdin },
          stdout: { maxBytes },
          stderr: { maxBytes },
        },
        graceMs: 5000,
        signal: time.signal,
        ...(options.env ? { env: options.env } : {}),
      })
      try {
        let outOffset = 0
        let errOffset = 0
        const flush = () => {
          if (!options.onData) return
          const out = handle.collected?.stdout?.readFrom(outOffset)
          if (out?.text) {
            outOffset += out.text.length
            options.onData('stdout', out.text)
          }
          const err = handle.collected?.stderr?.readFrom(errOffset)
          if (err?.text) {
            errOffset += err.text.length
            options.onData('stderr', err.text)
          }
        }
        const timer = setInterval(flush, 400)
        let outcome: { exitCode: number | null; signal?: string | null }
        try {
          outcome = await handle.done
        } finally {
          clearInterval(timer)
          flush()
        }
        const stdout = handle.collected?.stdout?.readFrom(0).text ?? ''
        const stderr = handle.collected?.stderr?.readFrom(0).text ?? ''
        return {
          code: outcome.exitCode ?? (time.timedOut() ? 124 : 1),
          stdout,
          stderr,
          timedOut: time.timedOut(),
        }
      } catch (error) {
        if (time.timedOut()) {
          return { code: 124, stdout: '', stderr: String(error), timedOut: true }
        }
        throw error
      }
    } finally {
      time.dispose()
    }
  }
}
