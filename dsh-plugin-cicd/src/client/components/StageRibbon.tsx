import type { StageKey } from '../../host/domain/types.js'
import { h } from '../react.js'
import { Icon } from '../icons.js'
import { stageCopy, type Lang } from '../i18n.js'

export const PRIMARY_STAGE_KEYS: StageKey[] = ['source', 'build', 'image', 'push', 'deploy', 'verify']

export function StageRibbon({ lang }: { lang: Lang }) {
  const copy = stageCopy(lang)
  return h('div', { className: 'cicd-path', 'aria-label': lang === 'zh' ? '执行路径' : 'Execution path' }, [
    h('div', { key: 'head', className: 'cicd-path-head' }, [
      h('span', { key: 'label', className: 'cicd-path-label' }, lang === 'zh' ? '执行路径' : 'Execution path'),
      h('span', { key: 'hint', className: 'cicd-path-hint' }, lang === 'zh' ? '上游失败时，后续阶段默认跳过' : 'Downstream stages skip when an upstream stage fails'),
    ]),
    h(
      'div',
      { key: 'body', className: 'cicd-path-body' },
      PRIMARY_STAGE_KEYS.map((key, index) =>
        h('div', { key, className: 'cicd-path-cell' }, [
          h('div', { key: 'item', className: 'cicd-path-item' }, [
            h(Icon, { key: 'icon', name: copy[key].icon as never, size: 15 }),
            h('span', { key: 'title' }, copy[key].title),
          ]),
          index < PRIMARY_STAGE_KEYS.length - 1
            ? h(Icon, { key: 'arrow', name: 'chevron', size: 13, className: 'cicd-path-arrow' })
            : null,
        ]),
      ),
    ),
    h('div', { key: 'report', className: 'cicd-path-report' }, [
      h(Icon, { key: 'icon', name: 'report', size: 14 }),
      h('span', { key: 'title' }, copy.report.title),
      h('span', { key: 'note' }, copy.report.subtitle),
    ]),
  ])
}
