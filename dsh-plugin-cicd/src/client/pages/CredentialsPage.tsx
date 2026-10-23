import { api, isApiError } from '../api.js'
import { h, useEffect, useState } from '../react.js'
import { Icon } from '../icons.js'
import { copyFor, type Lang } from '../i18n.js'
import { Badge, Button, TextInput } from '../components/common.js'

const TEXT = {
  zh: {
    githubHint: '令牌只保存在 DSH 凭据中；不会进入 URL、日志或流水线配置。',
    configured: '已配置',
    notConfigured: '未配置',
    save: '保存令牌',
    saving: '保存中…',
    saved: '令牌已保存，可以回到 Git 页面重试推送。',
    clear: '清除',
    tokenRequired: '请先粘贴 GitHub Token',
    unavailable: 'DSH 凭据服务不可用，无法保存令牌。',
    failed: '保存失败',
    githubDetail: '令牌只保存在 DSH 凭据中，不进入仓库 URL 或日志。',
    registryUser: '镜像仓库用户名',
    registryPass: '镜像仓库密码',
    registrySave: '保存仓库凭证',
    registrySaved: '仓库凭证已保存。',
    registryRequired: '请填写镜像仓库用户名和密码',
    registryDetail: '用于镜像推送，只保存在 DSH 凭据中。',
  },
  en: {
    githubHint: 'The token stays in DSH credentials; it never enters the URL, logs or pipeline config.',
    configured: 'Configured',
    notConfigured: 'Not configured',
    save: 'Save token',
    saving: 'Saving…',
    saved: 'Token saved. Return to the Git page and retry the push.',
    clear: 'Clear',
    tokenRequired: 'Paste a GitHub token first',
    unavailable: 'The DSH credentials service is unavailable; the token cannot be saved.',
    failed: 'Save failed',
    githubDetail: 'The token stays in DSH credentials and never enters the repository URL or logs.',
    registryUser: 'Registry username',
    registryPass: 'Registry password',
    registrySave: 'Save registry credentials',
    registrySaved: 'Registry credentials saved.',
    registryRequired: 'Enter both registry username and password',
    registryDetail: 'Used for image push; stored only in DSH credentials.',
  },
} as const

