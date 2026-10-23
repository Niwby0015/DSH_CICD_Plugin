import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, normalize, relative, sep } from 'node:path'
import { CicdError } from '../util/errors.js'
import { createId } from '../util/id.js'
import { redactText } from '../security/redactor.js'
import type { ProcessResult, ProcessRunner } from './process.js'
import { GitAuth } from './auth.js'
import { scanFiles, scanPath, type SensitiveFinding } from './sensitive.js'
import type {
  GitBranches,
  GitCommitPreview,
  GitCommitResult,
  GitDiff,
  GitEntry,
  GitInspection,
  GitTarget,
} from './types.js'

const BRANCH_RE = /^[A-Za-z0-9._/-]{1,200}$/
const SHA_RE = /^[0-9a-f]{7,40}$/i
const MAX_DIFF = 32_000
const MAX_PREVIEW = 24_000
const PLAN_TTL_MS = 10 * 60_000
const DEFAULT_TIMEOUT_MS = 60_000
const PUSH_TIMEOUT_MS = 120_000

interface InternalPlan {
  id: string
  pipelineId: string
  root: string
  branch: string
  pushBranch: string
  remoteUrl: string
  message: string
  selectedFiles: string[]
  snapshot: string
  expiresAt: number
}

export interface GitServiceOptions {
  runner: ProcessRunner
  auth?: GitAuth
  now?: () => number
  id?: (prefix: string) => string
}

export interface PrepareInput {
  files?: string[]
  message: string
  pushBranch?: string
}

function assertBranch(branch: string): void {
  if (branch === 'HEAD' || !BRANCH_RE.test(branch) || branch.startsWith('-') || branch.includes('..')) {
    throw new CicdError('INVALID_INPUT', `invalid branch name: ${branch}`, 400)
  }
}

function sanitize(value: string): string {
  const clean = redactText(value)
    .split(/\r?\n/)
    .filter((line) => !/\bhttp\.c:\d+/.test(line))
    .filter((line) => !/^\s*\* (Trying|Connected|CONNECT|schannel|ALPN|using|Request|Recv|Send|Mark|Expire|Closing|Issue|TLS|Server|Host|certificate|CAfile|CApath)/i.test(line))
    .filter((line) => !/^\s*(Send|Recv) header:/i.test(line))
    .slice(-12)
    .join('\n')
    .trim()
  return clean.slice(-3000)
}

function isWithin(root: string, path: string): boolean {
  const resolvedRoot = normalize(root)
  const target = normalize(join(root, ...path.replaceAll('\\', '/').split('/')))
  return target === resolvedRoot || target.startsWith(`${resolvedRoot}${sep}`)
}

function entryKind(index: string, worktree: string): GitEntry['kind'] {
  if (index === '?' && worktree === '?') return 'untracked'
  if (index === 'R' || worktree === 'R') return 'renamed'
  if (index === 'A' || worktree === 'A') return 'added'
  if (index === 'D' || worktree === 'D') return 'deleted'
  return 'modified'
}

function parsePorcelainZ(stdout: string): GitEntry[] {
  const records = stdout.split('\0')
  const entries: GitEntry[] = []
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (!record) continue
    if (record.length < 4) continue
    const x = record[0] ?? ' '
    const y = record[1] ?? ' '
    const path = record.slice(3)
    let originalPath: string | undefined
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') {
      originalPath = records[index + 1]
      index += 1
    }
    entries.push({
      path,
      ...(originalPath ? { originalPath } : {}),
      index: x,
      worktree: y,
      kind: entryKind(x, y),
      staged: x !== ' ' && x !== '?',
      selectable: !scanPath(path).some((finding) => finding.severity === 'block'),
    })
  }
  return entries
}

function parseAheadBehind(stdout: string): { ahead: number; behind: number } {
  const values = stdout.trim().split(/\s+/).map((value) => Number(value))
  const behind = values[0]
  const ahead = values[1]
  return {
    behind: typeof behind === 'number' && Number.isFinite(behind) ? behind : 0,
    ahead: typeof ahead === 'number' && Number.isFinite(ahead) ? ahead : 0,
  }
}

export class GitService {
  private readonly runner: ProcessRunner
  private readonly auth?: GitAuth
  private readonly now: () => number
  private readonly id: (prefix: string) => string
  private readonly plans = new Map<string, InternalPlan>()

