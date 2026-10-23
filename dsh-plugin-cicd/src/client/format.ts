export function formatTime(value: number | null | undefined, lang: 'zh' | 'en'): string {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return new Date(value).toISOString()
  }
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
}

export function shortSha(sha: string | null | undefined, length = 7): string {
  if (!sha) return '—'
  return sha.slice(0, length)
}

export function shortImage(image: string | null | undefined): string {
  if (!image) return '—'
  const at = image.lastIndexOf('@')
  if (at > 0) return `${image.slice(0, at)}@${image.slice(at + 1, at + 15)}…`
  const slash = image.lastIndexOf('/')
  const colon = image.lastIndexOf(':')
  if (colon > slash) return image.slice(colon + 1)
  return image
}

export function compactPath(path: string | null | undefined): string {
  if (!path) return '—'
  const normalized = path.replaceAll('\\', '/')
  const parts = normalized.split('/').filter(Boolean)
  return parts.length > 3 ? `…/${parts.slice(-2).join('/')}` : path
}
