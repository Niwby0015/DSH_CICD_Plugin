import type { BuildPlan } from '../language/types.js'

export type RunnerKind = 'ssh'

export type SshAuthKind = 'agent' | 'key' | 'password'

export interface SshRunnerConfig {
  kind: 'ssh'
  host: string
  port: number
  user: string
  auth: SshAuthKind
  keyPath?: string
  /** DSH credential reference; the value is resolved only inside the Host. */
  passwordRef?: string
  knownHostsPath?: string
  expectedFingerprint?: string
  workspaceRoot: string
  connectTimeoutSec?: number
}

export interface RunnerCheck {
  name: string
  ok: boolean
  detail: string
  optional?: boolean
}

export interface RunnerCapability {
  kind: RunnerKind
  available: boolean
  reason: string
  checks?: RunnerCheck[]
}

export interface RunnerPreflight {
  ok: boolean
  checks: RunnerCheck[]
}

export interface BuildJob {
  runId: string
  projectPath: string
  commitSha: string
  workspace: string
  buildPlan: BuildPlan
  imageRef: string
  onStage?: (stage: 'source' | 'build' | 'image', status: 'running' | 'succeeded') => void
  onLog?: (stage: 'source' | 'build' | 'image', stream: 'stdout' | 'stderr', text: string) => void
}

export interface RunnerResult {
  ok: boolean
  workspace: string
  commitSha: string
  imageRef: string
  imageDigest: string
  logs: string[]
}

export interface BuildRunner {
  readonly kind: RunnerKind
  capability(config?: SshRunnerConfig): Promise<RunnerCapability>
  preflight(config: SshRunnerConfig, signal?: AbortSignal): Promise<RunnerPreflight>
  build(config: SshRunnerConfig, job: BuildJob, signal?: AbortSignal): Promise<RunnerResult>
  cleanup(config: SshRunnerConfig, workspace: string, signal?: AbortSignal): Promise<void>
}
