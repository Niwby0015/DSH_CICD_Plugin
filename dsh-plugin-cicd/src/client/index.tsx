import type { BootstrapPayload, PipelineSummary } from '../host/domain/types.js'
import type { GitTarget } from '../host/git/types.js'
import { api, isApiError } from './api.js'
import { h, useEffect, useState } from './react.js'
import { Icon } from './icons.js'
import { STYLES } from './styles.js'
import { activeLang, copyFor, translator, type Lang } from './i18n.js'
import { Button, LoadingBlock, Notice } from './components/common.js'
import { PipelinesPage } from './pages/PipelinesPage.js'
import { PipelineEditor } from './pages/PipelineEditor.js'
import { PipelineDetail } from './pages/PipelineDetail.js'
import { RunsPage } from './pages/RunsPage.js'
import { RunDetailPage } from './pages/RunDetailPage.js'
import { EnvironmentsPage } from './pages/EnvironmentsPage.js'
import { CredentialsPage } from './pages/CredentialsPage.js'
import { GitPanel } from './pages/GitPanel.js'
import { GitEntryPage } from './pages/GitEntryPage.js'

type Tab = 'pipelines' | 'runs' | 'git' | 'environments' | 'credentials'
type View =
  | { kind: 'list' }
  | { kind: 'detail'; id: string }
  | { kind: 'editor'; id?: string }
  | { kind: 'git'; target: GitTarget; from: 'tab' | 'detail' }
  | { kind: 'run'; id: string }

type LoadState =
  | { phase: 'loading'; data: null; error: '' }
  | { phase: 'ready'; data: BootstrapPayload; error: '' }
  | { phase: 'error'; data: null; error: string }

function PageFrame({
  lang,
  tab,
  view,
  data,
  onTab,
  onRefresh,
  onCreate,
  children,
}: {
  lang: Lang
  tab: Tab
  view: View
  data: BootstrapPayload
  onTab: (tab: Tab) => void
  onRefresh: () => void
  onCreate: () => void
  children: unknown
}) {
  const t = copyFor(lang)
  const showSummary = view.kind === 'list' && data.counts.pipelines + data.counts.runs + data.counts.environments > 0
  return h('div', { className: 'cicd-root' }, h('div', { className: 'cicd-scroll' }, h('div', { className: 'cicd-shell' }, [
    h('header', { key: 'header', className: 'cicd-header' }, [
      h('div', { key: 'brand', className: 'cicd-brand' }, [
        h('div', { key: 'mark', className: 'cicd-brand-mark' }, h(Icon, { name: 'pipeline', size: 22, color: '#2563eb' })),
        h('div', { key: 'copy', style: { minWidth: 0 } }, [
          h('h1', { key: 'title', className: 'cicd-title' }, t.title),
          h('p', { key: 'sub', className: 'cicd-subtitle' }, t.subtitle),
        ]),
      ]),
      h('div', { key: 'actions', className: 'cicd-header-actions' }, [
        h(Button, { key: 'refresh', variant: 'ghost', icon: 'refresh', onClick: onRefresh }, t.refresh),
        view.kind === 'editor' || tab === 'git' ? null : h(Button, { key: 'new', variant: 'primary', icon: 'plus', onClick: onCreate }, t.newPipeline),
      ]),
    ]),
    h('nav', { key: 'tabs', className: 'cicd-tabs', 'aria-label': t.title }, [
      { key: 'pipelines' as const, label: t.tabs.pipelines, count: data.counts.pipelines },
      { key: 'runs' as const, label: t.tabs.runs, count: data.counts.runs },
      { key: 'git' as const, label: t.tabs.git, count: undefined },
      { key: 'environments' as const, label: t.tabs.environments, count: data.counts.environments },
      { key: 'credentials' as const, label: t.tabs.credentials, count: undefined },
    ].map((item) => h('button', {
      key: item.key,
      type: 'button',
      className: 'cicd-tab',
      'data-active': tab === item.key ? 'true' : 'false',
      onClick: () => onTab(item.key),
    }, [
      h('span', { key: 'label' }, item.label),
      item.count === undefined ? null : h('span', { key: 'count', className: 'cicd-tab-count' }, String(item.count)),
    ]))),
    showSummary
      ? h('div', { key: 'summary', className: 'cicd-summary' }, [
          h('span', { key: 'p' }, [h('b', { key: 'n' }, String(data.counts.pipelines)), lang === 'zh' ? ' 条流水线' : ' pipelines']),
          h('span', { key: 's1', className: 'cicd-summary-sep' }, '·'),
          h('span', { key: 'r' }, [h('b', { key: 'n' }, String(data.counts.runs)), lang === 'zh' ? ' 次运行' : ' runs']),
          h('span', { key: 's2', className: 'cicd-summary-sep' }, '·'),
          h('span', { key: 'e' }, [h('b', { key: 'n' }, String(data.counts.environments)), lang === 'zh' ? ' 个环境' : ' targets']),
        ])
      : null,
    data.capabilities.pipelineExecution.available
      ? null
      : h(Notice, { key: 'notice', tone: 'info', title: t.banner.title, icon: 'info' }, t.banner.body),
    h('main', { key: 'main' }, children),
  ])))
}

