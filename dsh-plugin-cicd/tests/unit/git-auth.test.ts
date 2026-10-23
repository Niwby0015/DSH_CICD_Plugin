import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GitAuth } from '../../src/host/git/auth.js'

describe('GitAuth', () => {
  it('does not put the token in argv and cleans up the askpass helper', async () => {
    const auth = new GitAuth(async () => 'ghp_this_is_a_fake_token_1234567890')
    const prepared = await auth.prepare('https://github.com/acme/demo.git')
    expect(prepared.env.GIT_TERMINAL_PROMPT).toBe('0')
    expect(prepared.env.CICD_GIT_TOKEN).toContain('ghp_')
    const script = prepared.env.GIT_ASKPASS
    expect(script).toBeTruthy()
    const contents = readFileSync(script as string, 'utf8')
    expect(contents).not.toContain('ghp_this_is_a_fake_token')
    await prepared.cleanup()
    expect(() => readFileSync(script as string, 'utf8')).toThrow()
  })

  it('does not invent an askpass helper for a local or SSH remote', async () => {
    const auth = new GitAuth(async () => 'unused')
    const prepared = await auth.prepare('ssh://git@example.com/acme/demo.git')
    expect(prepared.env.GIT_ASKPASS).toBeUndefined()
    expect(prepared.env.CICD_GIT_TOKEN).toBeUndefined()
    await prepared.cleanup()
  })
})
