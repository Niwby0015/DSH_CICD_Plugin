import type { GitTarget, GitWorkspace } from '../../host/git/types.js'
import { api, isApiError } from '../api.js'
import { h, useEffect, useState } from '../react.js'
import { Icon } from '../icons.js'
import { copyFor, type Lang } from '../i18n.js'
import { Button, Field, Notice, TextInput } from '../components/common.js'

const TEXT = {
  zh: {
    title: 'Git 源码',
    subtitle: '选择本地源码目录和目标仓库，然后提交并推送到 GitHub。',
    workspace: 'DSH 工作区',
    workspaceHint: '从 DSH 已登记的项目中选择，或直接在下方填写本地路径。',
    projectPath: '本地源码目录',
    projectPathHint: '必须是本地 Git 仓库的绝对路径；仓库根目录或子目录都可以。',
    projectPathPlaceholder: '例如：D:\\work\\order-service',
    remoteUrl: '目标仓库',
    remoteUrlHint: '留空则使用当前 Git 的 origin；填写后按此地址推送，例如 https://github.com/acme/demo.git。',
    remoteUrlPlaceholder: 'https://github.com/acme/demo.git',
    open: '打开 Git 操作',
    choose: '选择本地源码',
    note: 'Git 操作直接基于本地仓库，不需要先创建流水线。',
    noWorkspaces: 'DSH 还没有登记工作区，直接填写本地路径即可。',
    workspacesFailed: '无法读取 DSH 工作区，直接填写本地路径即可。',
    pathRequired: '请填写本地源码目录',
    pathRelative: '请填写绝对路径',
    hostMissing: 'Host 还没有加载 Git 路由',
    hostMissingBody: '当前页面是新的 Client bundle，但运行中的 DSH Host 仍是旧版本，所以 /api/cicd/git/* 返回 404。请重启一次 DSH；只刷新页面不够。',
  },
  en: {
    title: 'Git source',
    subtitle: 'Choose a local source directory and target repository, then commit and push to GitHub.',
    workspace: 'DSH workspace',
    workspaceHint: 'Pick a registered DSH project, or enter a local path below.',
    projectPath: 'Local source directory',
    projectPathHint: 'An absolute path to a local Git repository; the root or a subdirectory works.',
    projectPathPlaceholder: 'e.g. D:\\work\\order-service',
    remoteUrl: 'Target repository',
    remoteUrlHint: 'Leave empty to use the current Git origin; otherwise this URL is used for push, e.g. https://github.com/acme/demo.git.',
    remoteUrlPlaceholder: 'https://github.com/acme/demo.git',
    open: 'Open Git operations',
    choose: 'Choose local source',
    note: 'Git operations run directly on the local repository; no pipeline is required.',
    noWorkspaces: 'No DSH workspace is registered yet; enter a local path manually.',
    workspacesFailed: 'Could not read DSH workspaces; enter a local path manually.',
    pathRequired: 'Local source directory is required',
    pathRelative: 'Use an absolute path',
    hostMissing: 'The Host has not loaded Git routes',
    hostMissingBody: 'The page is a newer Client bundle, but the running DSH Host is older, so /api/cicd/git/* returns 404. Restart DSH once; a page refresh is not enough.',
  },
} as const

const STORAGE_KEY = 'dsh-cicd.git.target.v1'

function readRemembered(): { projectPath: string; remoteUrl: string } {
  try {
    if (typeof localStorage === 'undefined') return { projectPath: '', remoteUrl: '' }
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { projectPath: '', remoteUrl: '' }
    const value = JSON.parse(raw) as { projectPath?: string; remoteUrl?: string }
    return { projectPath: value.projectPath ?? '', remoteUrl: value.remoteUrl ?? '' }
  } catch {
    return { projectPath: '', remoteUrl: '' }
  }
}

function remember(target: GitTarget): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ projectPath: target.projectPath, remoteUrl: target.remoteUrl ?? '' }))
  } catch {
    // localStorage is a convenience, never a correctness requirement
  }
}

function absolutePath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('/') || path.startsWith('\\\\')
}

