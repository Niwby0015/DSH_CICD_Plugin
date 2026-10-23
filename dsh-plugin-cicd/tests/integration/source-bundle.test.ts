import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { LocalProcessRunner } from '../../src/host/git/process.js'
import { createSourceBundle } from '../../src/host/runner/source-bundle.js'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function setupRepo(): { root: string; sha: string } {
  const root = mkdtempSync(join(tmpdir(), 'dsh-cicd-bundle-repo-'))
  dirs.push(root)
  const run = (argv: string[]) => {
    const result = spawnSync('git', argv, { cwd: root, encoding: 'utf8' })
    if (result.status !== 0) throw new Error(`${argv.join(' ')}: ${result.stderr}`)
    return result.stdout
  }
  run(['init', '-q', '-b', 'main'])
  run(['config', 'user.name', 'Test'])
  run(['config', 'user.email', 'test@example.com'])
  writeFileSync(join(root, 'app.txt'), 'one\n', 'utf8')
  run(['add', 'app.txt'])
  run(['commit', '-qm', 'one'])
  return { root, sha: run(['rev-parse', 'HEAD']).trim() }
}

describe('source bundle', () => {
  it('creates and verifies a bundle for one exact commit and removes the temporary ref', async () => {
    const { root, sha } = setupRepo()
    const bundle = await createSourceBundle(new LocalProcessRunner(), root, sha)
    expect(existsSync(bundle.path)).toBe(true)
    const verify = spawnSync('git', ['bundle', 'verify', bundle.path], { cwd: root, encoding: 'utf8' })
    expect(verify.status, verify.stderr).toBe(0)
    const refs = spawnSync('git', ['for-each-ref', `refs/heads/dsh-cicd-source-${sha.slice(0, 12)}`], { cwd: root, encoding: 'utf8' })
    expect(refs.stdout.trim()).toBe('')
    const clone = mkdtempSync(join(tmpdir(), 'dsh-cicd-bundle-clone-'))
    dirs.push(clone)
    const cloned = spawnSync('git', ['clone', '--no-checkout', bundle.path, clone], { encoding: 'utf8' })
    expect(cloned.status, cloned.stderr).toBe(0)
    const checkedOut = spawnSync('git', ['checkout', '--detach', sha], { cwd: clone, encoding: 'utf8' })
    expect(checkedOut.status, checkedOut.stderr).toBe(0)
    expect(spawnSync('git', ['rev-parse', 'HEAD'], { cwd: clone, encoding: 'utf8' }).stdout.trim()).toBe(sha)
    await bundle.cleanup()
    expect(existsSync(bundle.path)).toBe(false)
  })

  it('rejects a missing commit', async () => {
    const { root } = setupRepo()
    await expect(createSourceBundle(new LocalProcessRunner(), root, 'f'.repeat(40))).rejects.toMatchObject({ code: 'GIT_REF_NOT_FOUND' })
  })
})
