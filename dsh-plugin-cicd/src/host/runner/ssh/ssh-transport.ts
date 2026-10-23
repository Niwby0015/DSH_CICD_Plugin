import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CicdError } from '../../util/errors.js'
import type { ProcessResult, ProcessRunner } from '../../git/process.js'
import type { SshRunnerConfig } from '../types.js'
import type { RemoteInvocation } from './remote-scripts.js'

export interface SshCredentials {
  password?: string
}

export class SshAskpass {
  private dir: string | undefined

  constructor(private readonly password: () => Promise<string | undefined>) {}

  async prepare(): Promise<{ env: Record<string, string>; cleanup(): Promise<void> }> {
    const password = await this.password()
    if (!password) throw new CicdError('SSH_AUTH_FAILED', 'SSH password is not configured', 401)
    const dir = mkdtempSync(join(tmpdir(), 'dsh-cicd-ssh-askpass-'))
    this.dir = dir
    const script = process.platform === 'win32' ? join(dir, 'askpass.cmd') : join(dir, 'askpass.sh')
    const content = process.platform === 'win32'
      ? '@echo off\r\nif not "%CICD_SSH_PASSWORD%"=="" echo %CICD_SSH_PASSWORD%\r\n'
      : '#!/bin/sh\nprintf "%s\\n" "$CICD_SSH_PASSWORD"\n'
    writeFileSync(script, content, { encoding: 'utf8', mode: 0o700 })
    if (process.platform !== 'win32') chmodSync(script, 0o700)
    return {
      env: {
        SSH_ASKPASS: script,
        SSH_ASKPASS_REQUIRE: 'force',
        DISPLAY: ':0',
        CICD_SSH_PASSWORD: password,
      },
      cleanup: async () => {
        this.dir = undefined
        rmSync(dir, { recursive: true, force: true })
      },
    }
  }

  dispose(): void {
    if (this.dir) rmSync(this.dir, { recursive: true, force: true })
    this.dir = undefined
  }
}

function assertPart(value: string, name: string, pattern: RegExp): void {
  if (!value || value.startsWith('-') || !pattern.test(value)) {
    throw new CicdError('INVALID_INPUT', `invalid SSH ${name}`, 400)
  }
}

export class SshTransport {
  constructor(
    private readonly runner: ProcessRunner,
    private readonly askpass: SshAskpass,
  ) {}

  async run(
    config: SshRunnerConfig,
    invocation: RemoteInvocation,
    options: { signal?: AbortSignal; timeoutMs?: number; knownHostsPath: string; onData?: (stream: 'stdout' | 'stderr', text: string) => void } = { knownHostsPath: '' },
  ): Promise<ProcessResult> {
    if (!options.knownHostsPath) throw new CicdError('INVALID_INPUT', 'knownHostsPath is required', 400)
    const prepared = await this.connection(config, options.knownHostsPath, 'ssh')
    try {
      const argv = ['ssh', ...prepared.args, `${config.user}@${config.host}`, 'sh', '-s', '--', ...invocation.args]
      const result = await this.runner.run(argv, {
        cwd: process.cwd(),
        stdin: invocation.script,
        env: prepared.env,
        ...(options.signal ? { signal: options.signal } : {}),
        timeoutMs: options.timeoutMs ?? 120_000,
        maxBytes: 8 * 1024 * 1024,
        ...(options.onData ? { onData: options.onData } : {}),
      })
      this.assertAuth(result)
      return result
    } finally {
      await prepared.cleanup?.()
    }
  }

  /** Upload one file with scp, using the same host key and authentication rules. */
  async copyTo(
    config: SshRunnerConfig,
    localPath: string,
    remotePath: string,
    knownHostsPath: string,
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<ProcessResult> {
    if (!knownHostsPath) throw new CicdError('INVALID_INPUT', 'knownHostsPath is required', 400)
    if (!remotePath.startsWith('/') || remotePath.split('/').includes('..') || /[\r\n\0]/.test(remotePath)) {
      throw new CicdError('INVALID_INPUT', 'remote upload path must be an absolute POSIX path without ".."', 400)
    }
    const prepared = await this.connection(config, knownHostsPath, 'scp')
    try {
      const result = await this.runner.run([
        'scp',
        ...prepared.args,
        localPath,
        `${config.user}@${config.host}:${remotePath}`,
      ], {
        cwd: process.cwd(),
        env: prepared.env,
        ...(options.signal ? { signal: options.signal } : {}),
        timeoutMs: options.timeoutMs ?? 120_000,
        maxBytes: 1024 * 1024,
      })
      this.assertAuth(result)
      return result
    } finally {
      await prepared.cleanup?.()
    }
  }

  private assertAuth(result: ProcessResult): void {
    if (result.code === 255 && /permission denied|authentication failed/i.test(result.stderr)) {
      throw new CicdError('SSH_AUTH_FAILED', 'SSH authentication failed', 401)
    }
    if (result.code === 255) {
      throw new CicdError('SSH_COMMAND_FAILED', result.stderr || 'ssh/scp failed', 502)
    }
  }

  private async connection(
    config: SshRunnerConfig,
    knownHostsPath: string,
    tool: 'ssh' | 'scp',
  ): Promise<{ args: string[]; env: Record<string, string>; cleanup?: () => Promise<void> }> {
    assertPart(config.host, 'host', /^[A-Za-z0-9._:[\]-]+$/)
    assertPart(config.user, 'user', /^[A-Za-z0-9._-]+$/)
    if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
      throw new CicdError('INVALID_INPUT', 'invalid SSH port', 400)
    }
    const base = [
      tool === 'ssh' ? '-p' : '-P', String(config.port),
      '-o', 'StrictHostKeyChecking=yes',
      '-o', `UserKnownHostsFile=${knownHostsPath}`,
      '-o', `ConnectTimeout=${config.connectTimeoutSec ?? 15}`,
      '-o', 'ServerAliveInterval=15',
      '-o', 'ServerAliveCountMax=3',
      '-o', 'RequestTTY=no',
      '-o', 'LogLevel=ERROR',
    ]
    const env: Record<string, string> = { GIT_TERMINAL_PROMPT: '0' }
    let cleanup: (() => Promise<void>) | undefined
    if (config.auth === 'key') {
      if (!config.keyPath) throw new CicdError('SSH_AUTH_FAILED', 'SSH keyPath is required for key auth', 401)
      base.push('-i', config.keyPath, '-o', 'IdentitiesOnly=yes')
    } else if (config.auth === 'agent') {
      base.push('-o', 'IdentitiesOnly=no')
    } else {
      base.push('-o', 'BatchMode=no', '-o', 'PreferredAuthentications=password,keyboard-interactive')
      const askpass = await this.askpass.prepare()
      Object.assign(env, askpass.env)
      cleanup = askpass.cleanup
    }
    if (config.auth !== 'password') base.push('-o', 'BatchMode=yes')
    return { args: base, env, cleanup }
  }
}
