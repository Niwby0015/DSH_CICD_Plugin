import { readFile } from 'node:fs/promises'
import { basename, join, normalize, sep } from 'node:path'

export type SensitiveSeverity = 'block' | 'warn'

export interface SensitiveFinding {
  path: string
  code: string
  message: string
  severity: SensitiveSeverity
  line?: number
}

const DENY_NAMES = [
  /^\.env$/i,
  /^\.env\.(?!example$|sample$|template$).+$/i,
  /\.pem$/i,
  /\.key$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/i,
  /(^|\/)kubeconfig(\.|$)/i,
  /\.kubeconfig$/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.pypirc$/i,
  /(^|\/)\.netrc$/i,
  /(^|\/)credentials\.json$/i,
  /(^|\/)secrets?\.(ya?ml|json|toml)$/i,
  /(^|\/)service-account[^/]*\.json$/i,
]

const CONTENT_RULES: Array<{ code: string; regex: RegExp; label: string }> = [
  { code: 'PRIVATE_KEY', regex: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/, label: 'private key block' },
  { code: 'GITHUB_TOKEN', regex: /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/, label: 'GitHub token' },
  { code: 'AWS_ACCESS_KEY', regex: /\bAKIA[0-9A-Z]{16}\b/, label: 'AWS access key' },
  { code: 'BEARER_TOKEN', regex: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/, label: 'bearer token' },
]

export function isSensitivePath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/')
  const name = basename(normalized)
  return DENY_NAMES.some((pattern) => pattern.test(name) || pattern.test(normalized))
}

function safeWithin(root: string, relativePath: string): string {
  const normalizedRoot = normalize(root)
  const target = normalize(join(root, ...relativePath.replaceAll('\\', '/').split('/')))
  if (target !== normalizedRoot && !target.startsWith(`${normalizedRoot}${sep}`)) {
    throw new Error(`path escapes project root: ${relativePath}`)
  }
  return target
}

/** Fast path-only findings. Content scanning is separate and bounded. */
export function scanPath(path: string): SensitiveFinding[] {
  if (!isSensitivePath(path)) return []
  return [
    {
      path,
      code: 'SENSITIVE_FILENAME',
      message: '敏感文件名，默认禁止提交',
      severity: 'block',
    },
  ]
}

export async function scanFile(root: string, relativePath: string, maxBytes = 1_000_000): Promise<SensitiveFinding[]> {
  const findings = scanPath(relativePath)
  if (findings.length > 0) return findings
  let text: string
  try {
    const buffer = await readFile(safeWithin(root, relativePath))
    if (buffer.length > maxBytes) {
      return [{ path: relativePath, code: 'FILE_TOO_LARGE', message: '文件过大，无法完成内容级敏感检查', severity: 'warn' }]
    }
    if (buffer.includes(0)) return []
    text = buffer.toString('utf8')
  } catch {
    return []
  }
  const lines = text.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    for (const rule of CONTENT_RULES) {
      if (rule.regex.test(line)) {
        findings.push({
          path: relativePath,
          code: rule.code,
          message: `检测到${rule.label}`,
          severity: 'block',
          line: index + 1,
        })
        break
      }
    }
    if (findings.length > 0) break
  }
  return findings
}

export async function scanFiles(root: string, paths: string[]): Promise<SensitiveFinding[]> {
  const findings: SensitiveFinding[] = []
  for (const path of paths) findings.push(...(await scanFile(root, path)))
  return findings
}
