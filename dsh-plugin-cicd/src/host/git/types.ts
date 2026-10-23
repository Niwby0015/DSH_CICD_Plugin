import type { SensitiveFinding } from './sensitive.js'

export interface GitTarget {
  projectPath: string
  /** Optional push target. Empty means use the repository's origin. */
  remoteUrl?: string
  /** Optional pipeline association for plan metadata only. */
  pipelineId?: string
}

export interface GitWorkspace {
  path: string
  title: string
}

export interface GitEntry {
  path: string
  originalPath?: string
  index: string
  worktree: string
  kind: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
  staged: boolean
  selectable: boolean
}

export interface GitDiff {
  path: string
  text: string
  truncated: boolean
  binary: boolean
}

export interface GitInspection {
  pipelineId: string
  root: string
  branch: string
  upstream: string
  remoteUrl: string
  headSha: string
  ahead: number
  behind: number
  clean: boolean
  entries: GitEntry[]
  defaultFiles: string[]
  diffs: GitDiff[]
  sensitive: SensitiveFinding[]
  userName: string
  userEmail: string
}

export interface GitCommitPreview {
  planId: string
  expiresAt: number
  pipelineId: string
  root: string
  branch: string
  pushBranch: string
  remoteUrl: string
  headSha: string
  message: string
  selectedFiles: string[]
  entries: GitEntry[]
  diffs: GitDiff[]
  sensitive: SensitiveFinding[]
  canCommit: boolean
}

export interface GitCommitResult {
  commitSha: string
  branch: string
  pushBranch: string
  remoteUrl: string
  remoteSha: string
  verified: boolean
  pushed: boolean
  message: string
  committedAt: number
}

export interface GitBranches {
  current: string
  local: string[]
  remote: string[]
}
