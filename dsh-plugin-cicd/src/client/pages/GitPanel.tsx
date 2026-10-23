import type { GitCommitPreview, GitCommitResult, GitInspection, GitTarget } from '../../host/git/types.js'
import type { Lang } from '../i18n.js'
import { api, isApiError } from '../api.js'
import { h, useEffect, useMemo, useState } from '../react.js'
import { Icon } from '../icons.js'
import { shortSha } from '../format.js'
import { Badge, Button, EmptyState, Field, LoadingBlock, Notice, SectionCard, TextArea } from '../components/common.js'

const TEXT = {
  zh: {
    title: 'Git 源码',
    subtitle: '检查工作区变更、拦截敏感文件，然后提交并推送到 GitHub。',
    back: '返回流水线',
    refresh: '刷新',
    repo: '仓库',
    branch: '当前分支',
    upstream: '上游',
    head: '当前 HEAD',
    clean: '工作区干净',
    dirty: '有未提交变更',
    ahead: '领先',
    behind: '落后',
    files: '变更文件',
    filesHint: '勾选要提交的文件；敏感文件已默认禁用。',
    selectAll: '全选',
    clearAll: '全不选',
    noChanges: '没有待提交的变更',
    noChangesBody: '工作区是干净的。修改代码后再回到这里。',
    commit: '提交并推送',
    commitHint: '提交信息会原样写入本次 commit。',
    message: '提交信息',
    messagePlaceholder: '例如：feat(order): add retry policy',
    pushBranch: '推送分支',
    prepare: '预览提交',
    preparing: '正在读取变更…',
    confirm: '确认提交并推送',
    committing: '正在提交并推送…',
    cancelPreview: '取消预览',
    previewTitle: '待确认的提交',
    previewBody: '确认后将提交选中的文件，推送到远端同名分支，并校验远端 SHA。',
    sensitiveTitle: '敏感文件已被阻止',
    sensitiveBody: '这些文件不会出现在默认选择中；请移除或改用凭据引用。',
    noRemote: '未配置 origin 远端',
    noIdentity: 'Git 用户名或邮箱未配置',
    noRemoteBody: '请先为这个仓库配置 origin，或在项目目录设置 remote。',
    noIdentityBody: '请先在项目目录执行 git config user.name 和 git config user.email。',
    diff: '变更预览',
    diffEmpty: '选择左侧文件查看 diff。',
    binary: '二进制文件，不显示内容。',
    auth: 'GitHub 认证',
    authConfigured: '已配置',
    authNotConfigured: '未配置',
    authRequired: '还没有配置 GitHub 令牌',
    authNeeded: '这个 HTTPS 仓库推送时需要认证。请在下方 GitHub 认证中保存 PAT，否则推送会返回 401。',
    authUnavailable: 'DSH 凭据服务不可用',
    authHint: '令牌只保存在 DSH 凭据中，不会进入 URL、日志或流水线配置。',
    tokenPlaceholder: 'ghp_… / github_pat_…',
    saveToken: '保存令牌',
    replaceToken: '更换令牌',
    clearToken: '清除',
    savingToken: '保存中…',
    tokenSaved: '令牌已保存，可以重试推送。',
    tokenSaveFailed: '令牌保存失败',
    success: '提交并推送成功',
    successBody: '远端分支已验证指向本次 Commit。',
    commitSha: 'Commit SHA',
    remoteSha: '远端 SHA',
    pushedBranch: '推送分支',
    verified: '远端校验',
    verifiedYes: '通过',
    loadFailed: '读取 Git 状态失败',
    prepareFailed: '无法准备提交',
    commitFailed: '提交或推送失败',
    pushFailed: '提交已保留，但推送失败',
    pushFailedBody: '本地 commit 没有丢失。修复网络/认证/分支权限后可以直接重试推送。',
    retryPush: '重试推送',
    retrying: '正在重试…',
    selected: '已选择',
    noRemoteShort: '无远端',
    planExpired: '预览已过期，请重新预览。',
    backToList: '返回流水线',
  },
  en: {
    title: 'Git source',
    subtitle: 'Inspect working-tree changes, block sensitive files, then commit and push to GitHub.',
    back: 'Back to pipeline',
    refresh: 'Refresh',
    repo: 'Repository',
    branch: 'Branch',
    upstream: 'Upstream',
    head: 'HEAD',
    clean: 'Working tree clean',
    dirty: 'Uncommitted changes',
    ahead: 'ahead',
    behind: 'behind',
    files: 'Changed files',
    filesHint: 'Select files to commit; sensitive files are disabled by default.',
    selectAll: 'Select all',
    clearAll: 'Clear',
    noChanges: 'No changes to commit',
    noChangesBody: 'The working tree is clean. Come back after editing code.',
    commit: 'Commit and push',
    commitHint: 'The message is written verbatim into this commit.',
    message: 'Commit message',
    messagePlaceholder: 'e.g. feat(order): add retry policy',
    pushBranch: 'Push branch',
    prepare: 'Preview commit',
    preparing: 'Reading changes…',
    confirm: 'Confirm commit and push',
    committing: 'Committing and pushing…',
    cancelPreview: 'Cancel preview',
    previewTitle: 'Commit to confirm',
    previewBody: 'This commits the selected files, pushes the branch, and verifies the remote SHA.',
    sensitiveTitle: 'Sensitive files blocked',
    sensitiveBody: 'These files are excluded from the default selection; remove them or use a credential reference.',
    noRemote: 'No origin remote',
    noIdentity: 'Git user.name or user.email is missing',
    noRemoteBody: 'Configure origin for this repository first.',
    noIdentityBody: 'Run git config user.name and git config user.email in the project first.',
    diff: 'Diff preview',
    diffEmpty: 'Select a file on the left to see its diff.',
    binary: 'Binary file; content is not shown.',
    auth: 'GitHub authentication',
    authConfigured: 'Configured',
    authNotConfigured: 'Not configured',
    authRequired: 'GitHub token is not configured',
    authNeeded: 'Pushing to this HTTPS repository requires authentication. Save a PAT under GitHub authentication below, otherwise the push returns 401.',
    authUnavailable: 'DSH credentials service is unavailable',
    authHint: 'The token stays in DSH credentials; it never enters the URL, logs or pipeline config.',
    tokenPlaceholder: 'ghp_… / github_pat_…',
    saveToken: 'Save token',
    replaceToken: 'Replace token',
    clearToken: 'Clear',
    savingToken: 'Saving…',
    tokenSaved: 'Token saved; retry the push.',
    tokenSaveFailed: 'Could not save the token',
    success: 'Committed and pushed',
    successBody: 'The remote branch was verified at this commit.',
    commitSha: 'Commit SHA',
    remoteSha: 'Remote SHA',
    pushedBranch: 'Pushed branch',
    verified: 'Remote verification',
    verifiedYes: 'passed',
    loadFailed: 'Could not read Git status',
    prepareFailed: 'Could not prepare the commit',
    commitFailed: 'Commit or push failed',
    pushFailed: 'Commit kept locally; push failed',
    pushFailedBody: 'The local commit is intact. Fix network/auth/branch permissions and retry the push.',
    retryPush: 'Retry push',
    retrying: 'Retrying…',
    selected: 'selected',
    noRemoteShort: 'No remote',
    planExpired: 'Preview expired; preview again.',
    backToList: 'Back to pipeline',
  },
} as const

