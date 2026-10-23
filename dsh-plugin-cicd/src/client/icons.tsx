import { h } from './react.js'

export type IconName =
  | 'pipeline'
  | 'github'
  | 'build'
  | 'image'
  | 'push'
  | 'deploy'
  | 'verify'
  | 'report'
  | 'plus'
  | 'refresh'
  | 'arrow'
  | 'edit'
  | 'trash'
  | 'clock'
  | 'lock'
  | 'terminal'
  | 'info'
  | 'chevron'
  | 'back'
  | 'server'
  | 'key'
  | 'check'
  | 'x'

interface IconProps {
  name: IconName
  size?: number
  color?: string
  className?: string
}

export function Icon({ name, size = 18, color = 'currentColor', className }: IconProps) {
  const common = {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: color,
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className,
    style: { display: 'block', flex: 'none' },
  }
  switch (name) {
    case 'pipeline':
      return h('svg', common, [
        h('circle', { key: 'a', cx: 5, cy: 12, r: 2.2 }),
        h('circle', { key: 'b', cx: 12, cy: 12, r: 2.2 }),
        h('circle', { key: 'c', cx: 19, cy: 12, r: 2.2 }),
        h('path', { key: 'd', d: 'M7.2 12h2.6M14.2 12h2.6' }),
      ])
    case 'github':
      return h('svg', common, [
        h('path', {
          key: 'a',
          d: 'M9 19c-4.3 1.3-4.3-2.1-6-2.5m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.7 4.7 0 0 0-1.3-3.2 4.4 4.4 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6.8 2.3 5.8 2.6 5.8 2.6a4.4 4.4 0 0 0-.1 3.2A4.7 4.7 0 0 0 4.4 8.9c0 4.6 2.7 5.7 5.5 6-.4.4-.6 1-.5 1.8V21',
        }),
      ])
    case 'build':
      return h('svg', common, [
        h('path', { key: 'a', d: 'm14.7 6.3 3 3M5 19l3.6-1 9.8-9.8a2.1 2.1 0 0 0-3-3L5.6 15 5 19Z' }),
        h('path', { key: 'b', d: 'M4 7h4M6 5v4M15 18h5' }),
      ])
    case 'image':
      return h('svg', common, [
        h('rect', { key: 'a', x: 3, y: 3, width: 18, height: 18, rx: 3 }),
        h('circle', { key: 'b', cx: 8.5, cy: 8.5, r: 1.4 }),
        h('path', { key: 'c', d: 'm21 15-5-5L5 21' }),
      ])
    case 'push':
      return h('svg', common, [
        h('path', { key: 'a', d: 'M12 16V4m0 0L7 9m5-5 5 5' }),
        h('path', { key: 'b', d: 'M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3' }),
      ])
    case 'deploy':
      return h('svg', common, [
        h('rect', { key: 'a', x: 3, y: 4, width: 18, height: 6, rx: 2 }),
        h('rect', { key: 'b', x: 3, y: 14, width: 18, height: 6, rx: 2 }),
        h('path', { key: 'c', d: 'M7 7h.01M7 17h.01' }),
      ])
    case 'verify':
      return h('svg', common, [
        h('circle', { key: 'a', cx: 12, cy: 12, r: 9 }),
        h('path', { key: 'b', d: 'm8 12 2.6 2.6L16.5 8.7' }),
      ])
    case 'report':
      return h('svg', common, [
        h('path', { key: 'a', d: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z' }),
        h('path', { key: 'b', d: 'M14 3v6h6M8 13h8M8 17h5' }),
      ])
    case 'plus':
      return h('svg', common, [h('path', { key: 'a', d: 'M12 5v14M5 12h14' })])
    case 'refresh':
      return h('svg', common, [
        h('path', { key: 'a', d: 'M20 11a8 8 0 1 0-2.3 5.7' }),
        h('path', { key: 'b', d: 'M20 4v7h-7' }),
      ])
    case 'arrow':
      return h('svg', common, [h('path', { key: 'a', d: 'M5 12h14m-5-5 5 5-5 5' })])
    case 'edit':
      return h('svg', common, [
        h('path', { key: 'a', d: 'M12 20h9' }),
        h('path', { key: 'b', d: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z' }),
      ])
    case 'trash':
      return h('svg', common, [
        h('path', { key: 'a', d: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5' }),
      ])
    case 'clock':
      return h('svg', common, [h('circle', { key: 'a', cx: 12, cy: 12, r: 9 }), h('path', { key: 'b', d: 'M12 7v5l3 2' })])
    case 'lock':
      return h('svg', common, [
        h('rect', { key: 'a', x: 4, y: 10, width: 16, height: 11, rx: 2 }),
        h('path', { key: 'b', d: 'M8 10V7a4 4 0 0 1 8 0v3' }),
      ])
    case 'terminal':
      return h('svg', common, [
        h('rect', { key: 'a', x: 3, y: 4, width: 18, height: 16, rx: 2 }),
        h('path', { key: 'b', d: 'm7 9 3 3-3 3M13 15h4' }),
      ])
    case 'info':
      return h('svg', common, [h('circle', { key: 'a', cx: 12, cy: 12, r: 9 }), h('path', { key: 'b', d: 'M12 11v5M12 8h.01' })])
    case 'chevron':
      return h('svg', common, [h('path', { key: 'a', d: 'm9 6 6 6-6 6' })])
    case 'back':
      return h('svg', common, [h('path', { key: 'a', d: 'M19 12H5m5 5-5-5 5-5' })])
    case 'server':
      return h('svg', common, [
        h('rect', { key: 'a', x: 4, y: 3, width: 16, height: 7, rx: 2 }),
        h('rect', { key: 'b', x: 4, y: 14, width: 16, height: 7, rx: 2 }),
        h('path', { key: 'c', d: 'M8 6.5h.01M8 17.5h.01' }),
      ])
    case 'key':
      return h('svg', common, [
        h('circle', { key: 'a', cx: 8, cy: 15, r: 4 }),
        h('path', { key: 'b', d: 'm11 12 9-9M17 6l2 2M14 9l2 2' }),
      ])
    case 'check':
      return h('svg', common, [h('path', { key: 'a', d: 'm5 12 4 4L19 6' })])
    case 'x':
      return h('svg', common, [h('path', { key: 'a', d: 'M6 6l12 12M18 6 6 18' })])
    default:
      return h('svg', common, [h('circle', { key: 'a', cx: 12, cy: 12, r: 9 })])
  }
}
