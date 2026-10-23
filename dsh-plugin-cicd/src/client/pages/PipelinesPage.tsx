import type { PipelineSummary } from '../../host/domain/types.js'
import { api, isApiError } from '../api.js'
import { h } from '../react.js'
import { Icon } from '../icons.js'
import { shortImage, shortSha, formatTime, compactPath } from '../format.js'
import { statusLabel, copyFor, runStatusLabel, type Lang } from '../i18n.js'
import { Badge, Button, EmptyState, StatusBadge } from '../components/common.js'
import { StageRibbon } from '../components/StageRibbon.js'

function pipelineStatusLabel(lang: Lang, pipeline: PipelineSummary): { label: string; status: string } {
  if (pipeline.lastRun) return { label: runStatusLabel(lang, pipeline.lastRun.status), status: pipeline.lastRun.status }
  return { label: statusLabel(lang, 'not_run'), status: 'not_run' }
}

export function PipelinesPage({
  lang,
  pipelines,
  onCreate,
  onOpen,
  onEdit,
  onRefresh,
  onDeleted,
}: {
  lang: Lang
  pipelines: PipelineSummary[]
  onCreate: () => void
  onOpen: (id: string) => void
  onEdit: (id: string) => void
  onRefresh: () => void
  onDeleted: () => void
}) {
  const t = copyFor(lang)

  const remove = async (pipeline: PipelineSummary) => {
    const confirmed = window.confirm(
      lang === 'zh'
        ? `确定删除流水线「${pipeline.name}」吗？其运行记录和日志会一并删除。`
        : `Delete pipeline "${pipeline.name}"? Its runs and logs will be deleted too.`,
    )
    if (!confirmed) return
    try {
      await api.deletePipeline(pipeline.id)
      onDeleted()
    } catch (caught) {
      window.alert(isApiError(caught) ? caught.message : String(caught))
    }
  }
  if (pipelines.length === 0) {
    return h('div', { className: 'cicd-section-stack' }, [
      h(EmptyState, {
        key: 'empty',
        icon: 'pipeline',
        title: t.empty.pipelinesTitle,
        body: t.empty.pipelinesBody,
        action: h(Button, { variant: 'primary', icon: 'plus', onClick: onCreate }, t.newPipeline),
      }),
      h(StageRibbon, { key: 'ribbon', lang }),
    ])
  }

  return h('div', { className: 'cicd-list-area' }, [
    h('div', { key: 'toolbar', className: 'cicd-toolbar' }, [
      h('div', { key: 'filter', className: 'cicd-inline cicd-small cicd-muted' }, [
        h(Icon, { key: 'icon', name: 'info', size: 14 }),
        h('span', { key: 'text' }, lang === 'zh' ? '配置只包含非敏感字段' : 'Configuration contains no secrets'),
      ]),
      h('span', { key: 'spacer', className: 'cicd-spacer' }),
      h(Button, { key: 'refresh', variant: 'ghost', icon: 'refresh', onClick: onRefresh }, t.refresh),
    ]),
    h('div', { key: 'table', className: 'cicd-table-wrap' }, h('table', { className: 'cicd-table' }, [
      h('thead', { key: 'head' }, h('tr', null, [
        h('th', { key: 'name' }, lang === 'zh' ? '流水线 / 项目' : 'Pipeline / project'),
        h('th', { key: 'repo' }, lang === 'zh' ? '仓库 / 分支' : 'Repository / branch'),
        h('th', { key: 'lang' }, t.labels.language),
        h('th', { key: 'commit' }, t.labels.commit),
        h('th', { key: 'image' }, t.labels.image),
        h('th', { key: 'target' }, t.labels.target),
        h('th', { key: 'status' }, t.labels.lastRun),
        h('th', { key: 'updated' }, t.labels.updated),
        h('th', { key: 'actions', style: { width: 56 } }, ''),
      ])),
      h('tbody', { key: 'body' }, pipelines.map((pipeline) => {
        const state = pipelineStatusLabel(lang, pipeline)
        return h('tr', {
          key: pipeline.id,
          'data-clickable': 'true',
          onClick: () => onOpen(pipeline.id),
        }, [
          h('td', { key: 'name' }, h('div', { className: 'cicd-cell-main' }, pipeline.name), h('div', { className: 'cicd-cell-sub' }, compactPath(pipeline.projectPath || '—'))),
          h('td', { key: 'repo' }, [
            h('div', { key: 'url', className: 'cicd-cell-main', style: { fontWeight: 500, maxWidth: 220 }, title: pipeline.repoUrl }, pipeline.repoUrl || (lang === 'zh' ? '未配置仓库' : 'No repository')),
            h('div', { key: 'branch', className: 'cicd-cell-sub cicd-mono' }, pipeline.branch || 'main'),
          ]),
          h('td', { key: 'lang' }, h(Badge, { tone: 'neutral' }, t.language[pipeline.language])),
          h('td', { key: 'commit', className: 'cicd-cell-muted' }, pipeline.lastRun?.commitSha ? h('span', { className: 'cicd-mono' }, shortSha(pipeline.lastRun.commitSha)) : '—'),
          h('td', { key: 'image', className: 'cicd-cell-muted' }, pipeline.lastRun?.imageRef ? h('span', { className: 'cicd-mono' }, shortImage(pipeline.lastRun.imageRef)) : '—'),
          h('td', { key: 'target', className: 'cicd-cell-muted' }, pipeline.targetEnvironment || '—'),
          h('td', { key: 'status' }, h(StatusBadge, { status: state.status, label: state.label })),
          h('td', { key: 'updated', className: 'cicd-cell-muted' }, formatTime(pipeline.updatedAt, lang)),
          h('td', { key: 'actions' }, h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 4 } }, [
            h('button', {
              type: 'button',
              className: 'cicd-iconbtn',
              title: lang === 'zh' ? '编辑' : 'Edit',
              onClick: (event: MouseEvent) => {
                event.stopPropagation()
                onEdit(pipeline.id)
              },
            }, h(Icon, { name: 'edit', size: 16 })),
            h('button', {
              type: 'button',
              className: 'cicd-iconbtn',
              title: lang === 'zh' ? '删除' : 'Delete',
              onClick: (event: MouseEvent) => {
                event.stopPropagation()
                void remove(pipeline)
              },
            }, h(Icon, { name: 'trash', size: 16 })),
          ])),
        ])
      })),
    ])),
  ])
}
