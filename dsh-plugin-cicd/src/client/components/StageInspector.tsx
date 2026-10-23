import type { PipelineSummary, RunRecord, RunStageRecord, StageKey } from '../../host/domain/types.js'
import { h } from '../react.js'
import { Icon } from '../icons.js'
import { formatDuration, formatTime, shortSha } from '../format.js'
import { stageCopy, statusLabel, type Lang } from '../i18n.js'
import { Badge, KeyValue, StatusBadge } from './common.js'

export function StageInspector({
  stageKey,
  stage,
  pipeline,
  run,
  lang,
}: {
  stageKey: StageKey
  stage?: RunStageRecord
  pipeline?: PipelineSummary
  run?: RunRecord
  lang: Lang
}) {
  const content = stageCopy(lang)[stageKey]
  const status = stage?.status ?? 'not_run'
  const duration =
    stage?.startedAt && stage?.finishedAt
      ? stage.finishedAt - stage.startedAt
      : stage?.startedAt && stage.status === 'running'
        ? Date.now() - stage.startedAt
        : null

  return h('div', { className: 'cicd-card cicd-stage-inspector' }, [
    h('div', { key: 'head', className: 'cicd-inspector-head' }, [
      h('div', { key: 'icon', className: 'cicd-inspector-icon' }, h(Icon, { name: content.icon as never, size: 16 })),
      h('div', { key: 'copy', style: { minWidth: 0, flex: '1 1 auto' } }, [
        h('div', { key: 'title', className: 'cicd-inspector-title' }, content.title),
        h('div', { key: 'sub', className: 'cicd-inspector-sub' }, content.subtitle),
      ]),
      h('div', { key: 'status' }, h(StatusBadge, { status, label: statusLabel(lang, status) })),
    ]),
    h('div', { key: 'body', className: 'cicd-inspector-body' }, [
      stage
        ? h('div', { key: 'facts' }, [
            run ? h(KeyValue, { key: 'commit', label: 'Commit', mono: true }, shortSha(run.commitSha)) : null,
            h(KeyValue, { key: 'start', label: lang === 'zh' ? '开始' : 'Started' }, formatTime(stage.startedAt, lang)),
            h(KeyValue, { key: 'end', label: lang === 'zh' ? '结束' : 'Ended' }, formatTime(stage.finishedAt, lang)),
            h(KeyValue, { key: 'duration', label: lang === 'zh' ? '耗时' : 'Duration' }, formatDuration(duration)),
            h(KeyValue, { key: 'exit', label: lang === 'zh' ? '退出码' : 'Exit code', mono: true }, stage.exitCode === null ? '—' : String(stage.exitCode)),
            stage.errorCode
              ? h(KeyValue, { key: 'error', label: lang === 'zh' ? '失败原因' : 'Failure' }, `${stage.errorCode}${stage.errorMessage ? ` · ${stage.errorMessage}` : ''}`)
              : null,
          ])
        : h('div', { key: 'facts-empty', className: 'cicd-small cicd-muted' }, lang === 'zh' ? '尚无运行记录。运行后这里会显示开始/结束时间、耗时和退出码。' : 'No run yet. Start/end, duration and exit code appear after a run.'),
      h('div', { key: 'logs-head', className: 'cicd-subhead' }, lang === 'zh' ? '日志' : 'Logs'),
      h('div', { key: 'logs-empty', className: 'cicd-small cicd-muted', style: { lineHeight: 1.6 } }, lang === 'zh' ? '当前阶段还没有日志。' : 'No logs for this stage yet.'),
      stageKey === 'report'
        ? h('div', { key: 'report-note', style: { marginTop: 10 } }, h(Badge, { tone: 'muted' }, lang === 'zh' ? '失败时仍生成汇总' : 'Still summarizes failures'))
        : null,
    ]),
  ])
}
