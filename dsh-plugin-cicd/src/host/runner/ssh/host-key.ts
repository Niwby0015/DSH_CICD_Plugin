import { appendFile, mkdir, readFile, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { CicdError } from '../../util/errors.js'
import type { ProcessRunner } from '../../git/process.js'

export interface HostKeyResult {
  knownHostsPath: string
  fingerprint: string
}

function assertHost(host: string): void {
  if (!host || host.startsWith('-') || /[\s/@]/.test(host)) {
    throw new CicdError('INVALID_INPUT', 'SSH host must not contain whitespace, "@" or start with "-"', 400)
  }
}

/** First-use host-key trust, with optional SHA256 fingerprint pinning. */
export class HostKeyManager {
  constructor(private readonly runner: ProcessRunner) {}

  async ensure(input: {
    host: string
    port: number
    user?: string
    knownHostsPath: string
    expectedFingerprint?: string
    timeoutMs?: number
  }): Promise<HostKeyResult> {
    assertHost(input.host)
    if (input.user && (input.user.startsWith('-') || !/^[A-Za-z0-9._-]+$/.test(input.user))) {
      throw new CicdError('INVALID_INPUT', 'invalid SSH user', 400)
    }
    if (!input.knownHostsPath) throw new CicdError('INVALID_INPUT', 'knownHostsPath is required for SSH', 400)
    await mkdir(dirname(input.knownHostsPath), { recursive: true })
    let existing = ''
    try {
      existing = await readFile(input.knownHostsPath, 'utf8')
    } catch {
      existing = ''
    }
    if (existing.trim()) {
      const matching = await this.lookupHost(input.host, input.port, input.knownHostsPath, input.timeoutMs)
      if (matching) {
        const fingerprint = await this.fingerprintText(matching, input.timeoutMs)
        this.assertPinned(fingerprint, input.expectedFingerprint)
        return { knownHostsPath: input.knownHostsPath, fingerprint }
      }
    }

    const scan = await this.runner.run(['ssh-keyscan', '-p', String(input.port), '-T', '10', input.host], {
      cwd: process.cwd(),
      timeoutMs: input.timeoutMs ?? 20_000,
      maxBytes: 256 * 1024,
    })
    if (scan.code === 0 && scan.stdout.trim()) {
      const fingerprint = await this.fingerprintText(scan.stdout, input.timeoutMs)
      this.assertPinned(fingerprint, input.expectedFingerprint)
      await appendFile(input.knownHostsPath, scan.stdout.endsWith('\n') ? scan.stdout : `${scan.stdout}\n`, 'utf8')
      return { knownHostsPath: input.knownHostsPath, fingerprint }
    }

    // Windows OpenSSH may have a keyscan KEX bug (for example sntrup761 on
    // 9.5p1). Fall back to a real SSH handshake: accept-new writes the host key
    // before authentication, so an auth failure here is expected and harmless.
    if (!input.user) {
      throw new CicdError('SSH_HOST_KEY_FAILED', scan.stderr || scan.stdout || 'ssh-keyscan returned no host key', 502)
    }
    await this.runner.run([
      'ssh',
      '-p', String(input.port),
      '-o', 'BatchMode=yes',
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', `UserKnownHostsFile=${input.knownHostsPath}`,
      '-o', `ConnectTimeout=${Math.max(5, Math.ceil((input.timeoutMs ?? 20_000) / 1000))}`,
      '-o', 'RequestTTY=no',
      '-o', 'LogLevel=ERROR',
      `${input.user}@${input.host}`,
      'true',
    ], {
      cwd: process.cwd(),
      timeoutMs: input.timeoutMs ?? 20_000,
      maxBytes: 256 * 1024,
    })
    const written = await readFile(input.knownHostsPath, 'utf8').catch(() => '')
    if (!written.trim()) {
      throw new CicdError('SSH_HOST_KEY_FAILED', scan.stderr || 'SSH handshake did not record a host key', 502)
    }
    const matching = await this.lookupHost(input.host, input.port, input.knownHostsPath, input.timeoutMs)
    if (!matching) {
      throw new CicdError('SSH_HOST_KEY_FAILED', 'SSH handshake did not record this host key', 502)
    }
    const fingerprint = await this.fingerprintText(matching, input.timeoutMs)
    try {
      this.assertPinned(fingerprint, input.expectedFingerprint)
    } catch (error) {
      await rm(input.knownHostsPath, { force: true }).catch(() => {})
      throw error
    }
    return { knownHostsPath: input.knownHostsPath, fingerprint }
  }

  private assertPinned(actual: string, expected?: string): void {
    if (expected && expected !== actual) {
      throw new CicdError('SSH_HOST_KEY_MISMATCH', `SSH host key changed: expected ${expected}, got ${actual}`, 409)
    }
  }

  private async lookupHost(host: string, port: number, path: string, timeoutMs?: number): Promise<string | undefined> {
    const lookup = port === 22 ? host : `[${host}]:${port}`
    const result = await this.runner.run(['ssh-keygen', '-F', lookup, '-f', path], {
      cwd: process.cwd(),
      timeoutMs: timeoutMs ?? 20_000,
      maxBytes: 64 * 1024,
    })
    return result.code === 0 && result.stdout.trim() ? result.stdout : undefined
  }

  private async fingerprintText(text: string, timeoutMs?: number): Promise<string> {
    const result = await this.runner.run(['ssh-keygen', '-lf', '-', '-E', 'sha256'], {
      cwd: process.cwd(),
      stdin: text,
      timeoutMs: timeoutMs ?? 20_000,
      maxBytes: 64 * 1024,
    })
    if (result.code !== 0) throw new CicdError('SSH_HOST_KEY_FAILED', result.stderr || 'ssh-keygen failed', 502)
    const match = result.stdout.match(/SHA256:[A-Za-z0-9+/=]+/)
    if (!match) throw new CicdError('SSH_HOST_KEY_FAILED', 'could not parse SSH fingerprint', 502)
    return match[0]
  }

  private async fingerprintFile(path: string, timeoutMs?: number): Promise<string> {
    const result = await this.runner.run(['ssh-keygen', '-lf', path, '-E', 'sha256'], {
      cwd: process.cwd(),
      timeoutMs: timeoutMs ?? 20_000,
    })
    if (result.code !== 0) throw new CicdError('SSH_HOST_KEY_FAILED', result.stderr || 'ssh-keygen failed', 502)
    const match = result.stdout.match(/SHA256:[A-Za-z0-9+/=]+/)
    if (!match) throw new CicdError('SSH_HOST_KEY_FAILED', 'could not parse SSH fingerprint', 502)
    return match[0]
  }
}
