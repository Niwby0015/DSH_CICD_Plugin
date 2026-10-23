import type { PipelineSummary, RunRecord, RunStageRecord, StageDefinition, StageKey, StageStatus } from '../../host/domain/types.js'
import { h } from '../react.js'
import { Icon } from '../icons.js'
import { stageCopy, statusLabel, type Lang } from '../i18n.js'
import { shortImage, shortSha } from '../format.js'

type DisplayStatus = StageStatus | 'not_run'

function statusOf(stage: RunStageRecord | undefined, hasRun: boolean): DisplayStatus {
  if (!stage) return hasRun ? 'pending' : 'not_run'
  return stage.status
}

function metricFor(key: StageKey, pipeline: PipelineSummary | undefined, run: RunRecord | undefined, lang: Lang): string {
  const copy = stageCopy(lang)
  if (key === 'source') return run?.commitSha ? shortSha(run.commitSha) : pipeline?.branch || '—'
  if (key === 'build') return pipeline ? pipeline.language : '—'
  if (key === 'image') return run?.imageRef ? shortImage(run.imageRef) : pipeline?.imageTagTemplate || '—'
  if (key === 'push') return run?.imageDigest ? shortSha(run.imageDigest.replace('sha256:', ''), 8) : 'digest —'
  if (key === 'deploy') return run?.targetEnvironment || pipeline?.targetEnvironment || '—'
  if (key === 'verify') return run?.status === 'succeeded' ? copy.verify.short : '—'
  if (key === 'report') return run?.cleanupState ? run.cleanupState : '—'
  return '—'
}

export function PipelineGraph({
  definitions,
  stages,
  selected,
  onSelect,
  lang,
  pipeline,
  run,
}: {
  definitions: StageDefinition[]
  stages?: RunStageRecord[]
  selected: StageKey
  onSelect: (key: StageKey) => void
  lang: Lang
  pipeline?: PipelineSummary
  run?: RunRecord
}) {
  const copy = stageCopy(lang)
  const primary = definitions.filter((definition) => definition.primary)
  const report = definitions.find((definition) => definition.key === 'report')
  const byKey = new Map((stages ?? []).map((stage) => [stage.key, stage]))
  const hasRun = Boolean(stages && stages.length > 0)

  return h('div', { className: 'cicd-stage-map-wrap' }, [
    h(
      'div',
      { key: 'map', className: 'cicd-stage-map', role: 'list', 'aria-label': lang === 'zh' ? '执行阶段' : 'Execution stages' },
      primary.map((definition, index) => {
        const stage = byKey.get(definition.key)
        const status = statusOf(stage, hasRun)
        const content = copy[definition.key]
        return h('div', { key: definition.key, className: 'cicd-stage-cell', role: 'listitem' }, [
          h(
            'button',
            {
              key: 'node',
              type: 'button',
              className: 'cicd-stage-node',
              'data-status': status,
              'data-selected': selected === definition.key ? 'true' : 'false',
              onClick: () => onSelect(definition.key),
              'aria-label': `${content.title}，${statusLabel(lang, status)}`,
            },
            [
              h('span', { key: 'top', className: 'cicd-stage-node-top' }, [
                h('span', { key: 'index', className: 'cicd-stage-index' }, String(index + 1).padStart(2, '0')),
                h('span', { key: 'status', className: 'cicd-stage-status' }, statusLabel(lang, status)),
              ]),
              h('span', { key: 'name', className: 'cicd-stage-name' }, content.title),
              h('span', { key: 'sub', className: 'cicd-stage-sub' }, content.subtitle),
              h('span', { key: 'foot', className: 'cicd-stage-foot' }, metricFor(definition.key, pipeline, run, lang)),
            ],
          ),
          index < primary.length - 1
            ? h(Icon, { key: 'connector', name: 'chevron', size: 14, className: 'cicd-connector' })
            : null,
        ])
      }),
    ),
    report
      ? h(
          'button',
          {
            key: 'report',
            type: 'button',
            className: 'cicd-report-strip',
            onClick: () => onSelect('report'),
            'data-selected': selected === 'report' ? 'true' : 'false',
          },
          [
            h(Icon, { key: 'icon', name: 'report', size: 14 }),
            h('span', { key: 'label', className: 'cicd-report-label' }, copy.report.title),
            h('span', { key: 'note' }, copy.report.subtitle),
            h('span', { key: 'spacer', className: 'cicd-spacer' }),
            h('span', { key: 'status' }, statusLabel(lang, statusOf(byKey.get('report'), hasRun))),
          ],
        )
      : null,
  ])
}