function statusFor(entry: GitInspection['entries'][number]): string {
  if (entry.kind === 'untracked') return 'U'
  if (entry.kind === 'renamed') return 'R'
  if (entry.kind === 'deleted') return 'D'
  if (entry.kind === 'added') return 'A'
  return 'M'
}

function sensitiveDetails(error: unknown): Array<{ path: string; message: string; line?: number }> {
  if (!isApiError(error)) return []
  const details = error.details as { findings?: Array<{ path: string; message: string; line?: number }> } | undefined
  return Array.isArray(details?.findings) ? details.findings : []
}

export function GitPanel({
  target,
  lang,
  onBack,
  onCommitted,
}: {
  target: GitTarget
  lang: Lang
  onBack: () => void
  onCommitted: () => void
}) {
  const t = TEXT[lang]
  const [inspection, setInspection] = useState<GitInspection | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState('')
  const [pushBranch, setPushBranch] = useState('')
  const [branches, setBranches] = useState<string[]>([])
  const [activeDiff, setActiveDiff] = useState('')
  const [plan, setPlan] = useState<GitCommitPreview | null>(null)
  const [result, setResult] = useState<GitCommitResult | null>(null)
  const [failedPush, setFailedPush] = useState<{ commitSha: string; pushBranch: string } | null>(null)
  const [busy, setBusy] = useState<'load' | 'prepare' | 'commit' | 'token' | null>('load')
  const [error, setError] = useState('')
  const [errorDetails, setErrorDetails] = useState<Array<{ path: string; message: string; line?: number }>>([])
  const [credentials, setCredentials] = useState<{ configured: boolean; writable: boolean; source: string | null } | null>(null)
  const [credentialsError, setCredentialsError] = useState('')
  const [token, setToken] = useState('')
  const [tokenNotice, setTokenNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [showToken, setShowToken] = useState(false)

  const load = async (signal?: AbortSignal) => {
    setBusy('load')
    setError('')
    try {
      const data = await api.inspectGit(target, signal)
      setInspection(data)
      setSelected(new Set(data.defaultFiles))
      setPushBranch(data.branch === 'HEAD' ? '' : data.branch)
      setActiveDiff(data.entries[0]?.path ?? '')
      setPlan(null)
      setResult(null)
      setFailedPush(null)
    } catch (caught) {
      if (signal?.aborted) return
      setError(
        isApiError(caught) && caught.status === 404
          ? (lang === 'zh'
              ? 'Git 功能暂不可用，请重启 DSH 后重试。'
              : 'Git is temporarily unavailable; restart DSH and try again.')
          : isApiError(caught) ? caught.message : String(caught),
      )
      setErrorDetails(sensitiveDetails(caught))
    } finally {
      if (!signal?.aborted) setBusy(null)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    api.githubCredential(controller.signal)
      .then((status) => setCredentials({ configured: status.configured, writable: status.writable, source: status.source }))
      .catch((caught) => {
        if (!controller.signal.aborted) setCredentialsError(isApiError(caught) ? caught.message : String(caught))
      })
    api.gitBranches(target, controller.signal)
      .then((data) => setBranches([...new Set([data.current, ...data.local, ...data.remote])].filter(Boolean)))
      .catch(() => {})
    return () => controller.abort()
  }, [target.projectPath, target.remoteUrl])

  const selectedEntries = useMemo(
    () => inspection?.entries.filter((entry) => selected.has(entry.path)) ?? [],
    [inspection, selected],
  )
  const blocked = useMemo(
    () => inspection?.sensitive.filter((finding) => finding.severity === 'block') ?? [],
    [inspection],
  )
  const selectedBlocked = blocked.filter((finding) => selected.has(finding.path))
  const active = inspection?.diffs.find((diff) => diff.path === activeDiff)
  const canPrepare = Boolean(
    inspection &&
    inspection.remoteUrl &&
    inspection.userName &&
    inspection.userEmail &&
    selected.size > 0 &&
    selectedBlocked.length === 0 &&
    Boolean(pushBranch.trim()) &&
    message.trim(),
  )

  const toggle = (path: string, selectable: boolean) => {
    if (!selectable) return
    setPlan(null)
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const toggleAll = (select: boolean) => {
    if (!inspection) return
    setPlan(null)
    setSelected(select ? new Set(inspection.defaultFiles) : new Set())
  }

  const updateMessage = (value: string) => {
    setPlan(null)
    setMessage(value)
  }

  const updateBranch = (value: string) => {
    setPlan(null)
    setPushBranch(value)
  }

  const prepare = async () => {
    if (!canPrepare) return
    setBusy('prepare')
    setError('')
    setErrorDetails([])
    try {
      setPlan(await api.prepareGit(target, {
        files: [...selected],
        message: message.trim(),
        pushBranch,
      }))
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : String(caught))
      setErrorDetails(sensitiveDetails(caught))
    } finally {
      setBusy(null)
    }
  }

  const commit = async () => {
    if (!plan) return
    setBusy('commit')
    setError('')
    setErrorDetails([])
    try {
      const committed = await api.commitGit(plan.planId)
      setResult(committed)
      setPlan(null)
      setFailedPush(null)
      onCommitted()
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : String(caught))
      setErrorDetails(sensitiveDetails(caught))
      if (
        isApiError(caught) &&
        ['GIT_PUSH_FAILED', 'GIT_REMOTE_MISMATCH', 'GIT_AUTH_FAILED', 'GIT_PUSH_DENIED'].includes(caught.code)
      ) {
        const details = caught.details as { commitSha?: string; pushBranch?: string } | undefined
        if (details?.commitSha && details.pushBranch) {
          setFailedPush({ commitSha: details.commitSha, pushBranch: details.pushBranch })
        }
      }
    } finally {
      setBusy(null)
    }
  }

  const retryPush = async () => {
    if (!failedPush) return
    setBusy('commit')
    setError('')
    try {
      const pushed = await api.pushGit(target, failedPush.pushBranch, failedPush.commitSha)
      setResult(pushed)
      setFailedPush(null)
      onCommitted()
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : String(caught))
    } finally {
      setBusy(null)
    }
  }

  const saveToken = async () => {
    if (!token.trim()) return
    setBusy('token')
    setError('')
    setTokenNotice(null)
    try {
      const saved = await api.setGithubToken(token.trim())
      const status = await api.githubCredential()
      setCredentials({ configured: status.configured, writable: status.writable, source: status.source })
      if (!saved.configured || !status.configured) {
        setTokenNotice({ tone: 'error', text: t.tokenSaveFailed })
        return
      }
      setToken('')
      setShowToken(false)
      setTokenNotice({ tone: 'ok', text: t.tokenSaved })
    } catch (caught) {
      setTokenNotice({
        tone: 'error',
        text: `${t.tokenSaveFailed}: ${isApiError(caught) ? caught.message : String(caught)}`,
      })
    } finally {
      setBusy(null)
    }
  }

  const clearToken = async () => {
    setBusy('token')
    setError('')
    setTokenNotice(null)
    try {
      await api.clearGithubToken()
      const status = await api.githubCredential()
      setCredentials({ configured: status.configured, writable: status.writable, source: status.source })
      setTokenNotice({ tone: 'ok', text: lang === 'zh' ? '令牌已清除。' : 'Token cleared.' })
    } catch (caught) {
      setTokenNotice({
        tone: 'error',
        text: `${t.tokenSaveFailed}: ${isApiError(caught) ? caught.message : String(caught)}`,
      })
    } finally {
      setBusy(null)
    }
  }

  if (!inspection && busy === 'load') return h(LoadingBlock, { label: t.preparing })
  if (!inspection) {
    return h('div', { className: 'cicd-section-stack' }, [
      h('button', { key: 'back', type: 'button', className: 'cicd-header-back', onClick: onBack }, t.back),
      h('div', { key: 'error', className: 'cicd-error' }, [h('div', { key: 'm' }, error || t.loadFailed), h(Button, { key: 'r', onClick: () => void load() }, t.refresh)]),
    ])
  }

  if (result) {
    return h('div', { className: 'cicd-section-stack' }, [
      h('button', { key: 'back', type: 'button', className: 'cicd-header-back', onClick: onBack }, t.back),
      h('div', { key: 'success', className: 'cicd-git-success' }, [
        h('div', { key: 'icon', className: 'cicd-git-success-icon' }, h(Icon, { name: 'check', size: 20 })),
        h('div', { key: 'body' }, [
          h('h2', { key: 't', className: 'cicd-git-success-title' }, t.success),
          h('p', { key: 'p', className: 'cicd-git-success-body' }, t.successBody),
        ]),
      ]),
      h(SectionCard, { key: 'result', title: t.previewTitle }, h('div', null, [
        h('div', { className: 'cicd-kv' }, [h('span', { className: 'cicd-kv-label' }, t.commitSha), h('span', { className: 'cicd-kv-value cicd-mono' }, result.commitSha)]),
        h('div', { className: 'cicd-kv' }, [h('span', { className: 'cicd-kv-label' }, t.remoteSha), h('span', { className: 'cicd-kv-value cicd-mono' }, result.remoteSha)]),
        h('div', { className: 'cicd-kv' }, [h('span', { className: 'cicd-kv-label' }, t.pushedBranch), h('span', { className: 'cicd-kv-value cicd-mono' }, result.pushBranch)]),
        h('div', { className: 'cicd-kv' }, [h('span', { className: 'cicd-kv-label' }, t.verified), h('span', { className: 'cicd-kv-value' }, h(Badge, { tone: 'success' }, t.verifiedYes))]),
      ])),
      h(Button, { key: 'back2', variant: 'primary', onClick: onBack }, t.backToList),
    ])
  }

  return h('div', { className: 'cicd-section-stack' }, [
    h('div', { key: 'header', className: 'cicd-git-header' }, [
      h('button', { key: 'back', type: 'button', className: 'cicd-header-back', onClick: onBack }, t.back),
      h('div', { key: 'row', style: { display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' } }, [
        h('div', { key: 'copy' }, [
          h('div', { key: 'title-row', style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } }, [
            h('h1', { key: 'title', className: 'cicd-title', style: { fontSize: 22 } }, t.title),
            h(Badge, { key: 'state', tone: inspection.clean ? 'success' : 'warning', dot: true }, inspection.clean ? t.clean : t.dirty),
          ]),
          h('p', { key: 'sub', className: 'cicd-small cicd-muted', style: { margin: '4px 0 0' } }, t.subtitle),
        ]),
        h('div', { key: 'actions', style: { display: 'flex', gap: 8 } }, h(Button, { variant: 'ghost', icon: 'refresh', onClick: () => void load() }, t.refresh)),
      ]),
    ]),
    error
      ? h(Notice, { key: 'error', tone: 'danger', title: t.commitFailed }, [
          h('div', { key: 'm' }, error),
          ...errorDetails.map((finding) => h('div', { key: finding.path, className: 'cicd-small' }, `${finding.path}${finding.line ? `:${finding.line}` : ''} · ${finding.message}`)),
        ])
      : null,
    failedPush
      ? h(Notice, { key: 'push-failed', tone: 'warning', title: t.pushFailed, icon: 'info' }, [
          h('div', { key: 'body' }, t.pushFailedBody),
          h('div', { key: 'sha', className: 'cicd-mono cicd-small', style: { marginTop: 4 } }, failedPush.commitSha),
          h('div', { key: 'actions', style: { marginTop: 8 } }, h(Button, {
            key: 'retry',
            variant: 'primary',
            onClick: () => void retryPush(),
            disabled: busy !== null,
          }, busy === 'commit' ? t.retrying : t.retryPush)),
        ])
      : null,
    h('div', { key: 'summary', className: 'cicd-git-summary' }, [
      h('div', { key: 'repo' }, [h('span', { className: 'cicd-git-label' }, t.repo), h('span', { className: 'cicd-git-value cicd-mono', title: inspection.remoteUrl }, inspection.remoteUrl || '—')]),
      h('div', { key: 'branch' }, [h('span', { className: 'cicd-git-label' }, t.branch), h('span', { className: 'cicd-git-value cicd-mono' }, inspection.branch || '—')]),
      h('div', { key: 'head' }, [h('span', { className: 'cicd-git-label' }, t.head), h('span', { className: 'cicd-git-value cicd-mono' }, shortSha(inspection.headSha))]),
      h('div', { key: 'tracking' }, [h('span', { className: 'cicd-git-label' }, t.upstream), h('span', { className: 'cicd-git-value cicd-mono' }, inspection.upstream || '—')]),
      h('div', { key: 'distance' }, [h('span', { className: 'cicd-git-label' }, `${t.ahead} / ${t.behind}`), h('span', { className: 'cicd-git-value' }, `${inspection.ahead} / ${inspection.behind}`)]),
    ]),
    !inspection.remoteUrl
      ? h(Notice, { key: 'no-remote', tone: 'warning', title: t.noRemote, icon: 'info' }, t.noRemoteBody)
      : null,
    /^https?:/i.test(inspection.remoteUrl) && credentials && !credentials.configured
      ? h(Notice, { key: 'auth-required', tone: 'warning', title: t.authRequired, icon: 'key' }, t.authNeeded)
      : null,
    !inspection.userName || !inspection.userEmail
      ? h(Notice, { key: 'no-identity', tone: 'warning', title: t.noIdentity, icon: 'info' }, t.noIdentityBody)
      : null,
    blocked.length > 0
      ? h(Notice, { key: 'blocked', tone: 'warning', title: t.sensitiveTitle, icon: 'lock' }, [
          h('div', { key: 'body' }, t.sensitiveBody),
          ...blocked.slice(0, 6).map((finding) => h('div', { key: finding.path, className: 'cicd-small' }, `${finding.path} · ${finding.message}`)),
        ])
      : null,
    inspection.clean
      ? h(EmptyState, { key: 'empty', icon: 'check', title: t.noChanges, body: t.noChangesBody })
      : h('div', { key: 'work', className: 'cicd-git-grid' }, [
          h(SectionCard, {
            key: 'files',
            title: t.files,
            description: t.filesHint,
            extra: h('div', { key: 'actions', className: 'cicd-inline' }, [
              h('button', { key: 'all', type: 'button', className: 'cicd-linkbtn', onClick: () => toggleAll(true) }, t.selectAll),
              h('button', { key: 'none', type: 'button', className: 'cicd-linkbtn', onClick: () => toggleAll(false) }, t.clearAll),
            ]),
          }, h('div', { key: 'list', className: 'cicd-file-list' }, inspection.entries.map((entry) => h('div', {
            key: entry.path,
            className: `cicd-file-row ${activeDiff === entry.path ? 'is-active' : ''}`.trim(),
            onClick: () => setActiveDiff(entry.path),
          }, [
            h('input', {
              key: 'check',
              type: 'checkbox',
              className: 'cicd-check',
              checked: selected.has(entry.path),
              disabled: !entry.selectable,
              onClick: (event: MouseEvent) => event.stopPropagation(),
              onChange: () => toggle(entry.path, entry.selectable),
              'aria-label': entry.path,
            }),
            h('span', { key: 'code', className: 'cicd-file-code' }, statusFor(entry)),
            h('span', { key: 'path', className: 'cicd-file-path cicd-mono', title: entry.path }, entry.path),
            entry.selectable ? null : h(Badge, { key: 'lock', tone: 'danger' }, lang === 'zh' ? '阻止' : 'blocked'),
          ])))),
          h('div', { key: 'composer', className: 'cicd-git-compose' }, [
            h(SectionCard, { key: 'form', title: t.commit, description: t.commitHint }, h('div', { className: 'cicd-form-grid' }, [
              h(Field, { key: 'message', label: t.message, span: 2 }, h(TextArea, {
                value: message,
                onChange: updateMessage,
                placeholder: t.messagePlaceholder,
                rows: 4,
              })),
              h(Field, { key: 'branch', label: t.pushBranch }, h('input', {
                className: 'cicd-input cicd-mono',
                value: pushBranch,
                list: 'cicd-branch-options',
                placeholder: 'main',
                onChange: (event: Event) => updateBranch((event.target as HTMLInputElement).value),
              })),
              h('datalist', { key: 'options', id: 'cicd-branch-options' }, branches.map((branch) => h('option', { key: branch, value: branch }))),
            ])),
            selectedBlocked.length > 0
              ? h(Notice, { key: 'blocked-selected', tone: 'danger', title: t.sensitiveTitle }, t.sensitiveBody)
              : null,
            h('div', { key: 'prepare-row', className: 'cicd-git-actions' }, [
              h('span', { key: 'count', className: 'cicd-small cicd-muted' }, `${selected.size} ${t.selected}`),
              h(Button, { key: 'prepare', variant: 'primary', icon: 'arrow', disabled: !canPrepare || busy !== null, onClick: () => void prepare() }, busy === 'prepare' ? t.preparing : t.prepare),
            ]),
            plan
              ? h('div', { key: 'plan', className: 'cicd-git-plan' }, [
                  h('div', { key: 'head', className: 'cicd-git-plan-head' }, [h(Icon, { key: 'i', name: 'info', size: 15 }), h('strong', { key: 't' }, t.previewTitle)]),
                  h('p', { key: 'body', className: 'cicd-small cicd-muted' }, t.previewBody),
                  h('div', { key: 'meta', className: 'cicd-small' }, `${plan.selectedFiles.length} ${t.selected} · ${plan.pushBranch}`),
                  h('div', { key: 'actions', className: 'cicd-git-actions' }, [
                    h(Button, { key: 'cancel', variant: 'ghost', onClick: () => setPlan(null) }, t.cancelPreview),
                    h(Button, { key: 'confirm', variant: 'primary', icon: 'check', disabled: busy !== null, onClick: () => void commit() }, busy === 'commit' ? t.committing : t.confirm),
                  ]),
                ])
              : null,
          ]),
        ]),
    h(SectionCard, {
      key: 'diff',
      title: t.diff,
      description: active ? active.path : t.diffEmpty,
      extra: active?.binary ? h(Badge, { tone: 'muted' }, t.binary) : null,
    }, active && !active.binary && active.text
      ? h('pre', { className: 'cicd-diff' }, active.text)
      : h('div', { className: 'cicd-small cicd-muted' }, active?.binary ? t.binary : t.diffEmpty)),
    h('details', { key: 'auth', className: 'cicd-auth', open: credentials?.configured === false }, [
      h('summary', { key: 'summary', className: 'cicd-auth-summary' }, [
        h(Icon, { key: 'icon', name: 'key', size: 14 }),
        h('span', { key: 'label' }, t.auth),
        h('span', { key: 'state', className: 'cicd-small cicd-muted' }, credentials?.configured ? t.authConfigured : t.authNotConfigured),
      ]),
      h('div', { key: 'body', className: 'cicd-auth-body' }, [
        h('p', { key: 'hint', className: 'cicd-small cicd-muted' }, credentialsError || t.authHint),
        credentials?.configured
          ? h('div', { key: 'configured', className: 'cicd-inline' }, [
              h(Button, { key: 'replace', variant: 'ghost', onClick: () => setShowToken((value) => !value) }, t.replaceToken),
              h(Button, { key: 'clear', variant: 'ghost', onClick: () => void clearToken(), disabled: busy === 'token' }, t.clearToken),
            ])
          : null,
        showToken || !credentials?.configured
          ? h('div', { key: 'input-row', className: 'cicd-auth-input' }, [
              h('input', {
                key: 'token',
                className: 'cicd-input cicd-mono',
                type: 'password',
                value: token,
                placeholder: t.tokenPlaceholder,
                autoComplete: 'off',
                onChange: (event: Event) => { setToken((event.target as HTMLInputElement).value); setTokenNotice(null) },
              }),
              h(Button, { key: 'save', variant: 'primary', onClick: () => void saveToken(), disabled: !token.trim() || busy === 'token' }, busy === 'token' ? t.savingToken : t.saveToken),
            ])
          : null,
        tokenNotice
          ? h('div', {
              key: 'token-notice',
              className: 'cicd-small',
              style: { marginTop: 6, color: tokenNotice.tone === 'ok' ? '#166534' : '#b91c1c' },
            }, tokenNotice.text)
          : null,
      ]),
    ]),
  ])
}