export function GitEntryPage({
  lang,
  gitAvailable,
  gitReason,
  onOpen,
}: {
  lang: Lang
  gitAvailable: boolean
  gitReason: string
  onOpen: (target: GitTarget) => void
}) {
  const t = TEXT[lang]
  const copy = copyFor(lang)
  const [remembered] = useState(readRemembered)
  const [projectPath, setProjectPath] = useState(remembered.projectPath)
  const [remoteUrl, setRemoteUrl] = useState(remembered.remoteUrl)
  const [workspaces, setWorkspaces] = useState<GitWorkspace[]>([])
  const [workspaceError, setWorkspaceError] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    api.gitWorkspaces(controller.signal)
      .then((payload) => setWorkspaces(payload.workspaces))
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setWorkspaceError(isApiError(caught) ? caught.message : String(caught))
        }
      })
    return () => controller.abort()
  }, [])

  const chooseWorkspace = (path: string) => {
    setProjectPath(path)
    setError('')
  }

  const open = () => {
    const path = projectPath.trim()
    if (!path) {
      setError(t.pathRequired)
      return
    }
    if (!absolutePath(path)) {
      setError(t.pathRelative)
      return
    }
    const target: GitTarget = {
      projectPath: path,
      ...(remoteUrl.trim() ? { remoteUrl: remoteUrl.trim() } : {}),
    }
    remember(target)
    onOpen(target)
  }

  return h('div', { className: 'cicd-section-stack' }, [
    h('div', { key: 'head' }, [
      h('h1', { key: 'title', className: 'cicd-title', style: { fontSize: 22 } }, t.title),
      h('p', { key: 'sub', className: 'cicd-small cicd-muted', style: { margin: '4px 0 0' } }, t.subtitle),
    ]),
    h(Notice, { key: 'note', tone: 'info', icon: 'info' }, t.note),
    gitAvailable
      ? null
      : h(Notice, { key: 'host', tone: 'warning', title: t.hostMissing, icon: 'info' }, [
          h('div', { key: 'reason' }, gitReason || t.hostMissingBody),
          h('div', { key: 'body', style: { marginTop: 4 } }, t.hostMissingBody),
        ]),
    h('div', { key: 'form', className: 'cicd-card', style: { padding: '18px 20px' } }, [
      h('div', { key: 'grid', className: 'cicd-form-grid' }, [
        h(Field, {
          key: 'workspace',
          label: t.workspace,
          hint: t.workspaceHint,
          span: 2,
        }, workspaces.length > 0
          ? h('div', { className: 'cicd-workspace-list' }, workspaces.map((workspace) => h('button', {
              key: workspace.path,
              type: 'button',
              className: `cicd-workspace ${projectPath === workspace.path ? 'is-selected' : ''}`.trim(),
              onClick: () => chooseWorkspace(workspace.path),
              title: workspace.path,
            }, [
              h(Icon, { key: 'icon', name: 'pipeline', size: 14 }),
              h('span', { key: 'title', className: 'cicd-workspace-title' }, workspace.title),
              h('span', { key: 'path', className: 'cicd-workspace-path cicd-mono' }, workspace.path),
            ])))
          : h('div', { className: 'cicd-small cicd-muted' }, workspaceError ? t.workspacesFailed : t.noWorkspaces)),
        h(Field, {
          key: 'path',
          label: t.projectPath,
          hint: t.projectPathHint,
          error: error === t.pathRequired || error === t.pathRelative ? error : undefined,
          span: 2,
        }, h(TextInput, {
          value: projectPath,
          onChange: (value: string) => { setProjectPath(value); setError('') },
          placeholder: t.projectPathPlaceholder,
          monospace: true,
        })),
        h(Field, {
          key: 'remote',
          label: t.remoteUrl,
          hint: t.remoteUrlHint,
          span: 2,
        }, h(TextInput, {
          value: remoteUrl,
          onChange: setRemoteUrl,
          placeholder: t.remoteUrlPlaceholder,
          monospace: true,
        })),
      ]),
      h('div', { key: 'actions', className: 'cicd-form-actions', style: { paddingTop: 16 } }, [
        h(Button, { key: 'open', variant: 'primary', icon: 'github', onClick: open, disabled: !gitAvailable }, t.open),
      ]),
    ]),
    h('div', { key: 'hint', className: 'cicd-small cicd-muted' }, copy.labels.configHint),
  ])
}
