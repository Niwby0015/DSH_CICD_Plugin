import { describe, expect, it } from 'vitest'
import { assertImageRef, imageTag, parsePushDigest, parseRepoDigest, registryHost } from '../../src/host/image/image-plan.js'

describe('image plan', () => {
  it('parses registry hosts and tags', () => {
    expect(registryHost('registry.example.com/team/app:sha-1234567')).toBe('registry.example.com')
    expect(registryHost('localhost:5000/team/app:tag')).toBe('localhost:5000')
    expect(registryHost('dsh-cicd/pl_1:sha-1234567')).toBe('docker.io')
    expect(imageTag('a'.repeat(40), 'sha-{sha7}')).toBe('sha-aaaaaaa')
  })

  it('accepts a valid reference and rejects an invalid one', () => {
    expect(() => assertImageRef('registry.example.com/team/app:sha-aaaaaaa')).not.toThrow()
    expect(() => assertImageRef('not a ref')).toThrow()
  })

  it('extracts push and RepoDigests digests', () => {
    const digest = `sha256:${'b'.repeat(64)}`
    expect(parsePushDigest(`latest: digest: ${digest} size: 1234`)).toBe(digest)
    expect(parseRepoDigest(JSON.stringify([`registry.example.com/team/app@${digest}`]))).toBe(digest)
    expect(parseRepoDigest('not-json')).toBe('')
  })
})
