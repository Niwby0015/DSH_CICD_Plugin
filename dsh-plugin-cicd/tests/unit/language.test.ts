import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { detectProject } from '../../src/host/language/detector.js'
import { createBuildPlan } from '../../src/host/language/planner.js'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-cicd-lang-'))
  dirs.push(root)
  for (const [name, content] of Object.entries(files)) {
    const path = join(root, name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content, 'utf8')
  }
  return root
}

describe('language detection', () => {
  it('detects Node with pnpm scripts and a Dockerfile', async () => {
    const root = fixture({
      'package.json': JSON.stringify({ scripts: { build: 'tsc', test: 'vitest run' } }),
      'pnpm-lock.yaml': 'lockfileVersion: 9\n',
      Dockerfile: 'FROM node:22\n',
    })
    const result = await detectProject(root)
    expect(result.requiresChoice).toBe(false)
    expect(result.candidates.map((candidate) => candidate.language)).toEqual(['node'])
    const support = result.candidates[0]!
    expect(support.commands.installCommand).toContain('pnpm install --frozen-lockfile')
    expect(support.commands.buildCommand).toBe('pnpm run build')
    const plan = await createBuildPlan({ projectPath: root, language: 'node' })
    expect(plan.dockerfileSource).toBe('repository')
    expect(plan.dockerfile).toContain('FROM node:22')
    expect(plan.toolchainImage).toContain('node:22')
  })

  it('detects Maven modules and prefers the wrapper', async () => {
    const root = fixture({
      'pom.xml': '<project><modules><module>api</module><module>worker</module></modules></project>',
      mvnw: '#!/bin/sh\n',
    })
    const result = await detectProject(root)
    expect(result.candidates[0]?.language).toBe('java-maven')
    expect(result.candidates[0]?.evidence).toContain('module:api')
    expect(result.candidates[0]?.commands.buildCommand).toContain('./mvnw')
    const plan = await createBuildPlan({ projectPath: root, language: 'java-maven' })
    expect(plan.toolchainImage).toContain('maven:')
    expect(plan.dockerfile).toContain('/src/target/*.jar')
  })

  it('detects Gradle Kotlin DSL', async () => {
    const root = fixture({ 'build.gradle.kts': 'plugins { java }\n', 'settings.gradle.kts': '' })
    const result = await detectProject(root)
    expect(result.candidates[0]?.language).toBe('java-gradle')
    expect(result.candidates[0]?.commands.buildCommand).toBe('gradle --no-daemon assemble')
  })

  it('detects Python pytest and plans a virtualenv-free install', async () => {
    const root = fixture({
      'requirements.txt': 'pytest==8.3.0\n',
      'pyproject.toml': '[tool.pytest.ini_options]\n',
    })
    const result = await detectProject(root)
    expect(result.candidates[0]?.language).toBe('python')
    const plan = await createBuildPlan({ projectPath: root, language: 'python' })
    expect(plan.installCommand).toBe('python -m pip install -r requirements.txt')
    expect(plan.testCommand).toBe('python -m pytest -q')
  })

  it('detects Go command packages', async () => {
    const root = fixture({
      'go.mod': 'module example.com/app\n',
      'cmd/server/main.go': 'package main\n',
    })
    const result = await detectProject(root)
    expect(result.candidates[0]?.language).toBe('go')
    expect(result.candidates[0]?.commands.buildCommand).toContain('./cmd/server')
  })

  it('requires a choice for mixed-language repositories', async () => {
    const root = fixture({
      'package.json': JSON.stringify({ scripts: { test: 'vitest' } }),
      'go.mod': 'module example.com/app\n',
    })
    const result = await detectProject(root)
    expect(result.requiresChoice).toBe(true)
    await expect(createBuildPlan({ projectPath: root })).rejects.toMatchObject({ code: 'BUILD_LANGUAGE_AMBIGUOUS' })
  })

  it('rejects a missing known marker and requires custom commands', async () => {
    const root = fixture({ 'README.md': '# empty\n' })
    await expect(createBuildPlan({ projectPath: root, language: 'node' })).rejects.toMatchObject({ code: 'BUILD_MARKER_MISSING' })
    await expect(createBuildPlan({ projectPath: root, language: 'custom' })).rejects.toMatchObject({ code: 'BUILD_COMMAND_REQUIRED' })
    const plan = await createBuildPlan({
      projectPath: root,
      language: 'custom',
      build: { buildCommand: 'make build', testCommand: 'make test' },
    })
    expect(plan.language).toBe('custom')
    expect(plan.dockerfileSource).toBe('generated')
    expect(plan.dockerfile).toContain('FROM debian:bookworm-slim')
  })
})
