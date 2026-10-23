import type { DeployStrategy, LanguageKind, RunStatus, StageKey, StageStatus } from '../host/domain/types.js'

export type Lang = 'zh' | 'en'

export interface StageCopy {
  title: string
  short: string
  subtitle: string
  contract: string[]
  evidence: string[]
  icon: string
}

const STAGE_COPY_ZH: Record<StageKey, StageCopy> = {
  source: {
    title: 'GitHub 源码',
    short: '源码',
    subtitle: '状态 · 提交 · 推送 · SHA',
    contract: [
      '检查仓库、分支、工作区变更和未跟踪文件',
      '预览变更并拦截 .env、私钥、kubeconfig 等敏感文件',
      '显式确认后提交、推送，并记录推送后的 Commit SHA',
    ],
    evidence: ['Commit SHA', '推送分支', 'Git 退出码', '脱敏后的 Git 日志'],
    icon: 'github',
  },
  build: {
    title: '编译 / 测试',
    short: '构建',
    subtitle: '精确 SHA · 远程构建',
    contract: [
      '把本次 Commit SHA 交给远端构建机，检出精确内容',
      '识别项目语言，选择工具链镜像、构建和测试命令',
      '在隔离容器里编译、测试，记录退出码和产物路径',
    ],
    evidence: ['Runner 与构建机', '语言与工具链', '编译/测试退出码', '子步骤耗时'],
    icon: 'build',
  },
  image: {
    title: '构建镜像',
    short: '镜像',
    subtitle: 'Dockerfile · Buildx',
    contract: [
      '优先使用仓库已有 Dockerfile，没有则生成可编辑模板',
      '按 Java / Node / Python / Go / 前端区分镜像模板',
      '标签包含版本或短 SHA，默认不使用 latest 作为唯一标识',
    ],
    evidence: ['Dockerfile 路径', '构建后端', '镜像标签', '构建耗时'],
    icon: 'image',
  },
  push: {
    title: '推送镜像',
    short: '推送',
    subtitle: 'Registry · digest',
    contract: [
      '在远端登录私有仓库，密码只通过 stdin 传递',
      '推送完整镜像引用并记录 digest',
      '后续 Kubernetes 部署使用同一个镜像引用',
    ],
    evidence: ['完整镜像地址', 'digest', '认证结果', '推送耗时'],
    icon: 'push',
  },
  deploy: {
    title: 'Kubernetes 部署',
    short: '部署',
    subtitle: 'kubectl · rollout',
    contract: [
      '连接独立配置的部署环境，校验主机指纹、context 和 namespace',
      '有 Chart 用 helm upgrade，有 YAML 用 kubectl apply，否则生成模板',
      '生产环境停在审批点，展示目标环境和待部署镜像',
    ],
    evidence: ['目标环境 / context', 'namespace / release', '部署策略', '审批记录'],
    icon: 'deploy',
  },
  verify: {
    title: 'Kubernetes 验证',
    short: '验证',
    subtitle: 'rollout · HTTP',
    contract: [
      '等待 Deployment / StatefulSet rollout 完成',
      '检查 Pod 状态、重启次数和实际容器镜像',
      '镜像或 rollout 不一致时停止，并保留失败日志',
    ],
    evidence: ['rollout 状态', 'Pod 状态', '实际镜像 / digest', '验证耗时'],
    icon: 'verify',
  },
  report: {
    title: '结果报告',
    short: '报告',
    subtitle: '汇总 · 失败原因',
    contract: [
      '汇总每个阶段的开始/结束时间、耗时、退出码和失败原因',
      '记录取消后的远端清理结果，清理失败不谎报成功',
      '保留 Commit SHA、镜像地址、Runner 和目标集群',
    ],
    evidence: ['阶段结果矩阵', '失败错误码', '清理状态', '脱敏日志'],
    icon: 'report',
  },
}

