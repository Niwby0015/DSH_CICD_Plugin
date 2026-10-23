import type { PipelineDetailPayload, RunDetail as RunDetailPayload, StageKey } from '../../host/domain/types.js'
import { api, isApiError } from '../api.js'
import { h, useEffect, useState } from '../react.js'
import { Icon } from '../icons.js'
import { compactPath, formatTime, shortImage, shortSha } from '../format.js'
import { copyFor, runStatusLabel, statusLabel, type Lang } from '../i18n.js'
import { Badge, Button, EmptyState, KeyValue, Notice, SectionCard, StatusBadge } from '../components/common.js'
import { PipelineGraph } from '../components/PipelineGraph.js'
import { StageInspector } from '../components/StageInspector.js'

type LoadState =
  | { phase: 'loading'; data: null; error: '' }
  | { phase: 'ready'; data: PipelineDetailPayload; error: '' }
  | { phase: 'error'; data: null; error: string }

export function PipelineDetail({
  id,
  lang,
  onBack,
  onEdit,
  onGit,
  onOpenRun,
  onRefresh,
  canRun,
  onRun,
}: {
  id: string
  lang: Lang
  onBack: () => void
  onEdit: () => void
  onGit: () => void
  onOpenRun: (id: string) => void
  onRefresh: () => void
  canRun: boolean
  onRun: () => Promise<void>
}) {
  const t = copyFor(lang)
  const [state, setState] = useState<LoadState>({ phase: 'loading', data: null, error: '' })
  const [selected, setSelected] = useState<StageKey>('source')
  const [reloadKey, setReloadKey] = useState(0)
  const [runDetail, setRunDetail] = useState<RunDetailPayload | null>(null)
  const [starting, setStarting] = useState(false)
  const [runError, setRunError] = useState('')

  const startRun = async () => {
    setStarting(true)
    setRunError('')
    try {
      await onRun()
    } catch (caught) {
      setRunError(isApiError(caught) ? caught.message : caught instanceof Error ? caught.message : String(caught))
    } finally {
      setStarting(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    setState({ phase: 'loading', data: null, error: '' })
    setRunDetail(null)
    api.getPipeline(id, controller.signal)
      .then(async (data) => {
        setState({ phase: 'ready', data, error: '' })
        const latest = data.runs[0]
        if (!latest) return
        try {
          const loaded = await api.getRun(latest.id, controller.signal)
          if (!controller.signal.aborted) setRunDetail(loaded)
        } catch {
          // The pipeline page remains useful without a readable run detail.
        }
      })
      .catch((caught) => {
        if (controller.signal.aborted) return
        setState({ phase: 'error', data: null, error: isApiError(caught) ? caught.message : String(caught) })
      })
    return () => controller.abort()
  }, [id, reloadKey])

  if (state.phase === 'loading') {
    return h('div', { className: 'cicd-loading' }, [h('span', { key: 's', className: 'cicd-spinner' }), h('span', { key: 't' }, t.loading)])
  }
  if (state.phase === 'error' || !state.data) {
    return h('div', { className: 'cicd-section-stack' }, [
      h('button', { key: 'back', type: 'button', className: 'cicd-header-back', onClick: onBack }, t.back),
      h('div', { key: 'error', className: 'cicd-error' }, [
        h('div', { key: 'message' }, state.error || t.loadFailed),
        h(Button, { key: 'retry', onClick: () => setReloadKey((value) => value + 1) }, t.retry),
      ]),
    ])
  }

  const { pipeline, definitions, runs } = state.data
  const latest = runs[0]
  const activeRun = runDetail?.run
  const runState = activeRun
    ? { status: activeRun.status, label: runStatusLabel(lang, activeRun.status) }
    : latest
      ? { status: latest.status, label: runStatusLabel(lang, latest.status) }
      : { status: 'not_run', label: statusLabel(lang, 'not_run') }
  const selectedStage = runDetail?.stages.find((stage) => stage.key === selected)

  return h('div', { className: 'cicd-section-stack' }, [
    h('div', { key: 'header' }, [
      h('button', { key: 'back', type: 'button', className: 'cicd-header-back', onClick: onBack }, [
        h(Icon, { key: 'icon', name: 'back', size: 13 }),
        h('span', { key: 'text' }, t.back),
      ]),
      h('div', { key: 'row', style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' } }, [
        h('div', { key: 'copy', style: { minWidth: 280, flex: '1 1 440px' } }, [
          h('div', { key: 'title-row', style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } }, [
            h('h1', { key: 'name', className: 'cicd-title', style: { fontSize: 22 } }, pipeline.name),
            h(StatusBadge, { key: 'status', status: runState.status, label: runState.label }),
            h(Badge, { key: 'language', tone: 'neutral' }, t.language[pipeline.language]),
          ]),
          h('div', { key: 'meta', className: 'cicd-small cicd-muted', style: { display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 5 } }, [
            h('span', { key: 'repo' }, pipeline.repoUrl || t.labels.unconfigured),
            h('span', { key: 'branch', className: 'cicd-mono' }, pipeline.branch || 'main'),
            h('span', { key: 'path' }, compactPath(pipeline.projectPath || '—')),
          ]),
        ]),
        h('div', { key: 'actions', style: { display: 'flex', gap: 8, flexWrap: 'wrap' } }, [
          h(Button, { key: 'refresh', variant: 'ghost', icon: 'refresh', onClick: () => { onRefresh(); setReloadKey((value) => value + 1) } }, t.refresh),
          h(Button, { key: 'git', icon: 'github', onClick: onGit }, lang === 'zh' ? 'Git 源码' : 'Git source'),
          h(Button, { key: 'edit', icon: 'edit', onClick: onEdit }, t.edit),
          h('span', { key: 'run-wrap', title: canRun ? t.labels.execute : t.labels.executeBlocked }, h(Button, {
            key: 'run',
            variant: 'primary',
            icon: 'arrow',
            disabled: !canRun || starting,
            onClick: () => void startRun(),
          }, starting ? t.labels.starting : t.labels.execute)),
        ]),
      ]),
    ]),
    runError ? h(Notice, { key: 'run-error', tone: 'danger', title: lang === 'zh' ? '无法启动运行' : 'Could not start run' }, runError) : null,
    canRun ? null : h(Notice, {
      key: 'notice',
      tone: 'info',
      title: lang === 'zh' ? '运行尚未就绪' : 'Run is not ready',
      icon: 'info',
    }, lang === 'zh' ? '请先在环境页保存并测试远程服务器。' : 'Save and test the remote server in the Environments tab first.'),
    h(SectionCard, {
      key: 'graph',
      title: t.stage.label,
      description: t.stage.description,
      extra: h(Badge, { tone: 'muted' }, latest ? formatTime(latest.createdAt, lang) : (lang === 'zh' ? '尚无运行' : 'No run yet')),
    }, h(PipelineGraph, {
      definitions,
      lang,
      pipeline,
      stages: runDetail?.stages,
      run: activeRun,
      selected,
      onSelect: setSelected,
    })),
    h('div', { key: 'detail', className: 'cicd-detail-grid' }, [
      h('div', { key: 'main', className: 'cicd-detail-main' }, [
        h(StageInspector, {
          key: 'inspector',
          lang,
          stageKey: selected,
          stage: selectedStage,
          pipeline,
          run: activeRun,
        }),
        h(SectionCard, {
          key: 'runs',
          title: lang === 'zh' ? '最近运行' : 'Recent runs',
          description: lang === 'zh' ? '运行会保存本次 Commit、镜像、Runner 和阶段结果。' : 'Each run keeps the commit, image, runner and stage results.',
          extra: latest ? h('button', { type: 'button', className: 'cicd-btn cicd-btn-ghost', onClick: () => onOpenRun(latest.id) }, lang === 'zh' ? '查看全部' : 'View all') : null,
        }, runs.length === 0
          ? h(EmptyState, {
              icon: 'terminal',
              title: lang === 'zh' ? '还没有运行' : 'No runs yet',
              body: lang === 'zh' ? '点击“运行流水线”后，结果会显示在这里。' : 'Start the pipeline and the result will appear here.',
            })
          : h('div', { className: 'cicd-list' }, runs.slice(0, 5).map((run) => h('button', {
              key: run.id,
              type: 'button',
              className: 'cicd-run-row',
              onClick: () => onOpenRun(run.id),
            }, [
              h(StatusBadge, { key: 'status', status: run.status, label: runStatusLabel(lang, run.status) }),
              h('span', { key: 'sha', className: 'cicd-mono' }, shortSha(run.commitSha)),
              h('span', { key: 'image', className: 'cicd-small cicd-muted' }, shortImage(run.imageRef)),
              h('span', { key: 'time', className: 'cicd-small cicd-muted' }, formatTime(run.createdAt, lang)),
            ])))),
      ]),
      h('div', { key: 'side', className: 'cicd-detail-side' }, [
        h(SectionCard, { key: 'summary', title: lang === 'zh' ? '配置摘要' : 'Configuration' }, h('div', null, [
          h(KeyValue, { key: 'path', label: t.labels.projectPath, mono: true }, compactPath(pipeline.projectPath || '—')),
          h(KeyValue, { key: 'repo', label: t.labels.repoUrl, mono: true }, pipeline.repoUrl || '—'),
          h(KeyValue, { key: 'branch', label: t.labels.branch, mono: true }, pipeline.branch || 'main'),
          h(KeyValue, { key: 'image', label: t.labels.image, mono: true }, pipeline.imageRepository || '—'),
          h(KeyValue, { key: 'tag', label: t.labels.imageTagTemplate, mono: true }, pipeline.imageTagTemplate),
          h(KeyValue, { key: 'ns', label: t.labels.namespace, mono: true }, pipeline.namespace || '—'),
          h(KeyValue, { key: 'release', label: t.labels.releaseName, mono: true }, pipeline.releaseName || '—'),
          h(KeyValue, { key: 'strategy', label: t.labels.deployStrategy }, t.strategy[pipeline.deployStrategy]),
        ])),
        h(SectionCard, { key: 'runner', title: t.labels.runner }, h('div', null, [
          h(KeyValue, { key: 'kind', label: t.labels.runner }, t.labels.ssh),
          h(KeyValue, { key: 'updated', label: t.labels.updated }, formatTime(pipeline.updatedAt, lang)),
        ])),
        h('div', { key: 'report-note', className: 'cicd-small cicd-muted', style: { lineHeight: 1.7, padding: '0 2px' } }, t.stage.reportNote),
      ]),
    ]),
  ])
}
