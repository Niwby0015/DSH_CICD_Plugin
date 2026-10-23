import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectProject } from '../../src/host/language/detector.js'
import { createBuildPlan } from '../../src/host/language/planner.js'

describe('bundled Node sample', () => {
  const root = join(process.cwd(), '..', 'samples', 'nodejs-getting-started')

  it('is detected as a Node project and uses the repository Dockerfile', async () => {
    const detection = await detectProject(root)
    expect(detection.requiresChoice).toBe(false)
    expect(detection.candidates.map((candidate) => candidate.language)).toEqual(['node'])
    const plan = await createBuildPlan({ projectPath: root, language: 'auto' })
    expect(plan.tool).toBe('npm')
    expect(plan.installCommand).toBe('npm ci')
    expect(plan.testCommand).toBe('npm run test')
    expect(plan.dockerfileSource).toBe('repository')
    expect(plan.dockerfile).toContain('FROM node:22-bookworm-slim')
    expect(plan.warnings.some((warning) => warning.includes('no build script'))).toBe(true)
  })
})