export function CicdApp({ ctx }: { ctx: ClientContext }) {
  const lang = activeLang(ctx)
  const t = copyFor(lang)
  const [tab, setTab] = useState<Tab>('pipelines')
  const [view, setView] = useState<View>({ kind: 'list' })
  const [refreshKey, setRefreshKey] = useState(0)
  const [state, setState] = useState<LoadState>({ phase: 'loading', data: null, error: '' })

  useEffect(() => {
    const controller = new AbortController()
    setState((current) => (current.phase === 'ready' ? current : { phase: 'loading', data: null, error: '' }))
    api.bootstrap(controller.signal)
      .then((data) => setState({ phase: 'ready', data, error: '' }))
      .catch((caught) => {
        if (controller.signal.aborted) return
        setState({ phase: 'error', data: null, error: isApiError(caught) ? caught.message : String(caught) })
      })
    return () => controller.abort()
  }, [refreshKey])

  const refresh = () => setRefreshKey((value) => value + 1)
  const goTab = (next: Tab) => {
    setTab(next)
    setView({ kind: 'list' })
  }
  const create = () => {
    setTab('pipelines')
    setView({ kind: 'editor' })
  }

  if (state.phase === 'loading' && !state.data) {
    return h('div', { className: 'cicd-root' }, h('div', { className: 'cicd-scroll' }, h('div', { className: 'cicd-shell' }, h(LoadingBlock, { label: t.loading }))))
  }
  if (state.phase === 'error' || !state.data) {
    return h('div', { className: 'cicd-root' }, h('div', { className: 'cicd-scroll' }, h('div', { className: 'cicd-shell' }, [
      h('div', { key: 'h', className: 'cicd-header' }, [
        h('div', { key: 'b', className: 'cicd-brand' }, [
          h('div', { key: 'mark', className: 'cicd-brand-mark' }, h(Icon, { name: 'pipeline', size: 24, color: '#0969da' })),
          h('div', { key: 'c' }, [h('h1', { key: 't', className: 'cicd-title' }, t.title), h('p', { key: 's', className: 'cicd-subtitle' }, t.subtitle)]),
        ]),
      ]),
      h('div', { key: 'e', className: 'cicd-error', style: { marginTop: 24 } }, [
        h('div', { key: 't', style: { fontWeight: 650 } }, t.loadFailed),
        h('div', { key: 'm' }, (state as { error?: string }).error ?? ''),
        h('div', { key: 'r' }, h(Button, { variant: 'primary', onClick: refresh }, t.retry)),
      ]),
    ])))
  }

  const data = state.data
  const currentPipeline: PipelineSummary | undefined =
    view.kind === 'detail' || view.kind === 'editor' ? data.pipelines.find((pipeline) => pipeline.id === view.id) : undefined

  let content: unknown
  if (view.kind === 'editor') {
    content = h(PipelineEditor, {
      key: `${view.id ?? 'new'}:${currentPipeline?.updatedAt ?? 0}`,
      lang,
      initial: currentPipeline,
      onCancel: () => setView(view.id ? { kind: 'detail', id: view.id } : { kind: 'list' }),
      onSaved: (pipeline: PipelineSummary) => {
        setRefreshKey((value) => value + 1)
        setView({ kind: 'detail', id: pipeline.id })
      },
    })
  } else if (view.kind === 'detail') {
    content = h(PipelineDetail, {
      key: view.id,
      id: view.id,
      lang,
      onBack: () => setView({ kind: 'list' }),
      onEdit: () => setView({ kind: 'editor', id: view.id }),
      onGit: () => {
        const source = data.pipelines.find((pipeline) => pipeline.id === view.id)
        if (!source?.projectPath) {
          setView({ kind: 'editor', id: view.id })
          return
        }
        setView({
          kind: 'git',
          target: {
            projectPath: source.projectPath,
            ...(source.repoUrl ? { remoteUrl: source.repoUrl } : {}),
            pipelineId: source.id,
          },
          from: 'detail',
        })
      },
      onOpenRun: (id: string) => setView({ kind: 'run', id }),
      onRefresh: refresh,
      canRun: data.capabilities.pipelineExecution.available,
      onRun: async () => {
        const started = await api.startRun(view.id)
        refresh()
        setView({ kind: 'run', id: started.run.id })
      },
    })
  } else if (view.kind === 'git') {
    content = h(GitPanel, {
      key: `${view.target.projectPath}|${view.target.remoteUrl ?? ''}`,
      target: view.target,
      lang,
      onBack: () => setView(
        view.from === 'detail' && view.target.pipelineId
          ? { kind: 'detail', id: view.target.pipelineId }
          : { kind: 'list' },
      ),
      onCommitted: refresh,
    })
  } else if (view.kind === 'run') {
    content = h(RunDetailPage, { key: view.id, id: view.id, lang, onBack: () => setView({ kind: 'list' }) })
  } else if (tab === 'pipelines') {
    content = h(PipelinesPage, {
      key: 'pipelines',
      lang,
      pipelines: data.pipelines,
      onCreate: create,
      onOpen: (id: string) => setView({ kind: 'detail', id }),
      onEdit: (id: string) => setView({ kind: 'editor', id }),
      onRefresh: refresh,
      onDeleted: refresh,
    })
  } else if (tab === 'runs') {
    content = h(RunsPage, {
      key: 'runs',
      lang,
      runs: data.runs,
      pipelines: data.pipelines,
      onOpen: (id: string) => setView({ kind: 'run', id }),
      onRefresh: refresh,
    })
  } else if (tab === 'git') {
    content = h(GitEntryPage, {
      key: 'git',
      lang,
      gitAvailable: data.capabilities.git.available,
      gitReason: data.capabilities.git.reason,
      onOpen: (target: GitTarget) => setView({ kind: 'git', target, from: 'tab' }),
    })
  } else if (tab === 'environments') {
    content = h(EnvironmentsPage, { key: 'environments', lang, capabilities: data.capabilities, onProfileSaved: refresh })
  } else {
    content = h(CredentialsPage, { key: 'credentials', lang })
  }

  return h(PageFrame, {
    lang,
    tab,
    view,
    data,
    onTab: goTab,
    onRefresh: refresh,
    onCreate: create,
    children: content,
  })
}