const STAGE_COPY_EN: Record<StageKey, StageCopy> = {
  source: {
    title: 'GitHub source',
    short: 'Source',
    subtitle: 'Status · commit · push · SHA',
    contract: [
      'Check repository, branch, working-tree changes and untracked files',
      'Preview changes and block .env, private keys, kubeconfig and credentials',
      'Commit and push after explicit confirmation, then record the pushed SHA',
    ],
    evidence: ['Commit SHA', 'Pushed branch', 'Git exit code', 'Redacted Git log'],
    icon: 'github',
  },
  build: {
    title: 'Compile / test',
    short: 'Build',
    subtitle: 'Exact SHA · remote build',
    contract: [
      'Send the exact commit SHA to the build host and check out its content',
      'Detect the language and select a toolchain image, build and test commands',
      'Compile and test in an isolated container, recording exit codes and artifacts',
    ],
    evidence: ['Runner and build host', 'Language and toolchain', 'Build/test exit codes', 'Sub-step durations'],
    icon: 'build',
  },
  image: {
    title: 'Build image',
    short: 'Image',
    subtitle: 'Dockerfile · Buildx',
    contract: [
      'Prefer the repository Dockerfile; generate an editable template when absent',
      'Use language-specific templates for Java, Node, Python, Go and frontend',
      'Include the version or short SHA in the tag; never rely on latest alone',
    ],
    evidence: ['Dockerfile path', 'Build backend', 'Image tag', 'Build duration'],
    icon: 'image',
  },
  push: {
    title: 'Push image',
    short: 'Push',
    subtitle: 'Registry · digest',
    contract: [
      'Log in on the build host; the password travels only over stdin',
      'Push the full image reference and record its digest',
      'The Kubernetes deploy uses that same image reference',
    ],
    evidence: ['Full image reference', 'Digest', 'Registry authentication', 'Push duration'],
    icon: 'push',
  },
  deploy: {
    title: 'Kubernetes deploy',
    short: 'Deploy',
    subtitle: 'kubectl · rollout',
    contract: [
      'Connect to a separately configured target; verify host key, context and namespace',
      'Use helm upgrade for charts, kubectl apply for YAML, or generate a template',
      'Production pauses for approval with the target and image shown',
    ],
    evidence: ['Target / context', 'Namespace / release', 'Deploy strategy', 'Approval record'],
    icon: 'deploy',
  },
  verify: {
    title: 'Kubernetes verify',
    short: 'Verify',
    subtitle: 'Rollout · HTTP',
    contract: [
      'Wait for the Deployment / StatefulSet rollout to finish',
      'Check Pod phase, restart count and the actual container image',
      'Stop on rollout or image mismatch and keep the failure log',
    ],
    evidence: ['Rollout status', 'Pod status', 'Actual image / digest', 'Verification duration'],
    icon: 'verify',
  },
  report: {
    title: 'Result report',
    short: 'Report',
    subtitle: 'Summary · failure',
    contract: [
      'Summarize start/end, duration, exit code and failure reason for every stage',
      'Record remote cleanup after cancellation; never claim cleanup succeeded blindly',
      'Keep the commit SHA, image reference, runner and target cluster for this run',
    ],
    evidence: ['Stage result matrix', 'Failure code', 'Cleanup state', 'Redacted log'],
    icon: 'report',
  },
}

export function stageCopy(lang: Lang): Record<StageKey, StageCopy> {
  return lang === 'zh' ? STAGE_COPY_ZH : STAGE_COPY_EN
}

