import type { LogRecord, RunDetail as RunDetailPayload, StageKey } from '../../host/domain/types.js'
import { api, isApiError } from '../api.js'
import { h, useEffect, useState } from '../react.js'
import { Icon } from '../icons.js'
import { formatDuration, formatTime, shortImage, shortSha } from '../format.js'
import { copyFor, runStatusLabel, type Lang } from '../i18n.js'
import { Button, EmptyState, KeyValue, LoadingBlock, SectionCard, StatusBadge } from '../components/common.js'
import { PipelineGraph } from '../components/PipelineGraph.js'
import { StageInspector } from '../components/StageInspector.js'
import { STAGE_DEFINITIONS } from '../constants.js'

const ACTIVE = new Set(['queued', 'running', 'awaiting_approval', 'cancelling'])

export function RunDetailPage({ id, lang, onBack }: { id: string; lang: Lang; onBack: () => void }) {
  const t = copyFor(lang)
  const [detail, setDetail] = useState<RunDetailPayload | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<StageKey>('source')
  const [logs, setLogs] = useState<LogRecord[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [cancelling, setCancelling] = useState(false)

  const cancel = async () => {
    setCancelling(true)
    setError('')
    try {
      await api.cancelRun(id)
      setReloadKey((value) => value + 1)
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : String(caught))
    } finally {
      setCancelling(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    let timer: number | undefined
    const load = () => {
      api.getRun(id, controller.signal)
        .then((payload) => {
          setDetail(payload)
          setError('')
          if (ACTIVE.has(payload.run.status)) timer = window.setTimeout(load, 2000)
        })
        .catch((caught) => {
          if (controller.signal.aborted) return
          setError(isApiError(caught) ? caught.message : String(caught))
        })
    }
    load()
    return () => {
      controller.abort()
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [id, reloadKey])

  useEffect(() => {
    if (!detail) return undefined
    const controller = new AbortController()
    let timer: number | undefined
    const active = ACTIVE.has(detail.run.status)
    setLogsLoading(true)
    const load = () => {
      api.getLogs(id, selected, 0, controller.signal)
        .then((payload) => {
          setLogs(payload.logs)
          setLogsLoading(false)
          if (active) timer = window.setTimeout(load, 1200)
        })
        .catch(() => setLogsLoading(false))
    }
    load()
    return () => {
      controller.abort()
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [detail?.run.status, id, selected])

  if (error && !detail) {
    return h('div', { className: 'cicd-section-stack' }, [
      h('button', { key: 'back', type: 'button', className: 'cicd-header-back', onClick: onBack }, t.back),
      h('div', { key: 'error', className: 'cicd-error' }, error),
    ])
  }
  if (!detail) return h(LoadingBlock, { label: t.loading })

  const selectedStage = detail.stages.find((stage) => stage.key === selected)
  const duration = detail.run.startedAt && detail.run.finishedAt ? detail.run.finishedAt - detail.run.startedAt : null

  return h('div', { className: 'cicd-section-stack' }, [
    h('div', { key: 'header' }, [
      h('button', { key: 'back', type: 'button', className: 'cicd-header-back', onClick: onBack }, [
        h(Icon, { key: 'icon', name: 'back', size: 13 }),
        h('span', { key: 'text' }, t.run.back),
      ]),
      h('div', { key: 'row', style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' } }, [
        h('div', { key: 'copy' }, [
          h('div', { key: 'title-row', style: { display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' } }, [
            h('h1', { key: 'title', className: 'cicd-title', style: { fontSize: 22 } }, t.run.title),
            h(StatusBadge, { key: 'status', status: detail.run.status, label: runStatusLabel(lang, detail.run.status) }),
          ]),
          h('div', { key: 'meta', className: 'cicd-small cicd-muted', style: { marginTop: 4 } }, [
            detail.pipelineName,
            ' · ',
            h('span', { key: 'sha', className: 'cicd-mono' }, shortSha(detail.run.commitSha)),
            ' · ',
            formatTime(detail.run.createdAt, lang),
          ]),
        ]),
        h('div', { key: 'actions', style: { display: 'flex', gap: 8, flexWrap: 'wrap' } }, [
          ACTIVE.has(detail.run.status) && detail.run.status !== 'cancelling'
            ? h(Button, {
                key: 'cancel',
                variant: 'danger',
                onClick: () => void cancel(),
                disabled: cancelling,
              }, cancelling ? t.run.cancelling : t.run.cancel)
            : null,
          h(Button, { key: 'refresh', variant: 'ghost', icon: 'refresh', onClick: () => setReloadKey((value) => value + 1) }, t.refresh),
        ]),
      ]),
    ]),
    h(SectionCard, {
      key: 'graph',
      title: t.run.stageResults,
      description: lang === 'zh' ? '每条运行按阶段保存状态、退出码和日志。' : 'Each run stores status, exit code and logs per stage.',
    }, h(PipelineGraph, {
      definitions: STAGE_DEFINITIONS,
      stages: detail.stages,
      selected,
      onSelect: setSelected,
      lang,
      run: detail.run,
    })),
    h('div', { key: 'detail', className: 'cicd-detail-grid' }, [
      h('div', { key: 'main', className: 'cicd-detail-main' }, [
        h(StageInspector, { key: 'inspector', lang, stageKey: selected, stage: selectedStage, run: detail.run }),
        h(SectionCard, {
          key: 'logs',
          title: t.stage.logs,
          description: lang === 'zh' ? '按阶段查看脱敏后的输出。' : 'Redacted output per stage.',
          extra: h('span', { key: 'live', className: 'cicd-small cicd-muted' }, t.run.live),
        }, logs.length > 0
          ? h('div', { className: 'cicd-logbox' }, logs.map((log) => h('span', {
              key: log.seq,
              className: 'cicd-logline',
              'data-stream': log.stream,
            }, `[${log.stream}] ${log.text}`)))
          : h(EmptyState, {
              icon: 'terminal',
              title: t.stage.noLogs,
              body: logsLoading ? (lang === 'zh' ? '正在读取日志…' : 'Loading logs…') : t.run.noLogs,
            })),
      ]),
      h('div', { key: 'side', className: 'cicd-detail-side' }, [
        h(SectionCard, { key: 'info', title: t.run.runInfo }, h('div', null, [
          h(KeyValue, { key: 'sha', label: t.labels.commit, mono: true }, detail.run.commitSha || '—'),
          h(KeyValue, { key: 'branch', label: t.labels.branch, mono: true }, detail.run.branch || '—'),
          h(KeyValue, { key: 'image', label: t.labels.image, mono: true }, detail.run.imageRef ? shortImage(detail.run.imageRef) : '—'),
          h(KeyValue, { key: 'digest', label: 'digest', mono: true }, detail.run.imageDigest || '—'),
          h(KeyValue, { key: 'runner', label: t.labels.runner }, detail.run.runnerKind || '—'),
          h(KeyValue, { key: 'env', label: t.labels.target }, detail.run.targetEnvironment || '—'),
          h(KeyValue, { key: 'namespace', label: t.labels.namespace, mono: true }, detail.run.namespace || '—'),
          h(KeyValue, { key: 'trigger', label: t.run.trigger }, t.trigger[detail.run.trigger] ?? detail.run.trigger),
          h(KeyValue, { key: 'duration', label: t.stage.duration }, formatDuration(duration)),
          h(KeyValue, { key: 'cleanup', label: t.run.cleanup }, t.cleanup[detail.run.cleanupState] ?? detail.run.cleanupState),
        ])),
        detail.run.errorCode
          ? h(SectionCard, { key: 'error', title: t.stage.error }, h('div', { className: 'cicd-small', style: { color: '#b91c1c' } }, [
              h('div', { key: 'code', className: 'cicd-mono' }, detail.run.errorCode),
              h('div', { key: 'message', style: { marginTop: 4 } }, detail.run.errorMessage),
            ]))
          : null,
      ]),
    ]),
  ])
}