  constructor(options: GitServiceOptions) {
    this.runner = options.runner
    this.auth = options.auth
    this.now = options.now ?? (() => Date.now())
    this.id = options.id ?? createId
  }

  async inspect(target: GitTarget): Promise<GitInspection> {
    const projectPath = target.projectPath
    if (!projectPath || !isAbsolute(projectPath)) {
      throw new CicdError('INVALID_INPUT', 'projectPath is not an absolute path', 400)
    }
    try {
      const info = await stat(projectPath)
      if (!info.isDirectory()) throw new Error('not a directory')
    } catch {
      throw new CicdError('GIT_NOT_REPO', `project path does not exist: ${projectPath}`, 400)
    }

    const rootResult = await this.runGit(['rev-parse', '--show-toplevel'], projectPath)
    if (rootResult.code !== 0) throw new CicdError('GIT_NOT_REPO', 'project path is not inside a Git repository', 400)
    const root = rootResult.stdout.trim()
    if (!root) throw new CicdError('GIT_NOT_REPO', 'Git did not return a repository root', 400)

    const branchResult = await this.runGit(['branch', '--show-current'], root)
    const branch = branchResult.stdout.trim() || 'HEAD'
    const headResult = await this.runGitRaw(['rev-parse', '--verify', 'HEAD'], root)
    const headSha = headResult.code === 0 ? headResult.stdout.trim() : ''
    const remoteResult = await this.runGitRaw(['remote', 'get-url', 'origin'], root)
    const originUrl = remoteResult.code === 0 ? remoteResult.stdout.trim() : ''
    const remoteUrl = target.remoteUrl?.trim() || originUrl
    if (remoteUrl.startsWith('-')) {
      throw new CicdError('GIT_INSECURE_REMOTE', 'remote URL must not start with "-"', 400)
    }
    if (/^https?:/i.test(remoteUrl)) {
      try {
        const url = new URL(remoteUrl)
        if (url.username || url.password) {
          throw new CicdError('GIT_INSECURE_REMOTE', 'remote URL contains credentials; remove them and use a credential reference', 400)
        }
      } catch (error) {
        if (error instanceof CicdError) throw error
      }
    }
    const upstreamResult = await this.runGitRaw(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], root)
    const upstream = upstreamResult.code === 0 ? upstreamResult.stdout.trim() : ''
    let ahead = 0
    let behind = 0
    if (upstream) {
      const counts = await this.runGitRaw(['rev-list', '--left-right', '--count', `${upstream}...HEAD`], root)
      if (counts.code === 0) ({ ahead, behind } = parseAheadBehind(counts.stdout))
    }

    const status = await this.runGit(['status', '--porcelain=v1', '-z'], root)
    const entries = parsePorcelainZ(status.stdout)
    const user = await this.runGitRaw(['config', 'user.name'], root)
    const email = await this.runGitRaw(['config', 'user.email'], root)
    const userName = user.code === 0 ? user.stdout.trim() : ''
    const userEmail = email.code === 0 ? email.stdout.trim() : ''
    const defaultFiles = entries.filter((entry) => entry.selectable).map((entry) => entry.path)
    const sensitive = await scanFiles(root, entries.map((entry) => entry.path))
    const sensitivePaths = new Set(sensitive.filter((finding) => finding.severity === 'block').map((finding) => finding.path))
    const diffs = await Promise.all(
      entries
        .filter((entry) => !sensitivePaths.has(entry.path))
        .slice(0, 40)
        .map((entry) => this.diffFor(root, entry)),
    )

