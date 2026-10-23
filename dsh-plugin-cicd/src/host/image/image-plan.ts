export interface RegistryCredentials {
  registry: string
  username: string
  password: string
}

export interface ImagePushResult {
  imageRef: string
  digest: string
  verified: boolean
  logs: string[]
}

const IMAGE_REF_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*(?::[0-9]+)?\/[a-zA-Z0-9._/-]+:[a-zA-Z0-9_.-]+$/

export function registryHost(imageRef: string): string {
  const first = imageRef.split('/')[0] ?? ''
  if (first === 'localhost' || first.includes('.') || first.includes(':')) return first
  return 'docker.io'
}

export function assertImageRef(imageRef: string): void {
  if (!IMAGE_REF_RE.test(imageRef)) throw new Error(`invalid image reference: ${imageRef}`)
}

export function imageTag(commitSha: string, template: string): string {
  return (template || 'sha-{sha7}')
    .replaceAll('{sha7}', commitSha.slice(0, 7))
    .replaceAll('{sha}', commitSha)
}

export function parsePushDigest(output: string): string {
  const matches = [...output.matchAll(/digest:\s*(sha256:[0-9a-f]{64})/gi)]
  return matches.at(-1)?.[1] ?? ''
}

export function parseRepoDigest(output: string): string {
  try {
    const parsed: unknown = JSON.parse(output)
    if (!Array.isArray(parsed)) return ''
    for (const entry of parsed) {
      if (typeof entry === 'string') {
        const match = entry.match(/@(sha256:[0-9a-f]{64})$/i)
        if (match) return match[1]!
      }
    }
  } catch {
    // inspect output is not JSON
  }
  return ''
}
