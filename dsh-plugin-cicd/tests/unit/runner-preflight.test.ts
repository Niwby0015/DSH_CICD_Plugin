import { describe, expect, it } from 'vitest'
import { evaluatePreflight } from '../../src/host/runner/ssh/ssh-runner.js'

describe('runner preflight evaluation', () => {
  it('does not treat docker buildx unknown command as a pass', () => {
    const result = evaluatePreflight([
      'git=git version 2.43.0',
      'docker=29.1.3',
      'buildx=docker: unknown command: docker buildx',
      'disk_kb=7041444828',
    ].join('\n'))
    expect(result.ok).toBe(true)
    const buildx = result.checks.find((check) => check.name === 'buildx')
    expect(buildx?.ok).toBe(false)
    expect(buildx?.optional).toBe(true)
    expect(buildx?.detail).toContain('optional')
  })

  it('fails preflight when docker itself is broken', () => {
    const result = evaluatePreflight([
      'git=git version 2.43.0',
      'docker=docker: command not found',
      'buildx=missing',
      'disk_kb=100',
    ].join('\n'))
    expect(result.ok).toBe(false)
    expect(result.checks.find((check) => check.name === 'docker')?.ok).toBe(false)
    expect(result.checks.find((check) => check.name === 'disk')?.ok).toBe(false)
  })
})
