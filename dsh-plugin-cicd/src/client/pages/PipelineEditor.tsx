import type { BuildConfig, DeployConfig, DeployStrategy, LanguageKind, PipelineDraft, PipelineSummary } from '../../host/domain/types.js'
import { EMPTY_BUILD_CONFIG, EMPTY_DEPLOY_CONFIG } from '../../host/domain/types.js'
import type { BuildPlan, DetectionResult, LanguageCandidate } from '../../host/language/types.js'
import { api, isApiError } from '../api.js'
import { h, useEffect, useState } from '../react.js'
import { Icon } from '../icons.js'
import { copyFor, type Lang } from '../i18n.js'
import { Button, Field, Notice, SectionCard, Select, TextInput } from '../components/common.js'

type DeployForm = Omit<DeployConfig, 'containerPort' | 'servicePort' | 'replicas'> & {
  containerPort: string
  servicePort: string
  replicas: string
}

interface FormState {
  name: string
  description: string
  projectPath: string
  projectSubdir: string
  repoUrl: string
  branch: string
  language: LanguageKind
  build: BuildConfig
  deploy: DeployForm
  imageRepository: string
  imageTagTemplate: string
  targetEnvironment: string
  namespace: string
  releaseName: string
  deployStrategy: DeployStrategy
}

function fromPipeline(pipeline?: PipelineSummary): FormState {
  return {
    name: pipeline?.name ?? '',
    description: pipeline?.description ?? '',
    projectPath: pipeline?.projectPath ?? '',
    projectSubdir: pipeline?.projectSubdir ?? '',
    repoUrl: pipeline?.repoUrl ?? '',
    branch: pipeline?.branch ?? 'main',
    language: pipeline?.language ?? 'auto',
    build: { ...EMPTY_BUILD_CONFIG, ...(pipeline?.build ?? {}) },
    deploy: {
      ...EMPTY_DEPLOY_CONFIG,
      ...(pipeline?.deploy ?? {}),
      containerPort: String(pipeline?.deploy?.containerPort ?? EMPTY_DEPLOY_CONFIG.containerPort),
      servicePort: String(pipeline?.deploy?.servicePort ?? EMPTY_DEPLOY_CONFIG.servicePort),
      replicas: String(pipeline?.deploy?.replicas ?? EMPTY_DEPLOY_CONFIG.replicas),
    },
    imageRepository: pipeline?.imageRepository ?? '',
    imageTagTemplate: pipeline?.imageTagTemplate ?? 'sha-{sha7}',
    targetEnvironment: pipeline?.targetEnvironment ?? '',
    namespace: pipeline?.namespace ?? '',
    releaseName: pipeline?.releaseName ?? '',
    deployStrategy: pipeline?.deployStrategy ?? 'auto',
  }
}