const ZH = {
  title: 'CI/CD 流水线',
  subtitle: '从 DSH 工作区的一次提交，到可验证的 Kubernetes 发布。',
  newPipeline: '新建流水线',
  refresh: '刷新',
  back: '返回',
  edit: '编辑',
  save: '保存',
  saving: '保存中…',
  cancel: '取消',
  loading: '正在读取 CI/CD 数据…',
  loadFailed: '读取 CI/CD 数据失败',
  retry: '重试',
  tabs: {
    pipelines: '流水线',
    runs: '运行历史',
    git: 'Git 源码',
    environments: '环境',
    credentials: '凭证',
  },
  banner: {
    title: '运行尚未就绪',
    body: '请先在环境页保存并测试远程服务器。',
  },
  empty: {
    pipelinesTitle: '从第一条流水线开始',
    pipelinesBody: '配置项目路径、仓库、分支和部署参数，然后运行流水线。',
    runsTitle: '还没有运行记录',
    runsBody: '运行记录会保存 Commit、镜像、执行方式和每个阶段的结果。',
    envTitle: '还没有远程服务器',
    envBody: '构建和部署共用一台远程服务器；保存连接信息后即可运行。',
    credTitle: '还没有配置凭证',
    credBody: 'GitHub、镜像仓库凭证独立管理；秘密不会保存到流水线配置，也不会回显。',
  },
  labels: {
    name: '名称',
    description: '描述',
    projectPath: '项目路径',
    projectSubdir: '项目子目录',
    repoUrl: '仓库地址',
    branch: '分支',
    language: '项目类型',
    imageRepository: '镜像仓库 / 项目名',
    imageTagTemplate: '镜像标签模板',
    targetEnvironment: '目标环境',
    namespace: '命名空间',
    releaseName: 'Release 名称',
    deployStrategy: '部署方式',
    status: '状态',
    lastRun: '最近运行',
    commit: 'Commit',
    image: '镜像',
    runner: '执行方式',
    target: '目标',
    updated: '更新于',
    actions: '操作',
    none: '—',
    notRun: '未运行',
    unconfigured: '未配置',
    draft: '草稿',
    ready: '可运行',
    blocked: '需处理',
    languageAuto: '自动识别',
    languageMaven: 'Java Maven',
    languageGradle: 'Java Gradle',
    languageNode: 'Node.js',
    languagePython: 'Python',
    languageGo: 'Go',
    languageCustom: '自定义',
    strategyAuto: '自动选择',
    strategyHelm: 'Helm',
    strategyKubectl: 'kubectl',
    strategyTemplate: '基础模板',
    ssh: 'SSH 远程服务器',
    execute: '运行流水线',
    starting: '启动中…',
    executeBlocked: '请先在环境页配置远程服务器',
    editPipeline: '编辑流水线',
    createPipeline: '创建流水线',
    basicSection: '基础信息',
    sourceSection: '源码',
    buildSection: '构建与镜像',
    deploySection: '部署目标',
    configHint: '这里只保存非敏感配置。令牌、私钥和仓库密码将在凭证页单独管理。',
    namePlaceholder: '例如：订单服务发布',
    projectPathPlaceholder: '例如：D:\\work\\order-service',
    repoUrlPlaceholder: 'https://github.com/acme/order-service.git',
    branchPlaceholder: 'main',
    imagePlaceholder: 'registry.example.com/team/order-service',
    tagPlaceholder: 'v{version}-{sha7}',
    envPlaceholder: '例如：staging',
    namespacePlaceholder: '例如：order-staging',
    releasePlaceholder: '例如：order-service',
    requiredName: '请填写流水线名称',
    saved: '已保存',
  },
  stage: {
    label: '执行阶段',
    description: '六个主阶段按顺序执行；上游失败时后续阶段默认不会继续。',
    logs: '日志',
    noLogs: '运行后这里会显示实时日志；当前没有可显示的日志。',
    error: '失败原因',
    duration: '耗时',
    reportNote: '结果报告在失败时仍会生成，用于汇总失败原因；它不会把失败改写成成功。',
  },
  run: {
    title: '运行详情',
    back: '返回运行历史',
    stageResults: '阶段结果',
    runInfo: '运行信息',
    trigger: '触发方式',
    cleanup: '清理状态',
    noLogs: '暂无日志',
    live: '实时刷新',
    cancel: '取消运行',
    cancelling: '取消中…',
  },
  env: {
    build: '构建 / 部署环境',
    deploy: '部署环境',
    buildBody: '构建与部署共用这台 SSH 服务器：checkout、编译、测试、镜像构建和 kubectl 部署都在这里执行。',
    deployBody: 'kubectl、Helm、集群 context 和 namespace。',
    planned: '环境管理将在 P4/P6 接入',
    hostKey: '严格主机密钥校验',
    separate: '构建机与部署目标分开配置',
  },
  cred: {
    github: 'GitHub 认证',
    registry: '镜像仓库认证',
    ssh: 'SSH 凭证',
    githubBody: '用于提交和推送的令牌或 SSH key，不写入仓库 URL。',
    registryBody: '用于远端 docker login 的用户名和密码，只通过 stdin 传递。',
    sshBody: '构建机和部署机的私钥、passphrase 或 ssh-agent 引用。',
    planned: 'GitHub 令牌已在 Git 面板接入；镜像仓库/SSH 凭证在 P4/P6 接入',
    noPlaintext: '普通流水线配置中不保存秘密',
  },
  status: {
    pending: '等待',
    running: '运行中',
    succeeded: '成功',
    failed: '失败',
    skipped: '跳过',
    cancelled: '已取消',
    interrupted: '已中断',
    not_run: '未运行',
  } as Record<StageStatus | 'not_run', string>,
  runStatus: {
    queued: '排队中',
    running: '运行中',
    awaiting_approval: '等待审批',
    succeeded: '成功',
    failed: '失败',
    cancelling: '取消中',
    cancelled: '已取消',
    interrupted: '已中断',
  } as Record<RunStatus, string>,
  language: {
    auto: '自动识别',
    'java-maven': 'Java Maven',
    'java-gradle': 'Java Gradle',
    node: 'Node.js',
    python: 'Python',
    go: 'Go',
    custom: '自定义',
  } as Record<LanguageKind, string>,
  strategy: {
    auto: '自动选择',
    helm: 'Helm',
    kubectl: 'kubectl',
    template: '基础模板',
  } as Record<DeployStrategy, string>,
  trigger: {
    ui: '界面',
    agent: 'Agent',
    schedule: '定时',
  } as Record<string, string>,
  cleanup: {
    not_started: '未开始',
    running: '清理中',
    succeeded: '已清理',
    failed: '清理失败',
    unknown: '未知',
  } as Record<string, string>,
}

