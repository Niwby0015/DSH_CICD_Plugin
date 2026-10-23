import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { BuildConfig, LanguageKind } from '../domain/types.js'
import { CicdError } from '../util/errors.js'
import { detectProject } from './detector.js'
import { generateDockerfile } from './dockerfile-templates.js'
import type { BuildPlan, BuildPlanInput, CandidateLanguage, LanguageCandidate } from './types.js'
import { LANGUAGE_LABELS, TOOLCHAIN_IMAGES } from './types.js'

function isKnownLanguage(value: LanguageKind | undefined): value is CandidateLanguage {
  return value !== undefined && value !== 'auto'
}

function assertCommand(value: string, name: string): void {
  if (value.includes('\0') || value.includes('\n') || value.includes('\r')) {
    throw new CicdError('INVALID_INPUT', `${name} must be a single line`, 400)
  }
}

function assertRelative(value: string, name: string): void {
  if (!value) return
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value) || value.split(/[\\/]/).includes('..')) {
    throw new CicdError('INVALID_INPUT', `${name} must be a relative path inside the project`, 400)
  }
}

function customCandidate(input: BuildPlanInput, root: string, workingDir: string): LanguageCandidate {
  const build = input.build ?? {}
  const install = (build.installCommand ?? '').trim()
  const command = (build.buildCommand ?? '').trim()
  const test = (build.testCommand ?? '').trim()
  assertCommand(install, 'installCommand')
  assertCommand(command, 'buildCommand')
  assertCommand(test, 'testCommand')
  if (!command && !test) {
    throw new CicdError('BUILD_COMMAND_REQUIRED', 'custom projects must provide buildCommand or testCommand', 400)
  }
  return {
    language: 'custom',
    label: LANGUAGE_LABELS.custom,
    confidence: 'high',
    evidence: ['custom project configuration'],
    root,
    warnings: ['custom project uses /app/run.sh as a placeholder entrypoint; review it before building an image'],
    entrypoint: ['/app/run.sh'],
    commands: {
      tool: (build.tool ?? 'custom').trim() || 'custom',
      version: (build.version ?? '').trim(),
      workingDir,
      installCommand: install,
      buildCommand: command,
      testCommand: test,
      dockerfilePath: (build.dockerfilePath ?? 'Dockerfile.cicd').trim() || 'Dockerfile.cicd',
    },
  }
}

function overrideCommands(candidate: LanguageCandidate, build: Partial<BuildConfig>): LanguageCandidate {
  const commands = { ...candidate.commands }
  if (build.tool !== undefined) commands.tool = build.tool || commands.tool
  if (build.version !== undefined) commands.version = build.version || commands.version
  if (build.workingDir !== undefined) commands.workingDir = build.workingDir
  if (build.installCommand !== undefined) commands.installCommand = build.installCommand
  if (build.buildCommand !== undefined) commands.buildCommand = build.buildCommand
  if (build.testCommand !== undefined) commands.testCommand = build.testCommand
  if (build.dockerfilePath !== undefined && build.dockerfilePath) commands.dockerfilePath = build.dockerfilePath
  assertRelative(commands.workingDir, 'workingDir')
  assertRelative(commands.dockerfilePath, 'dockerfilePath')
  assertCommand(commands.installCommand, 'installCommand')
  assertCommand(commands.buildCommand, 'buildCommand')
  assertCommand(commands.testCommand, 'testCommand')
  return { ...candidate, commands }
}

async function existingDockerfile(root: string, path: string): Promise<string | undefined> {
  if (!path) return undefined
  try {
    const info = await stat(join(root, path))
    if (!info.isFile()) return undefined
    return await readFile(join(root, path), 'utf8')
  } catch {
    return undefined
  }
}

export async function createBuildPlan(input: BuildPlanInput): Promise<BuildPlan> {
  const detection = await detectProject(input.projectPath, input.projectSubdir ?? '')
  const requested = input.language ?? 'auto'
  let selected: LanguageCandidate

  if (requested === 'custom') {
    selected = customCandidate(input, detection.root, input.projectSubdir ?? '')
  } else if (isKnownLanguage(requested)) {
    const found = detection.candidates.find((candidate) => candidate.language === requested)
    if (!found) {
      throw new CicdError(
        'BUILD_MARKER_MISSING',
        `no ${requested} build marker found; detected: ${detection.candidates.map((candidate) => candidate.language).join(', ') || 'none'}`,
        400,
        { detected: detection.candidates.map((candidate) => candidate.language) },
      )
    }
    selected = found
  } else {
    if (detection.candidates.length === 0) {
      throw new CicdError('BUILD_LANGUAGE_REQUIRED', detection.reason, 400, { detected: [] })
    }
    if (detection.requiresChoice) {
      throw new CicdError('BUILD_LANGUAGE_AMBIGUOUS', detection.reason, 400, {
        detected: detection.candidates.map((candidate) => candidate.language),
      })
    }
    selected = detection.candidates[0]!
  }

  selected = overrideCommands(selected, input.build ?? {})
  const workingDir = selected.commands.workingDir
  const dockerfilePath = selected.commands.dockerfilePath || 'Dockerfile.cicd'
  const existing = await existingDockerfile(detection.root, dockerfilePath)
  const warnings = [...selected.warnings]
  if (!selected.commands.buildCommand) warnings.push('no build command configured; build stage will be skipped')
  if (!selected.commands.testCommand) warnings.push('no test command configured; test stage will be skipped')
  if (selected.language === 'java-maven' || selected.language === 'java-gradle') {
    warnings.push('Dockerfile copies a jar wildcard; ensure the build produces exactly one runnable jar')
  }
  if (!existing) warnings.push('Dockerfile will be generated; review entrypoint and artifact path before production')

  const plan: BuildPlan = {
    projectPath: detection.projectPath,
    root: detection.root,
    workingDir,
    language: selected.language,
    label: selected.label,
    tool: selected.commands.tool,
    version: selected.commands.version,
    toolchainImage: TOOLCHAIN_IMAGES[selected.language],
    installCommand: selected.commands.installCommand,
    buildCommand: selected.commands.buildCommand,
    testCommand: selected.commands.testCommand,
    dockerfilePath,
    dockerfileSource: existing ? 'repository' : 'generated',
    dockerfile: existing ?? '',
    warnings,
    evidence: selected.evidence,
  }
  if (!existing) plan.dockerfile = generateDockerfile(plan, selected.entrypoint)
  return plan
}
