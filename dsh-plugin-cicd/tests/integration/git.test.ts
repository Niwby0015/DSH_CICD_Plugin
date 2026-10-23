import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { GitService } from '../../src/host/git/git-service.js'
import { LocalProcessRunner } from '../../src/host/git/process.js'

const dirs: string[] = []

function temp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

function git(cwd: string, args: string[], input?: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
}

function setupRepo(): { root: string; remote: string; initialSha: string } {
  const root = temp('dsh-cicd-git-')
  const remote = temp('dsh-cicd-remote-')
  git(root, ['init', '-q', '-b', 'main'])
  git(root, ['config', 'user.name', 'Test User'])
  git(root, ['config', 'user.email', 'test@example.com'])
  writeFileSync(join(root, 'app.txt'), 'one\n', 'utf8')
  git(root, ['add', 'app.txt'])
  git(root, ['commit', '-q', '-m', 'initial'])
  git(remote, ['init', '-q', '--bare'])
  git(root, ['remote', 'add', 'origin', remote])
  git(root, ['push', '-q', '-u', 'origin', 'main'])
  return { root, remote, initialSha: git(root, ['rev-parse', 'HEAD']).trim() }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('GitService', () => {
  it('inspects, previews, commits and verifies the pushed SHA', async () => {
    const { root, remote } = setupRepo()
    writeFileSync(join(root, 'app.txt'), 'two\n', 'utf8')
    writeFileSync(join(root, 'new.txt'), 'new\n', 'utf8')
    writeFileSync(join(root, '.env'), 'TOKEN=very-secret\n', 'utf8')

    const service = new GitService({ runner: new LocalProcessRunner(), now: () => 1_700_000_000_000 })
    const inspection = await service.inspect({ projectPath: root, pipelineId: 'pl_test' })
    expect(inspection.branch).toBe('main')
    expect(inspection.clean).toBe(false)
    expect(inspection.entries.some((entry) => entry.path === '.env')).toBe(true)
    expect(inspection.defaultFiles).toContain('app.txt')
    expect(inspection.defaultFiles).not.toContain('.env')
    expect(inspection.sensitive.some((finding) => finding.path === '.env')).toBe(true)
    expect(inspection.userName).toBe('Test User')

    await expect(service.prepare({ projectPath: root, pipelineId: 'pl_test' }, { files: ['.env'], message: 'unsafe' })).rejects.toMatchObject({
      code: 'GIT_SENSITIVE_FILE',
    })

    const preview = await service.prepare({ projectPath: root, pipelineId: 'pl_test' }, {
      files: ['app.txt', 'new.txt'],
      message: 'feat: update app',
      pushBranch: 'main',
    })
    expect(preview.canCommit).toBe(true)
    expect(preview.selectedFiles).toEqual(['app.txt', 'new.txt'])
    expect(preview.diffs.some((diff) => diff.path === 'app.txt')).toBe(true)
    expect(preview.diffs.some((diff) => diff.path === '.env')).toBe(false)

    const result = await service.commit(preview.planId, true)
    expect(result.commitSha).toMatch(/^[0-9a-f]{40}$/)
    expect(result.verified).toBe(true)
    expect(result.pushed).toBe(true)
    expect(git(remote, ['rev-parse', 'refs/heads/main']).trim()).toBe(result.commitSha)
    expect(git(remote, ['show', `${result.commitSha}:app.txt`])).toBe('two\n')
    expect(git(remote, ['show', `${result.commitSha}:new.txt`])).toBe('new\n')
    expect(git(remote, ['ls-tree', '--name-only', result.commitSha]).includes('.env')).toBe(false)
  })

  it('rejects a commit when the worktree changed after preview', async () => {
    const { root } = setupRepo()
    writeFileSync(join(root, 'app.txt'), 'two\n', 'utf8')
    const service = new GitService({ runner: new LocalProcessRunner(), now: () => 1_700_000_000_000 })
    const preview = await service.prepare({ projectPath: root, pipelineId: 'pl_test' }, { files: ['app.txt'], message: 'change' })
    writeFileSync(join(root, 'app.txt'), 'three\n', 'utf8')
    await expect(service.commit(preview.planId, true)).rejects.toMatchObject({ code: 'GIT_WORKTREE_CHANGED' })
  })

  it('resolves local refs and lists branches', async () => {
    const { root, initialSha } = setupRepo()
    const service = new GitService({ runner: new LocalProcessRunner() })
    await expect(service.resolveCommit({ projectPath: root, pipelineId: 'pl_test' }, 'main')).resolves.toBe(initialSha)
    await expect(service.resolveCommit({ projectPath: root, pipelineId: 'pl_test' }, initialSha)).resolves.toBe(initialSha)
    const branches = await service.branches({ projectPath: root, pipelineId: 'pl_test' })
    expect(branches.current).toBe('main')
    expect(branches.local).toContain('main')
    expect(branches.remote).toContain('main')
  })

  it('pushes to an explicit target repository without changing origin', async () => {
    const { root, remote } = setupRepo()
    const target = temp('dsh-cicd-target-')
    git(target, ['init', '-q', '--bare'])
    writeFileSync(join(root, 'app.txt'), 'target\n', 'utf8')
    const service = new GitService({ runner: new LocalProcessRunner(), now: () => 1_700_000_000_000 })
    const preview = await service.prepare(
      { projectPath: root, remoteUrl: target, pipelineId: 'pl_test' },
      { files: ['app.txt'], message: 'target push' },
    )
    expect(preview.remoteUrl).toBe(target)
    const result = await service.commit(preview.planId, true)
    expect(git(target, ['rev-parse', 'refs/heads/main']).trim()).toBe(result.commitSha)
    expect(git(remote, ['rev-parse', 'refs/heads/main']).trim()).not.toBe(result.commitSha)
  })

  it('keeps the local commit when push fails and retries after the remote is fixed', async () => {
    const { root } = setupRepo()
    const target = temp('dsh-cicd-broken-target-')
    writeFileSync(join(root, 'app.txt'), 'retry\n', 'utf8')
    const service = new GitService({ runner: new LocalProcessRunner(), now: () => 1_700_000_000_000 })
    const preview = await service.prepare(
      { projectPath: root, remoteUrl: target, pipelineId: 'pl_test' },
      { files: ['app.txt'], message: 'retry push' },
    )
    let failed: unknown
    try {
      await service.commit(preview.planId, true)
    } catch (error) {
      failed = error
    }
    expect(failed).toMatchObject({ code: 'GIT_PUSH_FAILED' })
    const commitSha = (failed as { details?: { commitSha?: string } }).details?.commitSha
    expect(commitSha).toMatch(/^[0-9a-f]{40}$/)

    git(target, ['init', '-q', '--bare'])
    const pushed = await service.push({ projectPath: root, remoteUrl: target }, 'main', commitSha)
    expect(pushed.verified).toBe(true)
    expect(git(target, ['rev-parse', 'refs/heads/main']).trim()).toBe(commitSha)
  })
})

