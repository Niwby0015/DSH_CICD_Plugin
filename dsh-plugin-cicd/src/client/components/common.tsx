import type { ChangeEvent, ReactNode } from 'react'
import { h } from '../react.js'
import { Icon, type IconName } from '../icons.js'
import type { Lang } from '../i18n.js'

export function Button({
  children,
  onClick,
  variant = 'secondary',
  icon,
  disabled = false,
  title,
  type = 'button',
}: {
  children?: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  icon?: IconName
  disabled?: boolean
  title?: string
  type?: 'button' | 'submit'
}) {
  return h(
    'button',
    {
      type,
      className: `cicd-btn cicd-btn-${variant}`,
      onClick,
      disabled,
      title,
    },
    [
      icon ? h(Icon, { key: 'icon', name: icon, size: 15 }) : null,
      children ? h('span', { key: 'label' }, children) : null,
    ],
  )
}

export function IconButton({
  icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: IconName
  label: string
  onClick?: () => void
  disabled?: boolean
}) {
  return h(
    'button',
    { type: 'button', className: 'cicd-iconbtn', title: label, 'aria-label': label, onClick, disabled },
    h(Icon, { name: icon, size: 16 }),
  )
}

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'muted'

export function Badge({ children, tone = 'neutral', dot = false }: { children: ReactNode; tone?: Tone; dot?: boolean }) {
  return h('span', { className: `cicd-badge cicd-badge-${tone}` }, [
    dot ? h('span', { key: 'dot', className: 'cicd-badge-dot', 'aria-hidden': true }) : null,
    h('span', { key: 'label' }, children),
  ])
}

export function StatusBadge({ status, label }: { status: string; label: string }) {
  const tone: Tone =
    status === 'succeeded' || status === 'ready'
      ? 'success'
      : status === 'failed' || status === 'blocked'
        ? 'danger'
        : status === 'running' || status === 'queued' || status === 'awaiting_approval'
          ? 'info'
          : status === 'cancelled' || status === 'interrupted' || status === 'skipped'
            ? 'warning'
            : 'muted'
  return h(Badge, { tone, dot: true }, label)
}

export function SectionCard({
  title,
  description,
  extra,
  children,
  className = '',
}: {
  title?: ReactNode
  description?: ReactNode
  extra?: ReactNode
  children: ReactNode
  className?: string
}) {
  return h('section', { className: `cicd-card ${className}`.trim() }, [
    title || description || extra
      ? h('div', { key: 'head', className: 'cicd-card-head' }, [
          h('div', { key: 'copy', className: 'cicd-card-copy' }, [
            title ? h('h2', { key: 'title', className: 'cicd-card-title' }, title) : null,
            description ? h('p', { key: 'desc', className: 'cicd-card-desc' }, description) : null,
          ]),
          extra ? h('div', { key: 'extra', className: 'cicd-card-extra' }, extra) : null,
        ])
      : null,
    h('div', { key: 'body', className: 'cicd-card-body' }, children),
  ])
}

export function Field({
  label,
  hint,
  error,
  children,
  span = 1,
}: {
  label: string
  hint?: string
  error?: string
  children: ReactNode
  span?: 1 | 2
}) {
  return h('label', { className: `cicd-field ${span === 2 ? 'cicd-field-wide' : ''}`.trim() }, [
    h('span', { key: 'label', className: 'cicd-field-label' }, label),
    h('span', { key: 'control', className: 'cicd-field-control' }, children),
    error
      ? h('span', { key: 'error', className: 'cicd-field-error' }, error)
      : hint
        ? h('span', { key: 'hint', className: 'cicd-field-hint' }, hint)
        : null,
  ])
}

export function TextInput({
  value,
  onChange,
  placeholder,
  disabled = false,
  type = 'text',
  monospace = false,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  type?: 'text' | 'password'
  monospace?: boolean
}) {
  return h('input', {
    className: `cicd-input ${monospace ? 'cicd-mono' : ''}`.trim(),
    value,
    placeholder,
    disabled,
    type,
    onChange: (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
  })
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
  disabled = false,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  disabled?: boolean
}) {
  return h('textarea', {
    className: 'cicd-input cicd-textarea',
    value,
    placeholder,
    rows,
    disabled,
    onChange: (event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value),
  })
}

export function Select({
  value,
  onChange,
  options,
  disabled = false,
}: {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  disabled?: boolean
}) {
  return h(
    'select',
    {
      className: 'cicd-input cicd-select',
      value,
      disabled,
      onChange: (event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value),
    },
    options.map((option) => h('option', { key: option.value, value: option.value }, option.label)),
  )
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return h('div', { className: 'cicd-stat' }, [
    h('div', { key: 'label', className: 'cicd-stat-label' }, label),
    h('div', { key: 'value', className: 'cicd-stat-value' }, value),
    hint ? h('div', { key: 'hint', className: 'cicd-stat-hint' }, hint) : null,
  ])
}

export function EmptyState({
  icon = 'info',
  title,
  body,
  action,
  children,
}: {
  icon?: IconName
  title: string
  body: string
  action?: ReactNode
  children?: ReactNode
}) {
  return h('div', { className: 'cicd-empty' }, [
    h('div', { key: 'icon', className: 'cicd-empty-icon' }, h(Icon, { name: icon, size: 22 })),
    h('h3', { key: 'title', className: 'cicd-empty-title' }, title),
    h('p', { key: 'body', className: 'cicd-empty-body' }, body),
    action ? h('div', { key: 'action', className: 'cicd-empty-action' }, action) : null,
    children ? h('div', { key: 'extra', className: 'cicd-empty-extra' }, children) : null,
  ])
}

export function Notice({
  tone = 'info',
  title,
  children,
  icon = 'info',
}: {
  tone?: 'info' | 'warning' | 'danger'
  title?: string
  children: ReactNode
  icon?: IconName
}) {
  return h('div', { className: `cicd-notice cicd-notice-${tone}` }, [
    h('div', { key: 'icon', className: 'cicd-notice-icon' }, h(Icon, { name: icon, size: 17 })),
    h('div', { key: 'body', className: 'cicd-notice-body' }, [
      title ? h('div', { key: 'title', className: 'cicd-notice-title' }, title) : null,
      h('div', { key: 'text', className: 'cicd-notice-text' }, children),
    ]),
  ])
}

export function Spinner() {
  return h('span', { className: 'cicd-spinner', 'aria-hidden': true })
}

export function LoadingBlock({ label }: { label: string }) {
  return h('div', { className: 'cicd-loading' }, [h(Spinner, { key: 'spinner' }), h('span', { key: 'label' }, label)])
}

export function KeyValue({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return h('div', { className: 'cicd-kv' }, [
    h('span', { key: 'label', className: 'cicd-kv-label' }, label),
    h('span', { key: 'value', className: `cicd-kv-value ${mono ? 'cicd-mono' : ''}`.trim() }, children),
  ])
}

export function LanguageBadge({ lang, value }: { lang: Lang; value: string }) {
  return h(Badge, { tone: 'neutral' }, value)
}
