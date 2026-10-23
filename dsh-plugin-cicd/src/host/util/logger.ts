import type { HostContext, HostLogger } from '../plugin-context.js'

export function makeLogger(ctx: HostContext): HostLogger {
  try {
    if (typeof ctx.logger === 'function') return ctx.logger('dsh-cicd')
    if (ctx.logger) return ctx.logger
  } catch {
    // fall through to console
  }
  const write = (level: 'info' | 'warn' | 'error') => (message: string) => {
    const line = `[dsh-cicd] ${message}`
    if (level === 'info') console.log(line)
    else if (level === 'warn') console.warn(line)
    else console.error(line)
  }
  return { info: write('info'), warn: write('warn'), error: write('error') }
}