    return {
      pipelineId: target.pipelineId ?? '',
      root,
      branch,
      upstream,
      remoteUrl,
      headSha,
      ahead,
      behind,
      clean: entries.length === 0,
      entries,
      defaultFiles,
      diffs,
      sensitive,
      userName,
      userEmail,
    }
  }

  async prepare(target: GitTarget, input: PrepareInput): Promise<GitCommitPreview> {
    const inspection = await this.inspect(target)
    if (inspection.clean) throw new CicdError('GIT_NO_CHANGES', 'working tree has no changes to commit', 400)
    if (!inspection.remoteUrl) throw new CicdError('GIT_NO_REMOTE', 'configure a target repository or origin remote', 400)
    if (!inspection.userName || !inspection.userEmail) {
      throw new CicdError('GIT_NO_IDENTITY', 'Git user.name and user.email must be configured before committing', 400)
    }
    const message = input.message.trim()
    if (!message) throw new CicdError('GIT_MESSAGE_REQUIRED', 'commit message is required', 400)
    if (message.length > 5000) throw new CicdError('INVALID_INPUT', 'commit message is too long', 400)
    const available = new Map(inspection.entries.map((entry) => [entry.path, entry]))
    const selectedFiles = [...new Set(input.files && input.files.length > 0 ? input.files : inspection.defaultFiles)]
    if (selectedFiles.length === 0) throw new CicdError('GIT_NO_CHANGES', 'select at least one file to commit', 400)
    for (const path of selectedFiles) {
      if (!available.has(path)) throw new CicdError('INVALID_INPUT', `file is not in the current working tree: ${path}`, 400)
      if (!isWithin(inspection.root, path)) throw new CicdError('INVALID_INPUT', `path escapes repository: ${path}`, 400)
    }
    const blocking = inspection.sensitive.filter((finding) => selectedFiles.includes(finding.path) && finding.severity === 'block')
    if (blocking.length > 0) {
      throw new CicdError('GIT_SENSITIVE_FILE', 'selected files contain sensitive content', 400, { findings: blocking })
    }
    const pushBranch = input.pushBranch?.trim() || (inspection.branch === 'HEAD' ? '' : inspection.branch)
    if (!pushBranch) throw new CicdError('INVALID_INPUT', 'push branch is required for a detached HEAD', 400)
    assertBranch(pushBranch)
    const snapshot = await this.snapshot(inspection.root, inspection)
    const expiresAt = this.now() + PLAN_TTL_MS
    const plan: InternalPlan = {
      id: this.id('gplan'),
      pipelineId: inspection.pipelineId,
      root: inspection.root,
      branch: inspection.branch,
      pushBranch,
      remoteUrl: inspection.remoteUrl,
      message,
      selectedFiles,
      snapshot,
      expiresAt,
    }
    this.plans.set(plan.id, plan)
    this.prunePlans()
    return {
      planId: plan.id,
      expiresAt,
      pipelineId: inspection.pipelineId,
      root: inspection.root,
      branch: inspection.branch,
      pushBranch,
      remoteUrl: inspection.remoteUrl,
      headSha: inspection.headSha,
      message,
      selectedFiles,
      entries: inspection.entries,
      diffs: inspection.diffs.filter((diff) => selectedFiles.includes(diff.path)),
      sensitive: inspection.sensitive,
      canCommit: true,
    }
  }

  async commit(planId: string, confirmed: boolean): Promise<GitCommitResult> {
    if (!confirmed) throw new CicdError('INVALID_INPUT', 'explicit confirmation is required', 400)
    const plan = this.plans.get(planId)
    if (!plan) throw new CicdError('GIT_PLAN_EXPIRED', 'commit preview not found or expired; preview again', 409)
    if (plan.expiresAt < this.now()) {
      this.plans.delete(planId)
      throw new CicdError('GIT_PLAN_EXPIRED', 'commit preview expired; preview again', 409)
    }
    const current = await this.inspect({
      projectPath: plan.root,
      remoteUrl: plan.remoteUrl,
      pipelineId: plan.pipelineId,
    })
    if (current.clean) throw new CicdError('GIT_NO_CHANGES', 'working tree is now clean', 409)
    if (!current.remoteUrl) throw new CicdError('GIT_NO_REMOTE', 'target repository is not configured', 400)
    if (!current.userName || !current.userEmail) {
      throw new CicdError('GIT_NO_IDENTITY', 'Git user.name and user.email must be configured before committing', 400)
    }
    const blocking = current.sensitive.filter((finding) => plan.selectedFiles.includes(finding.path) && finding.severity === 'block')
    if (blocking.length > 0) {
      throw new CicdError('GIT_SENSITIVE_FILE', 'selected files now contain sensitive content', 400, { findings: blocking })
    }
    const snapshot = await this.snapshot(current.root, current)
    if (snapshot !== plan.snapshot) {
      throw new CicdError('GIT_WORKTREE_CHANGED', 'working tree changed since preview; preview again', 409)
    }
    const currentPaths = new Set(current.entries.map((entry) => entry.path))
    for (const path of plan.selectedFiles) {
      if (!currentPaths.has(path)) throw new CicdError('GIT_WORKTREE_CHANGED', `file disappeared since preview: ${path}`, 409)
    }

    const hooksDir = await mkdtemp(join(tmpdir(), 'dsh-cicd-hooks-'))
    try {
      const add = await this.runGit(['add', '-A', '--', ...plan.selectedFiles], current.root)
      if (add.code !== 0) throw this.commandError('git add', add)
      const staged = await this.runGitRaw(['diff', '--cached', '--quiet'], current.root)
      if (staged.code > 1) throw this.commandError('git diff --cached', staged)
      if (staged.code === 0) throw new CicdError('GIT_NO_CHANGES', 'selected files have no staged changes', 409)
      const commit = await this.runGit(
        ['-c', `core.hooksPath=${hooksDir}`, 'commit', '--no-verify', '-F', '-'],
        current.root,
        { stdin: plan.message.endsWith('\n') ? plan.message : `${plan.message}\n` },
      )
      if (commit.code !== 0) throw this.commandError('git commit', commit)
      const shaResult = await this.runGit(['rev-parse', 'HEAD'], current.root)
      if (shaResult.code !== 0) throw this.commandError('git rev-parse HEAD', shaResult)
      const commitSha = shaResult.stdout.trim()
      if (!/^[0-9a-f]{40}$/i.test(commitSha)) throw new CicdError('GIT_COMMAND_FAILED', 'Git returned an invalid commit SHA', 502)

      const auth = await this.authFor(current.remoteUrl)
      try {
        const remoteSha = await this.pushRef(
          current.root,
          plan.remoteUrl,
          plan.pushBranch,
          commitSha,
          auth.env,
          hooksDir,
        )
        this.plans.delete(planId)
        return {
          commitSha,
          branch: plan.branch,
          pushBranch: plan.pushBranch,
          remoteUrl: current.remoteUrl,
          remoteSha,
          verified: true,
          pushed: true,
          message: plan.message,
          committedAt: this.now(),
        }
      } finally {
        await auth.cleanup()
      }
    } finally {
      await rm(hooksDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  /** Retry the push for an existing local commit after a failed push. */
  async push(target: GitTarget, branch: string, expectedSha?: string): Promise<GitCommitResult> {
    assertBranch(branch)
    const inspection = await this.inspect(target)
    if (!inspection.remoteUrl) throw new CicdError('GIT_NO_REMOTE', 'target repository is not configured', 400)
    if (!inspection.headSha) throw new CicdError('GIT_NO_CHANGES', 'repository has no HEAD commit', 400)
    if (expectedSha && expectedSha !== inspection.headSha) {
      throw new CicdError('GIT_COMMIT_MISMATCH', 'local HEAD no longer matches the commit from the failed push', 409, {
        expectedSha,
        localSha: inspection.headSha,
      })
    }
    const hooksDir = await mkdtemp(join(tmpdir(), 'dsh-cicd-hooks-'))
    try {
      const auth = await this.authFor(inspection.remoteUrl)
      try {
        const remoteSha = await this.pushRef(
          inspection.root,
          inspection.remoteUrl,
          branch,
          inspection.headSha,
          auth.env,
          hooksDir,
        )
        return {
          commitSha: inspection.headSha,
          branch: inspection.branch,
          pushBranch: branch,
          remoteUrl: inspection.remoteUrl,
          remoteSha,
          verified: true,
          pushed: true,
          message: '',
          committedAt: this.now(),
        }
      } finally {
        await auth.cleanup()
      }
    } finally {
      await rm(hooksDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  private async pushRef(
    root: string,
    remoteUrl: string,
    pushBranch: string,
    commitSha: string,
    env: Record<string, string>,
    hooksDir: string,
  ): Promise<string> {
    const push = await this.runGit(
      [
        '-c', 'credential.helper=',
        '-c', `core.hooksPath=${hooksDir}`,
        'push', '--porcelain', remoteUrl, `HEAD:refs/heads/${pushBranch}`,
      ],
      root,
      { env, timeoutMs: PUSH_TIMEOUT_MS },
    )
    if (push.code !== 0) {
      const raw = `${push.stderr}\n${push.stdout}`
      const output = sanitize(raw)
      if (/\b401\b|authentication failed|could not read username|terminal prompts disabled|permission denied \(publickey\)/i.test(raw)) {
        throw new CicdError(
          'GIT_AUTH_FAILED',
          'GitHub authentication failed (401). Configure a PAT with Contents: Read and write (or classic repo scope), then retry the push.',
          401,
          { commitSha, pushBranch },
        )
      }
      if (/\b403\b|permission to .* denied|protected branch|pre-receive hook declined|not allowed to push/i.test(raw)) {
        throw new CicdError(
          'GIT_PUSH_DENIED',
          'GitHub rejected the push (403 or branch protection). Check token permissions, repository access, and branch protection rules.',
          403,
          { commitSha, pushBranch },
        )
      }
      throw new CicdError('GIT_PUSH_FAILED', output || 'git push failed', 502, {
        commitSha,
        pushBranch,
      })
    }
    const remote = await this.runGit(
      ['-c', 'credential.helper=', 'ls-remote', '--heads', remoteUrl, `refs/heads/${pushBranch}`],
      root,
      { env, timeoutMs: PUSH_TIMEOUT_MS },
    )
    if (remote.code !== 0) throw this.commandError('git ls-remote', remote)
    const remoteSha = remote.stdout.trim().split(/\s+/)[0] ?? ''
    if (remoteSha !== commitSha) {
      throw new CicdError('GIT_REMOTE_MISMATCH', 'remote branch does not point at the committed SHA', 502, {
        commitSha,
        remoteSha,
        pushBranch,
      })
    }
    return remoteSha
  }

  async branches(target: GitTarget): Promise<GitBranches> {    const inspection = await this.inspect(target)
    const localResult = await this.runGit(['branch', '--format=%(refname:short)'], inspection.root)
    const local = localResult.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    let remote: string[] = []
    if (inspection.remoteUrl) {
      const auth = await this.authFor(inspection.remoteUrl)
      try {
        const result = await this.runGit(
          ['-c', 'credential.helper=', 'ls-remote', '--heads', inspection.remoteUrl],
          inspection.root,
          { env: auth.env, timeoutMs: PUSH_TIMEOUT_MS },
        )
        if (result.code === 0) {
          remote = result.stdout
            .split(/\r?\n/)
            .map((line) => line.split('\t')[1] ?? '')
            .filter((ref) => ref.startsWith('refs/heads/'))
            .map((ref) => ref.slice('refs/heads/'.length))
        }
      } finally {
        await auth.cleanup()
      }
    }
    return { current: inspection.branch, local, remote: [...new Set(remote)].sort() }
  }

  async resolveCommit(target: GitTarget, ref: string): Promise<string> {
    const inspection = await this.inspect(target)
    const candidate = ref.trim()
    if (!candidate || candidate.startsWith('-') || (!SHA_RE.test(candidate) && !BRANCH_RE.test(candidate))) {
      throw new CicdError('INVALID_INPUT', 'invalid branch or commit SHA', 400)
    }
    const local = await this.runGitRaw(['rev-parse', '--verify', `${candidate}^{commit}`], inspection.root)
    if (local.code === 0) return local.stdout.trim()
    if (!inspection.remoteUrl) throw new CicdError('GIT_REF_NOT_FOUND', 'ref not found and target repository is not configured', 404)
    const auth = await this.authFor(inspection.remoteUrl)
    try {
      const fetched = await this.runGit(
        ['-c', 'credential.helper=', 'fetch', '--no-tags', inspection.remoteUrl, candidate],
        inspection.root,
        { env: auth.env, timeoutMs: PUSH_TIMEOUT_MS },
      )
      if (fetched.code !== 0) throw new CicdError('GIT_REF_NOT_FOUND', `cannot resolve ref: ${candidate}`, 404)
    } finally {
      await auth.cleanup()
    }
    const checked = await this.runGitRaw(['rev-parse', '--verify', `${candidate}^{commit}`], inspection.root)
    if (checked.code !== 0) throw new CicdError('GIT_REF_NOT_FOUND', `cannot resolve ref: ${candidate}`, 404)
    return checked.stdout.trim()
  }

  private async diffFor(root: string, entry: GitEntry): Promise<GitDiff> {
    if (entry.kind === 'untracked') {
      if (!isWithin(root, entry.path)) return { path: entry.path, text: '', truncated: false, binary: false }
      try {
        const buffer = await readFile(join(root, ...entry.path.split('/')))
        if (buffer.includes(0)) return { path: entry.path, text: '', truncated: false, binary: true }
        const text = buffer.toString('utf8')
        return {
          path: entry.path,
          text: text.length > MAX_PREVIEW ? `${text.slice(0, MAX_PREVIEW)}\n…(truncated)` : text,
          truncated: text.length > MAX_PREVIEW,
          binary: false,
        }
      } catch {
        return { path: entry.path, text: '', truncated: false, binary: false }
      }
    }
    const result = await this.runGitRaw(['diff', 'HEAD', '--no-ext-diff', '--unified=3', '--', entry.path], root)
    let text = result.code === 0 ? result.stdout : ''
    if (!text) {
      const cached = await this.runGitRaw(['diff', '--cached', '--no-ext-diff', '--unified=3', '--', entry.path], root)
      text = cached.code === 0 ? cached.stdout : ''
    }
    const binary = /Binary files|GIT binary patch/.test(text)
    return {
      path: entry.path,
      text: binary ? '' : text.length > MAX_DIFF ? `${text.slice(0, MAX_DIFF)}\n…(truncated)` : text,
      truncated: text.length > MAX_DIFF,
      binary,
    }
  }

  private async snapshot(root: string, inspection: GitInspection): Promise<string> {
    const hash = createHash('sha256')
    hash.update(`${inspection.branch}\0${inspection.headSha}\0${inspection.remoteUrl}\0`)
    for (const entry of [...inspection.entries].sort((a, b) => a.path.localeCompare(b.path))) {
      hash.update(`${entry.path}\0${entry.index}${entry.worktree}\0`)
      if (entry.kind === 'untracked') {
        try {
          const buffer = await readFile(join(root, ...entry.path.split('/')))
          hash.update(createHash('sha256').update(buffer).digest('hex'))
        } catch {
          hash.update('missing')
        }
      } else {
        const diff = await this.runGitRaw(['diff', 'HEAD', '--binary', '--', entry.path], root)
        if (diff.code === 0) hash.update(diff.stdout)
        else {
          const cached = await this.runGitRaw(['diff', '--cached', '--binary', '--', entry.path], root)
          hash.update(cached.stdout)
        }
      }
    }
    return hash.digest('hex')
  }

  private async authFor(remoteUrl: string) {
    if (!this.auth) return { env: { GIT_TERMINAL_PROMPT: '0' }, cleanup: async () => {} }
    return this.auth.prepare(remoteUrl)
  }

  private prunePlans(): void {
    const now = this.now()
    for (const [id, plan] of this.plans) if (plan.expiresAt < now) this.plans.delete(id)
  }

  private commandError(action: string, result: ProcessResult): CicdError {
    const detail = sanitize(result.stderr || result.stdout || 'no output')
    if (result.timedOut) {
      return new CicdError('GIT_TIMEOUT', `${action} timed out`, 504)
    }
    return new CicdError('GIT_COMMAND_FAILED', `${action} failed (exit ${result.code})${detail ? `: ${detail}` : ''}`, 502)
  }

  private async runGit(
    args: string[],
    cwd: string,
    options: { stdin?: string; env?: Record<string, string>; timeoutMs?: number } = {},
  ): Promise<ProcessResult> {
    return this.runner.run(['git', '-c', 'http.verbose=false', ...args], {
      cwd,
      stdin: options.stdin,
      env: {
        GIT_TERMINAL_PROMPT: '0',
        GIT_PAGER: 'cat',
        GIT_LITERAL_PATHSPECS: '1',
        GIT_CURL_VERBOSE: '0',
        GIT_TRACE: '0',
        GIT_TRACE_CURL: '0',
        GIT_HTTP_TRACE: '0',
        ...options.env,
      },
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBytes: 8 * 1024 * 1024,
    })
  }

  private async runGitRaw(args: string[], cwd: string): Promise<ProcessResult> {
    return this.runGit(args, cwd)
  }
}