export interface ClientContext {
  slots: {
    inject(owner: string, callback: () => unknown): void
    register(options: Record<string, unknown>, component: unknown): unknown
  }
  locale?: {
    getSnapshot?: () => { active?: string; id?: string; locale?: string } | undefined
    getLocale?: () => unknown
  }
  effect?: (callback: () => void | (() => void)) => void
}

function PanelIcon({ size = 18, active = false }: { size?: number; active?: boolean }) {
  return h(Icon, { name: 'pipeline', size, color: active ? '#0969da' : 'currentColor' })
}

function installStyles(ctx: ClientContext): void {
  if (typeof document === 'undefined') return
  const id = 'dsh-plugin-cicd/client.css'
  if (document.querySelector(`style[data-plugin-css="${id}"]`)) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-plugin-cicd'
  tag.dataset.pluginCss = id
  tag.textContent = STYLES
  document.head.appendChild(tag)
  ctx.effect?.(() => () => tag.remove())
}

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  installStyles(ctx)
  const t = translator(activeLang(ctx))
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: 'dsh-cicd',
        order: 18,
        label: () => t('title'),
      },
      PanelIcon,
    ),
  )
  ctx.slots.inject('main', () =>
    ctx.slots.register(
      {
        name: 'main',
        key: 'dsh-cicd',
      },
      () => h(CicdApp, { ctx }),
    ),
  )
}
