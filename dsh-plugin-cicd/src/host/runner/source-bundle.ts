import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CicdError } from '../util/errors.js'
import type { ProcessRunner } from '../git/process.js'

export interface SourceBundle {
  path: string
  commitSha: string
  cleanup(): Promise<void>
}

const SHA_RE = /^[0-9a-f]{40}$/i

/**
 * Create a bundle containing exactly one commit. A temporary ref is required
 * because `git bundle create` refuses a detached SHA.
 */
export async function createSourceBundle(
  runner: ProcessRunner,
  repoRoot: string,
  commitSha: string,
): Promise<SourceBundle> {
  if (!SHA_RE.test(commitSha)) throw new CicdError('INVALID_INPUT', 'commitSha must be 40 hex characters', 400)
  const dir = await mkdtemp(join(tmpdir(), 'dsh-cicd-bundle-'))
  const path = join(dir, 'source.bundle')
  const ref = `refs/heads/dsh-cicd-source-${commitSha.slice(0, 12)}`
  let refCreated = false
  try {
    const update = await runner.run(['git', 'update-ref', ref, commitSha], { cwd: repoRoot, timeoutMs: 30_000 })
    if (update.code !== 0) throw new CicdError('GIT_REF_NOT_FOUND', update.stderr || 'commit is not available locally', 404)
    refCreated = true
    const bundle = await runner.run(['git', 'bundle', 'create', path, ref], { cwd: repoRoot, timeoutMs: 120_000 })
    if (bundle.code !== 0) throw new CicdError('GIT_COMMAND_FAILED', bundle.stderr || 'git bundle failed', 502)
    const verify = await runner.run(['git', 'bundle', 'verify', path], { cwd: repoRoot, timeoutMs: 30_000 })
    if (verify.code !== 0) throw new CicdError('GIT_COMMAND_FAILED', verify.stderr || 'bundle verification failed', 502)
    return {
      path,
      commitSha,
      cleanup: async () => {
        await rm(dir, { recursive: true, force: true }).catch(() => {})
      },
    }
  } catch (error) {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
    throw error
  } finally {
    if (refCreated) {
      await runner.run(['git', 'update-ref', '-d', ref], { cwd: repoRoot, timeoutMs: 30_000 }).catch(() => {})
    }
  }
}
