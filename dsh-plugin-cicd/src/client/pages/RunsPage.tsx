import type { PipelineSummary, RunSummary } from '../../host/domain/types.js'
import { h } from '../react.js'
import { formatTime, shortImage, shortSha } from '../format.js'
import { copyFor, runStatusLabel, type Lang } from '../i18n.js'
import { Button, EmptyState, StatusBadge } from '../components/common.js'
import { StageRibbon } from '../components/StageRibbon.js'

export function RunsPage({
  lang,
  runs,
  pipelines,
  onOpen,
  onRefresh,
}: {
  lang: Lang
  runs: RunSummary[]
  pipelines: PipelineSummary[]
  onOpen: (id: string) => void
  onRefresh: () => void
}) {
  const t = copyFor(lang)
  if (runs.length === 0) {
    return h('div', { className: 'cicd-section-stack' }, [
      h(EmptyState, {
        key: 'empty',
        icon: 'terminal',
        title: t.empty.runsTitle,
        body: t.empty.runsBody,
      }),
      h(StageRibbon, { key: 'ribbon', lang }),
    ])
  }

  const names = new Map(pipelines.map((pipeline) => [pipeline.id, pipeline.name]))
  return h('div', { className: 'cicd-list-area' }, [
    h('div', { key: 'toolbar', className: 'cicd-toolbar' }, [
      h('span', { key: 'spacer', className: 'cicd-spacer' }),
      h(Button, { key: 'refresh', variant: 'ghost', icon: 'refresh', onClick: onRefresh }, t.refresh),
    ]),
    h('div', { key: 'table', className: 'cicd-table-wrap' }, h('table', { className: 'cicd-table' }, [
      h('thead', { key: 'head' }, h('tr', null, [
        h('th', { key: 'status' }, t.labels.status),
        h('th', { key: 'pipeline' }, t.tabs.pipelines),
        h('th', { key: 'commit' }, t.labels.commit),
        h('th', { key: 'image' }, t.labels.image),
        h('th', { key: 'target' }, t.labels.target),
        h('th', { key: 'runner' }, t.labels.runner),
        h('th', { key: 'created' }, lang === 'zh' ? '开始时间' : 'Started'),
      ])),
      h('tbody', { key: 'body' }, runs.map((run) => h('tr', {
        key: run.id,
        'data-clickable': 'true',
        onClick: () => onOpen(run.id),
      }, [
        h('td', { key: 'status' }, h(StatusBadge, { status: run.status, label: runStatusLabel(lang, run.status) })),
        h('td', { key: 'pipeline' }, h('span', { className: 'cicd-cell-main' }, names.get(run.pipelineId) ?? run.pipelineId)),
        h('td', { key: 'commit', className: 'cicd-cell-muted' }, h('span', { className: 'cicd-mono' }, shortSha(run.commitSha))),
        h('td', { key: 'image', className: 'cicd-cell-muted' }, h('span', { className: 'cicd-mono' }, shortImage(run.imageRef))),
        h('td', { key: 'target', className: 'cicd-cell-muted' }, run.targetEnvironment || '—'),
        h('td', { key: 'runner', className: 'cicd-cell-muted' }, run.runnerKind === 'ssh' ? 'SSH Runner' : run.runnerKind || '—'),
        h('td', { key: 'created', className: 'cicd-cell-muted' }, formatTime(run.createdAt, lang)),
      ]))),
    ])),
  ])
}
