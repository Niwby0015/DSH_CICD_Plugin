/** Minimal Host context surface consumed by this plugin. All members are documented DSH APIs. */
import type { DshSubprocessService } from './git/process.js'

export interface FetchRoute {
  path: string
  methods: string[]
  requestBody: 'buffered' | 'streaming'
  fetch(request: Request): Promise<Response>
}

export interface ConnectionService {
  fetch: {
    register(route: FetchRoute): () => void
  }
}

export interface CredentialsService {
  resolve(ref: string): Promise<{ value: string; source?: string } | undefined>
  describe(ref: string): Promise<{ configured: boolean; source?: string; writable: boolean }>
  set(ref: string, value: string): Promise<void>
  unset(ref: string): Promise<void>
}

export interface WorkspaceRegistryService {
  list(): Array<{ path: string; title: string }>
}

export interface HostLogger {
  info(message: string): void
  warn(message: string): void
  error?(message: string): void
}

export interface HostContext {
  logger?: HostLogger | ((name: string) => HostLogger)
  connection?: ConnectionService
  subprocess?: DshSubprocessService
  credentials?: CredentialsService
  workspaceRegistry?: WorkspaceRegistryService
  effect?(callback: () => void | (() => void)): void
  inject?(dependencies: string[], callback: (scope: HostContext) => void | (() => void)): (() => void) | void
}