export function CredentialsPage({ lang }: { lang: Lang }) {
  const t = copyFor(lang)
  const copy = TEXT[lang]
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [writable, setWritable] = useState(true)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [registryConfigured, setRegistryConfigured] = useState(false)
  const [registryWritable, setRegistryWritable] = useState(true)
  const [registryUser, setRegistryUser] = useState('')
  const [registryPass, setRegistryPass] = useState('')
  const [registryBusy, setRegistryBusy] = useState(false)
  const [registryMessage, setRegistryMessage] = useState('')
  const [registryError, setRegistryError] = useState('')

  const refresh = async () => {
    try {
      const [status, registry] = await Promise.all([api.githubCredential(), api.registryCredential()])
      setConfigured(status.configured)
      setWritable(status.writable)
      setRegistryConfigured(registry.configured)
      setRegistryWritable(registry.writable)
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : String(caught))
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const save = async () => {
    if (!token.trim()) {
      setError(copy.tokenRequired)
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await api.setGithubToken(token.trim())
      if (!result.configured) throw new Error(copy.failed)
      const status = await api.githubCredential()
      setConfigured(status.configured)
      setWritable(status.writable)
      if (!status.configured) throw new Error(copy.failed)
      setToken('')
      setMessage(copy.saved)
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await api.clearGithubToken()
      const status = await api.githubCredential()
      setConfigured(status.configured)
      setWritable(status.writable)
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const saveRegistry = async () => {
    if (!registryUser.trim() || !registryPass) {
      setRegistryError(copy.registryRequired)
      return
    }
    setRegistryBusy(true)
    setRegistryError('')
    setRegistryMessage('')
    try {
      const saved = await api.setRegistryCredentials(registryUser.trim(), registryPass)
      if (!saved.configured) throw new Error(copy.failed)
      const status = await api.registryCredential()
      setRegistryConfigured(status.configured)
      setRegistryWritable(status.writable)
      setRegistryPass('')
      setRegistryMessage(copy.registrySaved)
    } catch (caught) {
      setRegistryError(isApiError(caught) ? caught.message : String(caught))
    } finally {
      setRegistryBusy(false)
    }
  }

  const clearRegistry = async () => {
    setRegistryBusy(true)
    setRegistryError('')
    setRegistryMessage('')
    try {
      await api.clearRegistryCredentials()
      const status = await api.registryCredential()
      setRegistryConfigured(status.configured)
      setRegistryWritable(status.writable)
    } catch (caught) {
      setRegistryError(isApiError(caught) ? caught.message : String(caught))
    } finally {
      setRegistryBusy(false)
    }
  }

  const githubCard = h('div', { key: 'github', className: 'cicd-placeholder-card' }, [
    h('div', { key: 'head', className: 'cicd-placeholder-head' }, [
      h('span', { key: 'icon', className: 'cicd-placeholder-icon' }, h(Icon, { name: 'github', size: 15 })),
      h('span', { key: 'title', className: 'cicd-placeholder-title' }, t.cred.github),
      h('span', { key: 'space', className: 'cicd-spacer' }),
      h(Badge, { key: 'badge', tone: configured ? 'success' : 'muted' }, configured ? copy.configured : copy.notConfigured),
    ]),
    h('p', { key: 'body', className: 'cicd-placeholder-body' }, t.cred.githubBody),
    h('div', { key: 'detail', className: 'cicd-small cicd-muted', style: { display: 'flex', alignItems: 'center', gap: 6 } }, [
      h(Icon, { key: 'i', name: 'lock', size: 12 }),
      h('span', { key: 't' }, copy.githubDetail),
    ]),
    h('div', { key: 'form', style: { marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 } }, [
      h('div', { key: 'row', className: 'cicd-auth-input' }, [
        h(TextInput, {
          key: 'token',
          value: token,
          onChange: (value: string) => { setToken(value); setError(''); setMessage('') },
          placeholder: 'ghp_… / github_pat_…',
          monospace: true,
          type: 'password',
        }),
        h(Button, {
          key: 'save',
          variant: 'primary',
          onClick: () => void save(),
          disabled: busy || !writable || !token.trim(),
        }, busy ? copy.saving : copy.save),
      ]),
      configured
        ? h(Button, { key: 'clear', variant: 'ghost', onClick: () => void clear(), disabled: busy }, copy.clear)
        : null,
      h('div', { key: 'hint', className: 'cicd-small cicd-muted' }, copy.githubHint),
      message ? h('div', { key: 'ok', className: 'cicd-small', style: { color: '#166534' } }, message) : null,
      error ? h('div', { key: 'err', className: 'cicd-small', style: { color: '#b91c1c' } }, `${copy.failed}: ${error}`) : null,
    ]),
  ])

  const registryCard = h('div', { key: 'registry', className: 'cicd-placeholder-card' }, [
    h('div', { key: 'head', className: 'cicd-placeholder-head' }, [
      h('span', { key: 'icon', className: 'cicd-placeholder-icon' }, h(Icon, { name: 'image', size: 15 })),
      h('span', { key: 'title', className: 'cicd-placeholder-title' }, t.cred.registry),
      h('span', { key: 'space', className: 'cicd-spacer' }),
      h(Badge, { key: 'badge', tone: registryConfigured ? 'success' : 'muted' }, registryConfigured ? copy.configured : copy.notConfigured),
    ]),
    h('p', { key: 'body', className: 'cicd-placeholder-body' }, t.cred.registryBody),
    h('div', { key: 'detail', className: 'cicd-small cicd-muted', style: { display: 'flex', alignItems: 'center', gap: 6 } }, [
      h(Icon, { key: 'i', name: 'lock', size: 12 }),
      h('span', { key: 't' }, copy.registryDetail),
    ]),
    h('div', { key: 'form', style: { marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 } }, [
      h(TextInput, {
        key: 'user',
        value: registryUser,
        onChange: (value: string) => { setRegistryUser(value); setRegistryError(''); setRegistryMessage('') },
        placeholder: copy.registryUser,
        monospace: true,
      }),
      h('div', { key: 'row', className: 'cicd-auth-input' }, [
        h(TextInput, {
          key: 'pass',
          value: registryPass,
          onChange: (value: string) => { setRegistryPass(value); setRegistryError(''); setRegistryMessage('') },
          placeholder: copy.registryPass,
          monospace: true,
          type: 'password',
        }),
        h(Button, {
          key: 'save',
          variant: 'primary',
          onClick: () => void saveRegistry(),
          disabled: registryBusy || !registryWritable || !registryUser.trim() || !registryPass,
        }, registryBusy ? copy.saving : copy.registrySave),
      ]),
      registryConfigured
        ? h(Button, { key: 'clear', variant: 'ghost', onClick: () => void clearRegistry(), disabled: registryBusy }, copy.clear)
        : null,
      registryMessage ? h('div', { key: 'ok', className: 'cicd-small', style: { color: '#166534' } }, registryMessage) : null,
      registryError ? h('div', { key: 'err', className: 'cicd-small', style: { color: '#b91c1c' } }, `${copy.failed}: ${registryError}`) : null,
    ]),
  ])

  return h('div', { className: 'cicd-section-stack' }, [
    h('div', { key: 'grid', className: 'cicd-placeholder-grid' }, [
      githubCard,
      registryCard,
    ]),
  ])
}
