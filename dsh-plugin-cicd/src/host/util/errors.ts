export type CicdErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_STATE_TRANSITION'
  | 'STORE_UNAVAILABLE'
  | 'GIT_NOT_REPO'
  | 'GIT_NO_REMOTE'
  | 'GIT_INSECURE_REMOTE'
  | 'GIT_NO_IDENTITY'
  | 'GIT_NO_CHANGES'
  | 'GIT_MESSAGE_REQUIRED'
  | 'GIT_SENSITIVE_FILE'
  | 'GIT_PLAN_EXPIRED'
  | 'GIT_WORKTREE_CHANGED'
  | 'GIT_COMMAND_FAILED'
  | 'GIT_PUSH_FAILED'
  | 'GIT_PUSH_DENIED'
  | 'GIT_AUTH_FAILED'
  | 'GIT_REMOTE_MISMATCH'
  | 'GIT_COMMIT_MISMATCH'
  | 'GIT_REF_NOT_FOUND'
  | 'GIT_TIMEOUT'
  | 'BUILD_LANGUAGE_REQUIRED'
  | 'BUILD_LANGUAGE_AMBIGUOUS'
  | 'BUILD_MARKER_MISSING'
  | 'BUILD_COMMAND_REQUIRED'
  | 'SSH_HOST_KEY_FAILED'
  | 'SSH_HOST_KEY_MISMATCH'
  | 'SSH_AUTH_FAILED'
  | 'SSH_COMMAND_FAILED'
  | 'RUNNER_UNAVAILABLE'
  | 'REGISTRY_AUTH_FAILED'
  | 'REGISTRY_PUSH_DENIED'
  | 'REGISTRY_PUSH_FAILED'
  | 'REGISTRY_DIGEST_MISSING'
  | 'KUBERNETES_UNAVAILABLE'
  | 'KUBERNETES_DEPLOY_FAILED'
  | 'DEPLOY_UNSUPPORTED'
  | 'VERIFY_INCOMPLETE'
  | 'RUNNER_PREFLIGHT_FAILED'
  | 'CREDENTIALS_UNAVAILABLE'
  | 'EXECUTION_NOT_READY'
  | 'UNAVAILABLE'
  | 'INTERNAL'

/** A failure with a stable code and an HTTP status for route responses. */
export class CicdError extends Error {
  readonly code: CicdErrorCode
  readonly status: number
  readonly details?: Record<string, unknown>

  constructor(code: CicdErrorCode, message: string, status = 400, details?: Record<string, unknown>) {
    super(message)
    this.name = 'CicdError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export function isCicdError(error: unknown): error is CicdError {
  return error instanceof CicdError
}

/** Convert an unknown failure into a safe message. Callers still pass it through redaction. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
