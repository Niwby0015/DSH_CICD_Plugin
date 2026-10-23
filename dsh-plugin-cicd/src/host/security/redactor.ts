const PRIVATE_KEY = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g
const GITHUB_TOKEN = /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g
const BEARER = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi
const SECRET_ASSIGNMENT =
  /((?:password|passwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret)\s*[:=]\s*["']?)([^\s"',;]{6,})/gi
const DOCKER_AUTH = /("auth"\s*:\s*")[A-Za-z0-9+/=]{8,}(")/g

/** Redact known secret values first, then common token shapes. */
export function redactText(text: string, secrets: Iterable<string> = []): string {
  let out = text
  const values = [...secrets].filter((secret) => secret.length >= 4).sort((a, b) => b.length - a.length)
  for (const secret of values) out = out.split(secret).join('[REDACTED]')
  return out
    .replace(PRIVATE_KEY, '[REDACTED PRIVATE KEY]')
    .replace(GITHUB_TOKEN, '[REDACTED GITHUB TOKEN]')
    .replace(BEARER, '$1[REDACTED]')
    .replace(SECRET_ASSIGNMENT, '$1[REDACTED]')
    .replace(DOCKER_AUTH, '$1[REDACTED]$2')
}

/** Redact every string value in a JSON-compatible value without mutating the input. */
export function redactValue<T>(value: T, secrets: Iterable<string> = []): T {
  if (typeof value === 'string') return redactText(value, secrets) as T
  if (Array.isArray(value)) return value.map((item) => redactValue(item, secrets)) as T
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = /secret|token|password|passwd|private.?key|api.?key/i.test(key)
        ? '[REDACTED]'
        : redactValue(item, secrets)
    }
    return result as T
  }
  return value
}
