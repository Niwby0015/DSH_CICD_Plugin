import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ProcessResult, ProcessRunner } from '../../src/host/git/process.js'
import { HostKeyManager } from '../../src/host/runner/ssh/host-key.js'
import { SshAskpass, SshTransport } from '../../src/host/runner/ssh/ssh-transport.js'
import { buildInvocation, cleanupInvocation, decodeArgForTest, prepareWorkspaceInvocation, preflightInvocation } from '../../src/host/runner/ssh/remote-scripts.js'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-cicd-ssh-'))
  dirs.push(dir)
  return dir
}

function result(partial: Partial<ProcessResult> = {}): ProcessResult {
  return { code: 0, stdout: '', stderr: '', timedOut: false, ...partial }
}

describe('SSH transport', () => {
  it('uses explicit argv, known_hosts, key auth and stdin script', async () => {
    const calls: Array<{ argv: string[]; options: Parameters<ProcessRunner['run']>[1] }> = []
    const runner: ProcessRunner = {
      async run(argv, options) {
        calls.push({ argv, options })
        return result()
      },
    }
    const transport = new SshTransport(runner, new SshAskpass(async () => undefined))
    const invocation = { script: '#!/bin/sh\nprintf ok\n', args: ['YWJj'] }
    const knownHostsPath = join(temp(), 'known_hosts')
    await transport.run({
      kind: 'ssh',
      host: 'build.example.com',
      port: 2222,
      user: 'deploy',
      auth: 'key',
      keyPath: 'C:\\keys\\build',
      workspaceRoot: '/tmp/dsh-cicd',
    }, invocation, { knownHostsPath })

    expect(calls).toHaveLength(1)
    const { argv, options } = calls[0]!
    expect(argv.slice(0, 3)).toEqual(['ssh', '-p', '2222'])
    expect(argv).toContain('StrictHostKeyChecking=yes')
    expect(argv).toContain(`UserKnownHostsFile=${knownHostsPath}`)
    expect(argv).toContain('-i')
    expect(argv).toContain('C:\\keys\\build')
    expect(argv.slice(-5)).toEqual(['deploy@build.example.com', 'sh', '-s', '--', 'YWJj'])
    expect(options.stdin).toBe(invocation.script)
    expect(JSON.stringify(argv)).not.toContain('password')
  })

  it('passes a password only through the askpass environment', async () => {
    let captured: { argv: string[]; options: Parameters<ProcessRunner['run']>[1] } | undefined
    let askpassScript = ''
    const runner: ProcessRunner = {
      async run(argv, options) {
        captured = { argv, options }
        if (options.env?.SSH_ASKPASS) askpassScript = readFileSync(options.env.SSH_ASKPASS, 'utf8')
        return result()
      },
    }
    const transport = new SshTransport(runner, new SshAskpass(async () => 'secret-password'))
    await transport.run({
      kind: 'ssh',
      host: 'build.example.com',
      port: 22,
      user: 'deploy',
      auth: 'password',
      workspaceRoot: '/tmp/dsh-cicd',
    }, preflightInvocation(), { knownHostsPath: join(temp(), 'known_hosts') })

    expect(captured).toBeDefined()
    expect(JSON.stringify(captured!.argv)).not.toContain('secret-password')
    expect(captured!.options.env).toMatchObject({ CICD_SSH_PASSWORD: 'secret-password' })
    expect(captured!.options.env?.SSH_ASKPASS).toBeTruthy()
    expect(askpassScript).not.toContain('secret-password')
  })

  it('rejects invalid host/user values before spawning ssh', async () => {
    const transport = new SshTransport({ async run() { throw new Error('must not run') } }, new SshAskpass(async () => undefined))
    await expect(transport.run({
      kind: 'ssh', host: '-oProxyCommand=bad', port: 22, user: 'deploy', auth: 'agent', workspaceRoot: '/tmp/dsh-cicd',
    }, preflightInvocation(), { knownHostsPath: join(temp(), 'known_hosts') })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
  it('uploads with scp and the same strict host-key options', async () => {
    let captured: string[] | undefined
    const runner: ProcessRunner = {
      async run(argv) {
        captured = argv
        return result()
      },
    }
    const transport = new SshTransport(runner, new SshAskpass(async () => undefined))
    await transport.copyTo({
      kind: 'ssh', host: 'build.example.com', port: 2222, user: 'deploy', auth: 'key',
      keyPath: 'C:\\keys\\build', workspaceRoot: '/tmp/dsh-cicd',
    }, 'D:\\tmp\\source.bundle', '/tmp/dsh-cicd/run.bundle', join(temp(), 'known_hosts'))
    expect(captured?.[0]).toBe('scp')
    expect(captured).toContain('-P')
    expect(captured).toContain('StrictHostKeyChecking=yes')
    expect(captured?.at(-1)).toBe('deploy@build.example.com:/tmp/dsh-cicd/run.bundle')
  })
})

describe('host key manager', () => {
  it('trusts the first key and pins an expected fingerprint', async () => {
    const key = 'build.example.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITest'
    const runner: ProcessRunner = {
      async run(argv) {
        if (argv[0] === 'ssh-keyscan') return result({ stdout: `${key}\n` })
        if (argv[0] === 'ssh-keygen') return result({ stdout: '256 SHA256:testfingerprint build.example.com (ED25519)\n' })
        return result()
      },
    }
    const path = join(temp(), 'known_hosts')
    const manager = new HostKeyManager(runner)
    const first = await manager.ensure({ host: 'build.example.com', port: 22, knownHostsPath: path, expectedFingerprint: 'SHA256:testfingerprint' })
    expect(first.fingerprint).toBe('SHA256:testfingerprint')
    expect(readFileSync(path, 'utf8')).toContain(key)
    await expect(manager.ensure({
      host: 'build.example.com', port: 22, knownHostsPath: path, expectedFingerprint: 'SHA256:different',
    })).rejects.toMatchObject({ code: 'SSH_HOST_KEY_MISMATCH' })
  })

  it('falls back to a real SSH handshake when ssh-keyscan has a KEX bug', async () => {
    const runner: ProcessRunner = {
      async run(argv) {
        if (argv[0] === 'ssh-keyscan') return result({ code: 1, stderr: 'choose_kex: unsupported KEX method' })
        if (argv[0] === 'ssh') {
          const known = argv.find((value) => value.startsWith('UserKnownHostsFile='))?.slice('UserKnownHostsFile='.length)
          if (known) writeFileSync(known, 'build.example.com ssh-ed25519 AAAATest\n', 'utf8')
          return result({ code: 255, stderr: 'Permission denied (publickey,password)' })
        }
        if (argv[0] === 'ssh-keygen') return result({ stdout: '256 SHA256:fallback build (ED25519)\n' })
        return result()
      },
    }
    const path = join(temp(), 'known_hosts')
    const manager = new HostKeyManager(runner)
    const key = await manager.ensure({ host: 'build.example.com', port: 22, user: 'deploy', knownHostsPath: path })
    expect(key.fingerprint).toBe('SHA256:fallback')
    expect(readFileSync(path, 'utf8')).toContain('AAAATest')
  })
})

describe('remote scripts', () => {
  it('encodes every dynamic value and validates cleanup scope', () => {
    const invocation = buildInvocation({
      workspace: '/tmp/dsh-cicd/run 1',
      commitSha: 'a'.repeat(40),
      toolchainImage: 'node:22-bookworm-slim',
      installCommand: 'npm ci',
      buildCommand: '',
      testCommand: 'npm test',
      dockerfilePath: 'Dockerfile',
      imageRef: 'registry.example.com/team/app:sha-aaaaaaa',
    })
    expect(invocation.args).toHaveLength(8)
    expect(decodeArgForTest(invocation.args[0]!)).toBe('/tmp/dsh-cicd/run 1')
    expect(invocation.script).toContain('docker run --rm')
    expect(invocation.script).toContain('docker build')
    expect(cleanupInvocation('/etc').script).toContain('refusing')
    const prepare = prepareWorkspaceInvocation('/tmp/dsh-cicd/run', '/tmp/dsh-cicd/run.bundle', 'b'.repeat(40))
    expect(decodeArgForTest(prepare.args[0]!)).toBe('/tmp/dsh-cicd/run')
    expect(prepare.script).toContain('git clone --no-checkout')
    expect(prepare.script).toContain('git checkout --detach')
  })
})
