import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { scanFile, scanPath } from '../../src/host/git/sensitive.js'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('sensitive file scan', () => {
  it('blocks known secret names but allows env examples', () => {
    expect(scanPath('.env').length).toBeGreaterThan(0)
    expect(scanPath('config/.env.production').length).toBeGreaterThan(0)
    expect(scanPath('.env.example')).toEqual([])
    expect(scanPath('deploy/tls/server.pem').length).toBeGreaterThan(0)
    expect(scanPath('kubeconfig').length).toBeGreaterThan(0)
  })

  it('finds private keys and tokens without returning their values', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-cicd-sensitive-'))
    dirs.push(dir)
    const key = '-----BEGIN OPENSSH PRIVATE KEY-----\nsecret\n-----END OPENSSH PRIVATE KEY-----'
    writeFileSync(join(dir, 'notes.txt'), key, 'utf8')
    const findings = await scanFile(dir, 'notes.txt')
    expect(findings.some((finding) => finding.code === 'PRIVATE_KEY')).toBe(true)
    expect(JSON.stringify(findings)).not.toContain('secret')
  })
})