const EN: typeof ZH = {
  title: 'CI/CD Pipelines',
  subtitle: 'From a commit in the DSH workspace to a verified Kubernetes release.',
  newPipeline: 'New pipeline',
  refresh: 'Refresh',
  back: 'Back',
  edit: 'Edit',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  loading: 'Reading CI/CD data…',
  loadFailed: 'Could not read CI/CD data',
  retry: 'Retry',
  tabs: { pipelines: 'Pipelines', runs: 'Run history', git: 'Git source', environments: 'Environments', credentials: 'Credentials' },
  banner: {
    title: 'Run is not ready',
    body: 'Save and test the remote server in the Environments tab first.',
  },
  empty: {
    pipelinesTitle: 'Start with your first pipeline',
    pipelinesBody: 'Configure the project path, repository, branch and deploy settings, then run it.',
    runsTitle: 'No runs yet',
    runsBody: 'A run keeps the commit, image, execution mode and every stage result.',
    envTitle: 'No remote server yet',
    envBody: 'Build and deploy share one remote server; save the connection to start running.',
    credTitle: 'No credentials configured',
    credBody: 'GitHub and registry credentials are managed separately; secrets never enter pipeline config and are never echoed.',
  },
  labels: {
    name: 'Name',
    description: 'Description',
    projectPath: 'Project path',
    projectSubdir: 'Project subdirectory',
    repoUrl: 'Repository URL',
    branch: 'Branch',
    language: 'Project type',
    imageRepository: 'Registry / repository',
    imageTagTemplate: 'Image tag template',
    targetEnvironment: 'Target environment',
    namespace: 'Namespace',
    releaseName: 'Release name',
    deployStrategy: 'Deploy strategy',
    status: 'Status',
    lastRun: 'Last run',
    commit: 'Commit',
    image: 'Image',
    runner: 'Execution',
    target: 'Target',
    updated: 'Updated',
    actions: 'Actions',
    none: '—',
    notRun: 'Not run',
    unconfigured: 'Not configured',
    draft: 'Draft',
    ready: 'Ready',
    blocked: 'Needs attention',
    languageAuto: 'Auto detect',
    languageMaven: 'Java Maven',
    languageGradle: 'Java Gradle',
    languageNode: 'Node.js',
    languagePython: 'Python',
    languageGo: 'Go',
    languageCustom: 'Custom',
    strategyAuto: 'Auto',
    strategyHelm: 'Helm',
    strategyKubectl: 'kubectl',
    strategyTemplate: 'Base template',
    ssh: 'SSH remote server',
    execute: 'Run pipeline',
    starting: 'Starting…',
    executeBlocked: 'Configure the remote server in Environments first',
    editPipeline: 'Edit pipeline',
    createPipeline: 'Create pipeline',
    basicSection: 'Basics',
    sourceSection: 'Source',
    buildSection: 'Build and image',
    deploySection: 'Deployment target',
    configHint: 'Only non-secret configuration is stored here. Tokens, keys and registry passwords live in Credentials.',
    namePlaceholder: 'e.g. Order service release',
    projectPathPlaceholder: 'e.g. D:\\work\\order-service',
    repoUrlPlaceholder: 'https://github.com/acme/order-service.git',
    branchPlaceholder: 'main',
    imagePlaceholder: 'registry.example.com/team/order-service',
    tagPlaceholder: 'v{version}-{sha7}',
    envPlaceholder: 'e.g. staging',
    namespacePlaceholder: 'e.g. order-staging',
    releasePlaceholder: 'e.g. order-service',
    requiredName: 'Pipeline name is required',
    saved: 'Saved',
  },
  stage: {
    label: 'Execution stages',
    description: 'Six primary stages run in order; downstream stages skip when an upstream stage fails.',
    logs: 'Logs',
    noLogs: 'Live logs appear here after a run; there are no logs to show now.',
    error: 'Failure reason',
    duration: 'Duration',
    reportNote: 'The result report still runs after a failure to summarize it; it never turns a failure into success.',
  },
  run: {
    title: 'Run detail',
    back: 'Back to run history',
    stageResults: 'Stage results',
    runInfo: 'Run information',
    trigger: 'Trigger',
    cleanup: 'Cleanup',
    noLogs: 'No logs',
    live: 'Live refresh',
    cancel: 'Cancel run',
    cancelling: 'Cancelling…',
  },
  env: {
    build: 'Build / deploy host',
    deploy: 'Deploy environment',
    buildBody: 'Build and deploy share this SSH server: checkout, build, test, image build and kubectl deploy all run here.',
    deployBody: 'kubectl, Helm, cluster context and namespace.',
    planned: 'Environment management arrives in P4/P6',
    hostKey: 'Strict host-key verification',
    separate: 'Build and deploy targets are configured separately',
  },
  cred: {
    github: 'GitHub authentication',
    registry: 'Registry authentication',
    ssh: 'SSH credentials',
    githubBody: 'A token or SSH key for push; never embedded in the repository URL.',
    registryBody: 'Registry username and password for remote docker login, passed only over stdin.',
    sshBody: 'Private key, passphrase or ssh-agent references for build and deploy hosts.',
    planned: 'GitHub tokens are configured in the Git panel; registry/SSH credentials arrive in P4/P6',
    noPlaintext: 'No secrets in ordinary pipeline configuration',
  },
  status: {
    pending: 'Waiting',
    running: 'Running',
    succeeded: 'Succeeded',
    failed: 'Failed',
    skipped: 'Skipped',
    cancelled: 'Cancelled',
    interrupted: 'Interrupted',
    not_run: 'Not run',
  },
  runStatus: {
    queued: 'Queued',
    running: 'Running',
    awaiting_approval: 'Awaiting approval',
    succeeded: 'Succeeded',
    failed: 'Failed',
    cancelling: 'Cancelling',
    cancelled: 'Cancelled',
    interrupted: 'Interrupted',
  },
  language: {
    auto: 'Auto detect',
    'java-maven': 'Java Maven',
    'java-gradle': 'Java Gradle',
    node: 'Node.js',
    python: 'Python',
    go: 'Go',
    custom: 'Custom',
  },
  strategy: {
    auto: 'Auto',
    helm: 'Helm',
    kubectl: 'kubectl',
    template: 'Base template',
  },
  trigger: {
    ui: 'UI',
    agent: 'Agent',
    schedule: 'Schedule',
  },
  cleanup: {
    not_started: 'Not started',
    running: 'Cleaning',
    succeeded: 'Cleaned',
    failed: 'Cleanup failed',
    unknown: 'Unknown',
  },
}