export function PipelineEditor({
  lang,
  initial,
  onCancel,
  onSaved,
}: {
  lang: Lang
  initial?: PipelineSummary
  onCancel: () => void
  onSaved: (pipeline: PipelineSummary) => void
}) {
  const t = copyFor(lang)
  const [form, setForm] = useState<FormState>(() => fromPipeline(initial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!initial?.id) return undefined
    const controller = new AbortController()
    api.getPipeline(initial.id, controller.signal)
      .then((payload) => setForm(fromPipeline(payload.pipeline)))
      .catch(() => {
        // The bootstrap summary is still a usable fallback.
      })
    return () => controller.abort()
  }, [initial?.id, initial?.updatedAt])
  const [detection, setDetection] = useState<DetectionResult | null>(null)
  const [plan, setPlan] = useState<BuildPlan | null>(null)
  const [buildBusy, setBuildBusy] = useState<'detect' | 'plan' | null>(null)
  const [buildError, setBuildError] = useState('')
  const set = (key: keyof FormState, value: string) => {
    if (key === 'projectPath' || key === 'projectSubdir') {
      setDetection(null)
      setPlan(null)
    }
    setForm((current) => ({ ...current, [key]: value }))
  }
  const setBuild = (key: keyof BuildConfig, value: string) => {
    setPlan(null)
    setForm((current) => ({
      ...current,
      build: { ...current.build, [key]: value },
    }))
  }
  const setDeploy = (key: keyof DeployForm, value: string) => {
    setForm((current) => ({
      ...current,
      deploy: { ...current.deploy, [key]: value },
    }))
  }

  const applyCandidate = (candidate: LanguageCandidate) => {
    setForm((current) => ({
      ...current,
      language: candidate.language,
      build: { ...candidate.commands },
    }))
    setPlan(null)
    setBuildError('')
  }

  const buildFailure = (caught: unknown): string => {
    if (isApiError(caught) && caught.status === 404) {
      return lang === 'zh'
        ? '构建功能暂不可用，请重启 DSH 后重试。'
        : 'Build is temporarily unavailable; restart DSH and try again.'
    }
    return isApiError(caught) ? caught.message : String(caught)
  }

  const detect = async () => {
    if (!form.projectPath.trim()) {
      setBuildError(lang === 'zh' ? '请先填写项目路径' : 'Enter a project path first')
      return
    }
    setBuildBusy('detect')
    setBuildError('')
    setPlan(null)
    try {
      const result = await api.detectBuild({ projectPath: form.projectPath.trim(), projectSubdir: form.projectSubdir.trim() })
      setDetection(result)
      if (!result.requiresChoice && result.candidates.length === 1) applyCandidate(result.candidates[0]!)
    } catch (caught) {
      setBuildError(buildFailure(caught))
    } finally {
      setBuildBusy(null)
    }
  }

  const previewPlan = async () => {
    if (!form.projectPath.trim()) {
      setBuildError(lang === 'zh' ? '请先填写项目路径' : 'Enter a project path first')
      return
    }
    setBuildBusy('plan')
    setBuildError('')
    try {
      setPlan(await api.planBuild({
        projectPath: form.projectPath.trim(),
        projectSubdir: form.projectSubdir.trim(),
        language: form.language,
        build: form.build,
      }))
    } catch (caught) {
      setBuildError(buildFailure(caught))
    } finally {
      setBuildBusy(null)
    }
  }

  const languageOptions = (Object.keys(t.language) as LanguageKind[]).map((value) => ({ value, label: t.language[value] }))
  const strategyOptions = (['auto', 'kubectl'] as DeployStrategy[]).map((value) => ({ value, label: t.strategy[value] }))

  async function save() {
    if (!form.name.trim()) {
      setError(t.labels.requiredName)
      return
    }
    const ports = [form.deploy.containerPort, form.deploy.servicePort].map(Number)
    const replicas = Number(form.deploy.replicas)
    if (ports.some((value) => !Number.isInteger(value) || value < 1 || value > 65535)) {
      setError(lang === 'zh' ? '容器端口和 Service 端口必须是 1–65535 的整数' : 'Container and Service ports must be integers between 1 and 65535')
      return
    }
    if (!Number.isInteger(replicas) || replicas < 1 || replicas > 10) {
      setError(lang === 'zh' ? '副本数必须是 1–10 的整数' : 'Replicas must be an integer between 1 and 10')
      return
    }
    setSaving(true)
    setError('')
    try {
      const draft: PipelineDraft = {
        name: form.name.trim(),
        description: form.description.trim(),
        projectPath: form.projectPath.trim(),
        projectSubdir: form.projectSubdir.trim(),
        repoUrl: form.repoUrl.trim(),
        branch: form.branch.trim() || 'main',
        language: form.language,
        build: form.build,
        deploy: {
          ...form.deploy,
          containerPort: Number(form.deploy.containerPort),
          servicePort: Number(form.deploy.servicePort),
          replicas: Number(form.deploy.replicas),
        },
        imageRepository: form.imageRepository.trim(),
        imageTagTemplate: form.imageTagTemplate.trim() || 'sha-{sha7}',
        targetEnvironment: '',
        namespace: form.namespace.trim(),
        releaseName: form.releaseName.trim(),
        deployStrategy: form.deployStrategy,
      }
      const result = await api.savePipeline(initial?.id, draft)
      onSaved(result.pipeline)
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSaving(false)
    }
  }

  return h('form', {
    className: 'cicd-form',
    onSubmit: (event: Event) => {
      event.preventDefault()
      void save()
    },
  }, [
    h('div', { key: 'header' }, [
      h('button', { key: 'back', type: 'button', className: 'cicd-header-back', onClick: onCancel }, [
        h(Icon, { key: 'icon', name: 'back', size: 13 }),
        h('span', { key: 'text' }, t.back),
      ]),
      h('div', { key: 'title-row', style: { display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' } }, [
        h('h1', { key: 'title', className: 'cicd-title', style: { fontSize: 22 } }, initial ? t.labels.editPipeline : t.labels.createPipeline),
        h('span', { key: 'hint', className: 'cicd-small cicd-muted' }, t.labels.configHint),
      ]),
    ]),
    error ? h(Notice, { key: 'error', tone: 'danger', title: lang === 'zh' ? '保存失败' : 'Save failed' }, error) : null,
    h('div', { key: 'sections', className: 'cicd-section-stack' }, [
      h(SectionCard, {
        key: 'basic',
        title: t.labels.basicSection,
        description: lang === 'zh' ? '名称和描述只用于管理界面，不参与构建。' : 'The name and description are management-only.',
      }, h('div', { className: 'cicd-form-grid' }, [
        h(Field, { key: 'name', label: t.labels.name, error: error === t.labels.requiredName ? error : undefined },
          h(TextInput, { value: form.name, onChange: (value: string) => set('name', value), placeholder: t.labels.namePlaceholder })),
        h(Field, { key: 'description', label: t.labels.description },
          h(TextInput, { value: form.description, onChange: (value: string) => set('description', value), placeholder: lang === 'zh' ? '可选' : 'Optional' })),
      ])),
      h(SectionCard, {
        key: 'source',
        title: t.labels.sourceSection,
        description: lang === 'zh' ? '优先复用当前工作区或已有本地 Git 项目。' : 'Reuse the current workspace or an existing local Git project.',
      }, h('div', { className: 'cicd-form-grid' }, [
        h(Field, { key: 'path', label: t.labels.projectPath, hint: lang === 'zh' ? '绝对路径；可以指向 DSH 当前工作区。' : 'Absolute path; may point at the current DSH workspace.' },
          h(TextInput, { value: form.projectPath, onChange: (value: string) => set('projectPath', value), placeholder: t.labels.projectPathPlaceholder, monospace: true })),
        h(Field, { key: 'subdir', label: t.labels.projectSubdir, hint: lang === 'zh' ? '多模块或前后端同仓时填写。' : 'Use for monorepos or mixed repositories.' },
          h(TextInput, { value: form.projectSubdir, onChange: (value: string) => set('projectSubdir', value), placeholder: 'services/order' })),
        h(Field, { key: 'repo', label: t.labels.repoUrl, hint: lang === 'zh' ? '不要让令牌出现在 URL 中。' : 'Never put a token in the URL.' },
          h(TextInput, { value: form.repoUrl, onChange: (value: string) => set('repoUrl', value), placeholder: t.labels.repoUrlPlaceholder, monospace: true })),
        h(Field, { key: 'branch', label: t.labels.branch },
          h(TextInput, { value: form.branch, onChange: (value: string) => set('branch', value), placeholder: t.labels.branchPlaceholder, monospace: true })),
      ])),
      h(SectionCard, {
        key: 'build',
        title: t.labels.buildSection,
        description: lang === 'zh' ? '检测语言并预览工具链、测试命令和 Dockerfile；检测结果不会静默覆盖你的配置。' : 'Detect the language and preview toolchain, test commands and Dockerfile; detection never silently overrides your configuration.',
      }, h('div', { className: 'cicd-section-stack' }, [
        h('div', { key: 'grid', className: 'cicd-form-grid' }, [
          h(Field, { key: 'language', label: t.labels.language },
            h(Select, { value: form.language, onChange: (value: string) => { set('language', value); setPlan(null) }, options: languageOptions })),
          h(Field, { key: 'tool', label: lang === 'zh' ? '构建工具' : 'Build tool', hint: lang === 'zh' ? '检测后可覆盖。' : 'Detected value, editable.' },
            h(TextInput, { value: form.build.tool, onChange: (value: string) => setBuild('tool', value), placeholder: 'maven / pnpm / python / go', monospace: true })),
          h(Field, { key: 'version', label: lang === 'zh' ? '工具版本' : 'Tool version' },
            h(TextInput, { value: form.build.version, onChange: (value: string) => setBuild('version', value), placeholder: '3.9 / 22 / 3.12 / 1.23', monospace: true })),
          h(Field, { key: 'workdir', label: lang === 'zh' ? '构建目录' : 'Working directory', hint: lang === 'zh' ? '相对于项目根目录。' : 'Relative to the project root.' },
            h(TextInput, { value: form.build.workingDir, onChange: (value: string) => setBuild('workingDir', value), placeholder: 'services/order', monospace: true })),
          h(Field, { key: 'install', label: lang === 'zh' ? '安装命令' : 'Install command', span: 2 },
            h(TextInput, { value: form.build.installCommand, onChange: (value: string) => setBuild('installCommand', value), placeholder: 'pnpm install --frozen-lockfile', monospace: true })),
          h(Field, { key: 'compile', label: lang === 'zh' ? '构建命令' : 'Build command', span: 2 },
            h(TextInput, { value: form.build.buildCommand, onChange: (value: string) => setBuild('buildCommand', value), placeholder: 'pnpm run build', monospace: true })),
          h(Field, { key: 'test', label: lang === 'zh' ? '测试命令' : 'Test command', span: 2 },
            h(TextInput, { value: form.build.testCommand, onChange: (value: string) => setBuild('testCommand', value), placeholder: 'pnpm test', monospace: true })),
          h(Field, { key: 'dockerfile', label: lang === 'zh' ? 'Dockerfile 路径' : 'Dockerfile path', hint: lang === 'zh' ? '已有文件优先；留空则生成预览。' : 'Existing file wins; empty generates a preview.' },
            h(TextInput, { value: form.build.dockerfilePath, onChange: (value: string) => setBuild('dockerfilePath', value), placeholder: 'Dockerfile', monospace: true })),
          h(Field, { key: 'image', label: t.labels.imageRepository },
            h(TextInput, { value: form.imageRepository, onChange: (value: string) => set('imageRepository', value), placeholder: t.labels.imagePlaceholder, monospace: true })),
          h(Field, { key: 'tag', label: t.labels.imageTagTemplate, hint: lang === 'zh' ? '默认使用短 SHA，禁止只使用 latest。' : 'Defaults to a short SHA; latest alone is not enough.' },
            h(TextInput, { value: form.imageTagTemplate, onChange: (value: string) => set('imageTagTemplate', value), placeholder: t.labels.tagPlaceholder, monospace: true })),
        ]),
        h('div', { key: 'actions', className: 'cicd-inline', style: { justifyContent: 'flex-end' } }, [
          h(Button, { key: 'detect', variant: 'secondary', icon: 'info', onClick: () => void detect(), disabled: buildBusy !== null }, buildBusy === 'detect' ? (lang === 'zh' ? '检测中…' : 'Detecting…') : (lang === 'zh' ? '检测语言' : 'Detect language')),
          h(Button, { key: 'plan', variant: 'primary', icon: 'build', onClick: () => void previewPlan(), disabled: buildBusy !== null }, buildBusy === 'plan' ? (lang === 'zh' ? '生成中…' : 'Planning…') : (lang === 'zh' ? '预览构建计划' : 'Preview build plan')),
        ]),
        buildError ? h(Notice, { key: 'build-error', tone: 'danger', title: lang === 'zh' ? '构建配置错误' : 'Build configuration error' }, buildError) : null,
        detection
          ? h('div', { key: 'detection', className: 'cicd-build-detection' }, [
              h('div', { key: 'title', className: 'cicd-small cicd-muted' }, detection.reason),
              detection.candidates.length === 0
                ? null
                : h('div', { key: 'candidates', className: 'cicd-build-candidates' }, detection.candidates.map((candidate) => h('button', {
                    key: candidate.language,
                    type: 'button',
                    className: `cicd-build-candidate ${form.language === candidate.language ? 'is-selected' : ''}`.trim(),
                    onClick: () => applyCandidate(candidate),
                  }, [
                    h('span', { key: 'label', className: 'cicd-build-candidate-title' }, candidate.label),
                    h('span', { key: 'evidence', className: 'cicd-small cicd-muted' }, candidate.evidence.join(' · ')),
                    ...candidate.warnings.map((warning) => h('span', { key: `w-${warning}`, className: 'cicd-small cicd-muted' }, warning)),
                  ]))),
            ])
          : null,
        plan
          ? h('div', { key: 'plan', className: 'cicd-build-plan' }, [
              h('div', { key: 'head', className: 'cicd-build-plan-head' }, [
                h('span', { key: 'label', className: 'cicd-build-plan-title' }, `${plan.label} · ${plan.tool} ${plan.version}`),
                h('span', { key: 'image', className: 'cicd-small cicd-mono cicd-muted' }, plan.toolchainImage),
              ]),
              h('div', { key: 'dir', className: 'cicd-small cicd-muted' }, `${lang === 'zh' ? '构建目录' : 'Working directory'}: ${plan.workingDir || '.'}`),
              h('div', { key: 'commands', className: 'cicd-build-commands' }, [
                ['install', plan.installCommand],
                ['build', plan.buildCommand],
                ['test', plan.testCommand],
              ].map(([key, value]) => h('div', { key, className: 'cicd-build-command' }, [
                h('span', { key: 'k', className: 'cicd-build-command-key' }, key),
                h('code', { key: 'v', className: 'cicd-mono' }, value || (lang === 'zh' ? '（跳过）' : '(skipped)')),
              ]))),
              ...plan.warnings.map((warning) => h('div', { key: `w-${warning}`, className: 'cicd-small', style: { color: '#a16207' } }, warning)),
              h('details', { key: 'dockerfile', className: 'cicd-build-dockerfile', open: false }, [
                h('summary', { key: 'summary' }, `${plan.dockerfileSource === 'repository' ? (lang === 'zh' ? '仓库中的 Dockerfile' : 'Repository Dockerfile') : (lang === 'zh' ? '生成的 Dockerfile 预览' : 'Generated Dockerfile preview')} · ${plan.dockerfilePath}`),
                h('pre', { key: 'text', className: 'cicd-diff' }, plan.dockerfile),
              ]),
            ])
          : null,
      ])),
      h(SectionCard, {
        key: 'deploy',
        title: t.labels.deploySection,
        description: lang === 'zh'
          ? '部署到 Kubernetes，并等待滚动更新和健康检查通过。'
          : 'Deploy to Kubernetes and wait for rollout and health checks.',
      }, h('div', { className: 'cicd-form-grid' }, [
        h(Field, { key: 'namespace', label: t.labels.namespace },
          h(TextInput, { value: form.namespace, onChange: (value: string) => set('namespace', value), placeholder: t.labels.namespacePlaceholder, monospace: true })),
        h(Field, { key: 'release', label: t.labels.releaseName },
          h(TextInput, { value: form.releaseName, onChange: (value: string) => set('releaseName', value), placeholder: t.labels.releasePlaceholder, monospace: true })),
        h(Field, { key: 'strategy', label: t.labels.deployStrategy },
          h(Select, { value: form.deployStrategy, onChange: (value: string) => set('deployStrategy', value), options: strategyOptions })),
        h(Field, { key: 'containerPort', label: lang === 'zh' ? '容器端口' : 'Container port' },
          h(TextInput, {
            value: form.deploy.containerPort,
            onChange: (value: string) => setDeploy('containerPort', value),
            placeholder: '5006',
            monospace: true,
          })),
        h(Field, { key: 'servicePort', label: lang === 'zh' ? 'Service 端口' : 'Service port' },
          h(TextInput, {
            value: form.deploy.servicePort,
            onChange: (value: string) => setDeploy('servicePort', value),
            placeholder: '80',
            monospace: true,
          })),
        h(Field, { key: 'serviceType', label: lang === 'zh' ? 'Service 类型' : 'Service type' },
          h(Select, { value: form.deploy.serviceType, onChange: (value: string) => setDeploy('serviceType', value), options: [
            { value: 'ClusterIP', label: 'ClusterIP' },
            { value: 'NodePort', label: 'NodePort' },
          ] })),
        h(Field, { key: 'replicas', label: lang === 'zh' ? '副本数' : 'Replicas' },
          h(TextInput, {
            value: form.deploy.replicas,
            onChange: (value: string) => setDeploy('replicas', value),
            placeholder: '1',
            monospace: true,
          })),
        h(Field, { key: 'healthPath', label: lang === 'zh' ? '健康检查路径' : 'Health path' },
          h(TextInput, { value: form.deploy.healthPath, onChange: (value: string) => setDeploy('healthPath', value), placeholder: '/', monospace: true })),
        h(Field, { key: 'ingressHost', label: lang === 'zh' ? 'Ingress 域名（可选）' : 'Ingress host (optional)' },
          h(TextInput, { value: form.deploy.ingressHost, onChange: (value: string) => setDeploy('ingressHost', value), placeholder: 'sample.example.com', monospace: true })),
        h(Field, { key: 'imagePullSecret', label: lang === 'zh' ? 'imagePullSecret（可选，已存在）' : 'imagePullSecret (optional, existing)' },
          h(TextInput, { value: form.deploy.imagePullSecret, onChange: (value: string) => setDeploy('imagePullSecret', value), placeholder: 'registry-cred', monospace: true })),
      ])),
    ]),
    h('div', { key: 'actions', className: 'cicd-form-actions' }, [
      h(Button, { key: 'cancel', variant: 'ghost', onClick: onCancel }, t.cancel),
      h(Button, { key: 'save', variant: 'primary', type: 'submit', disabled: saving }, saving ? t.saving : t.save),
    ]),
  ])
}
