import { describe, expect, it } from 'vitest'
import { redactText, redactValue } from '../../src/host/security/redactor.js'

describe('redactor', () => {
  it('removes known secret values exactly', () => {
    const token = 'super-secret-value-123'
    const text = `git push with ${token} failed`
    expect(redactText(text, [token])).toBe('git push with [REDACTED] failed')
  })

  it('redacts GitHub tokens and bearer headers', () => {
    const fakeToken = `ghp_${'x'.repeat(30)}`
    const text = `token=${fakeToken} authorization: Bearer abcdefghijklmnop`
    const out = redactText(text)
    expect(out).not.toContain(fakeToken)
    expect(out).not.toContain('abcdefghijklmnop')
  })

  it('redacts private key blocks', () => {
    const key = '-----BEGIN OPENSSH PRIVATE KEY-----\nabcdef\n-----END OPENSSH PRIVATE KEY-----'
    expect(redactText(`key:\n${key}\n`)).toContain('[REDACTED PRIVATE KEY]')
  })

  it('redacts object fields whose names look secret', () => {
    const out = redactValue(
      { password: 'p', nested: { token: 't', visible: 'ok' }, list: ['Bearer abcdefghijklmnop'] },
      ['p'],
    )
    expect(out.password).toBe('[REDACTED]')
    expect(out.nested.token).toBe('[REDACTED]')
    expect(out.nested.visible).toBe('ok')
    expect(out.list[0]).not.toContain('abcdefghijklmnop')
  })
})
