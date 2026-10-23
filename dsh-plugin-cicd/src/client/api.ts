import type {
  BootstrapPayload,
  LogRecord,
  PipelineDetailPayload,
  PipelineDraft,
  PipelineSummary,
  RunDetail,
  RunSummary,
  SavePipelinePayload,
} from '../host/domain/types.js'
import type { BuildPlan, BuildPlanInput, DetectionResult } from '../host/language/types.js'
import type { RunnerPreflight, SshRunnerConfig } from '../host/runner/types.js'
import type { GitBranches, GitCommitPreview, GitCommitResult, GitInspection, GitTarget } from '../host/git/types.js'
import type { GitWorkspace } from '../host/git/types.js'

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: unknown

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

async function request<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  const url = new URL(path, document.baseURI)
  const response = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    signal,
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error
    throw new ApiError(
      error?.code ?? `HTTP_${response.status}`,
      error?.message ?? `HTTP ${response.status}`,
      response.status,
      error?.details,
    )
  }
  return payload as T
}

export const api = {
  bootstrap(signal?: AbortSignal): Promise<BootstrapPayload> {
    return request('api/cicd/bootstrap', {}, signal)
  },

  getPipeline(id: string, signal?: AbortSignal): Promise<PipelineDetailPayload> {
    return request(`api/cicd/pipeline?id=${encodeURIComponent(id)}`, {}, signal)
  },

  savePipeline(id: string | undefined, pipeline: PipelineDraft, signal?: AbortSignal): Promise<SavePipelinePayload> {
    return request(
      'api/cicd/pipelines',
      {
        method: 'POST',
        body: JSON.stringify(id ? { id, pipeline } : { pipeline }),
      },
      signal,
    )
  },

  deletePipeline(id: string, signal?: AbortSignal): Promise<{ deleted: boolean }> {
    return request(`api/cicd/pipeline?id=${encodeURIComponent(id)}`, { method: 'DELETE' }, signal)
  },

  listRuns(pipelineId?: string, signal?: AbortSignal): Promise<{ runs: RunSummary[] }> {
    const query = pipelineId ? `?pipelineId=${encodeURIComponent(pipelineId)}` : ''
    return request(`api/cicd/runs${query}`, {}, signal)
  },

  getRun(id: string, signal?: AbortSignal): Promise<RunDetail> {
    return request(`api/cicd/run?id=${encodeURIComponent(id)}`, {}, signal)
  },

  getLogs(
    id: string,
    stage: string | undefined,
    after: number,
    signal?: AbortSignal,
  ): Promise<{ logs: LogRecord[] }> {
    const params = new URLSearchParams({ id, after: String(after) })
    if (stage) params.set('stage', stage)
    return request(`api/cicd/logs?${params.toString()}`, {}, signal)
  },

  startRun(pipelineId: string, signal?: AbortSignal): Promise<RunDetail> {
    return request('api/cicd/run/start', { method: 'POST', body: JSON.stringify({ pipelineId }) }, signal)
  },

  cancelRun(runId: string, signal?: AbortSignal): Promise<RunDetail> {
    return request('api/cicd/run/cancel', { method: 'POST', body: JSON.stringify({ runId }) }, signal)
  },

  inspectGit(target: GitTarget, signal?: AbortSignal): Promise<GitInspection> {
    return request('api/cicd/git/inspect', { method: 'POST', body: JSON.stringify(target) }, signal)
  },

  prepareGit(
    target: GitTarget,
    input: { files: string[]; message: string; pushBranch: string },
    signal?: AbortSignal,
  ): Promise<GitCommitPreview> {
    return request('api/cicd/git/prepare', {
      method: 'POST',
      body: JSON.stringify({ ...target, ...input }),
    }, signal)
  },

  commitGit(planId: string, signal?: AbortSignal): Promise<GitCommitResult> {
    return request('api/cicd/git/commit', {
      method: 'POST',
      body: JSON.stringify({ planId, confirm: true }),
    }, signal)
  },

  pushGit(target: GitTarget, branch: string, commitSha: string, signal?: AbortSignal): Promise<GitCommitResult> {
    return request('api/cicd/git/push', {
      method: 'POST',
      body: JSON.stringify({ ...target, branch, commitSha }),
    }, signal)
  },

  gitBranches(target: GitTarget, signal?: AbortSignal): Promise<GitBranches> {
    return request('api/cicd/git/branches', { method: 'POST', body: JSON.stringify(target) }, signal)
  },

  gitWorkspaces(signal?: AbortSignal): Promise<{ workspaces: GitWorkspace[] }> {
    return request('api/cicd/git/workspaces', {}, signal)
  },

  detectBuild(input: { projectPath: string; projectSubdir?: string }, signal?: AbortSignal): Promise<DetectionResult> {
    return request('api/cicd/build/detect', { method: 'POST', body: JSON.stringify(input) }, signal)
  },

  planBuild(input: BuildPlanInput, signal?: AbortSignal): Promise<BuildPlan> {
    return request('api/cicd/build/plan', { method: 'POST', body: JSON.stringify(input) }, signal)
  },

  runnerPreflight(config: SshRunnerConfig, signal?: AbortSignal): Promise<RunnerPreflight> {
    return request('api/cicd/runner/preflight', { method: 'POST', body: JSON.stringify(config) }, signal)
  },

  runnerProfile(signal?: AbortSignal): Promise<{ profile: SshRunnerConfig | null }> {
    return request('api/cicd/runner/profile', {}, signal)
  },

  saveRunnerProfile(config: SshRunnerConfig, signal?: AbortSignal): Promise<{ profile: SshRunnerConfig }> {
    return request('api/cicd/runner/profile', { method: 'POST', body: JSON.stringify(config) }, signal)
  },

  sshCredential(signal?: AbortSignal): Promise<{ configured: boolean; writable: boolean; source: string | null; ref: string }> {
    return request('api/cicd/credentials/ssh', {}, signal)
  },

  setSshPassword(password: string, signal?: AbortSignal): Promise<{ configured: boolean; source?: string | null }> {
    return request('api/cicd/credentials/ssh', { method: 'POST', body: JSON.stringify({ password }) }, signal)
  },

  clearSshPassword(signal?: AbortSignal): Promise<{ configured: boolean }> {
    return request('api/cicd/credentials/ssh', { method: 'POST', body: JSON.stringify({ clear: true }) }, signal)
  },

  registryCredential(signal?: AbortSignal): Promise<{ configured: boolean; writable: boolean; usernameConfigured: boolean; passwordConfigured: boolean }> {
    return request('api/cicd/credentials/registry', {}, signal)
  },

  setRegistryCredentials(username: string, password: string, signal?: AbortSignal): Promise<{ configured: boolean }> {
    return request('api/cicd/credentials/registry', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }, signal)
  },

  clearRegistryCredentials(signal?: AbortSignal): Promise<{ configured: boolean }> {
    return request('api/cicd/credentials/registry', { method: 'POST', body: JSON.stringify({ clear: true }) }, signal)
  },

  githubCredential(signal?: AbortSignal): Promise<{ configured: boolean; writable: boolean; source: string | null; ref: string }> {
    return request('api/cicd/credentials/github', {}, signal)
  },

  setGithubToken(token: string, signal?: AbortSignal): Promise<{ configured: boolean; source?: string | null }> {
    return request('api/cicd/credentials/github', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }, signal)
  },

  clearGithubToken(signal?: AbortSignal): Promise<{ configured: boolean }> {
    return request('api/cicd/credentials/github', {
      method: 'POST',
      body: JSON.stringify({ clear: true }),
    }, signal)
  },
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export type { BootstrapPayload, LogRecord, PipelineDetailPayload, PipelineDraft, PipelineSummary, RunDetail, RunSummary }
export type { GitBranches, GitCommitPreview, GitCommitResult, GitInspection, GitTarget, GitWorkspace }
export type { BuildPlan, BuildPlanInput, DetectionResult }
export type { RunnerPreflight, SshRunnerConfig }