export type Copy = typeof ZH

export interface LocaleOwner {
  locale?: {
    getSnapshot?: () => { active?: string; id?: string; locale?: string } | undefined
    getLocale?: () => unknown
  }
}

export function activeLang(ctx: LocaleOwner): Lang {
  try {
    const snapshot = ctx.locale?.getSnapshot?.()
    const id = String(snapshot?.active ?? snapshot?.id ?? snapshot?.locale ?? '')
    if (id) return id.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  } catch {
    // fall through to the browser locale
  }
  try {
    return String((typeof navigator !== 'undefined' && navigator.language) || '').toLowerCase().startsWith('zh')
      ? 'zh'
      : 'en'
  } catch {
    return 'zh'
  }
}

export function copyFor(lang: Lang): Copy {
  return lang === 'zh' ? ZH : EN
}

export function translator(lang: Lang): (key: string, params?: Record<string, string | number>) => string {
  const table = copyFor(lang)
  return (key, params) => {
    let current: unknown = table
    for (const part of key.split('.')) {
      if (current === null || typeof current !== 'object') return key
      current = (current as Record<string, unknown>)[part]
    }
    let value = typeof current === 'string' ? current : key
    if (params) {
      value = value.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : String(params[name])))
    }
    return value
  }
}

export function statusLabel(lang: Lang, status: string): string {
  return copyFor(lang).status[status as StageStatus | 'not_run'] ?? status
}

export function runStatusLabel(lang: Lang, status: string): string {
  return copyFor(lang).runStatus[status as RunStatus] ?? status
}
