import type { Capabilities } from '../../host/domain/types.js'
import type { SshAuthKind, SshRunnerConfig } from '../../host/runner/types.js'
import { api, isApiError } from '../api.js'
import { h, useEffect, useState } from '../react.js'
import { Icon } from '../icons.js'
import { copyFor, type Lang } from '../i18n.js'
import { Badge, Button, Field, Notice, Select, TextInput } from '../components/common.js'

const TEXT = {
  zh: {
    preflight: '构建与部署共用一台 SSH 远程服务器',
    preflightBody: '这里保存非敏感主机配置；密码保存在 DSH 凭据中。checkout、编译、测试、镜像构建和 kubectl 部署都在这一台机器上执行。',
    host: '主机',
    port: '端口',
    user: '用户',
    auth: '认证方式',
    agent: 'ssh-agent',
    key: '私钥文件',
    password: '用户名 + 密码',
    passwordLabel: 'SSH 密码',
    passwordHint: '密码只保存在 DSH 凭据中，不进入 argv/日志。',
    passwordSaved: '密码已保存',
    passwordNotSaved: '密码未保存',
    savePassword: '保存密码',
    savingPassword: '保存中…',
    keyPath: '私钥路径',
    knownHosts: 'known_hosts 路径',
    fingerprint: '期望指纹（可选）',
    workspace: '远端工作目录',
    test: '测试连接 / 工具链',
    testing: '检查中…',
    ok: '预检通过',
    failed: '预检未通过',
    error: '预检失败',
    notConfigured: '未配置',
  },
  en: {
    preflight: 'One SSH server for both build and deploy',
    preflightBody: 'Non-secret host configuration lives here; the password stays in DSH credentials. Checkout, build, test, image build and kubectl deploy all run on this host.',
    host: 'Host',
    port: 'Port',
    user: 'User',
    auth: 'Authentication',
    agent: 'ssh-agent',
    key: 'Private key',
    password: 'Username + password',
    passwordLabel: 'SSH password',
    passwordHint: 'The password stays in DSH credentials; it never enters argv or logs.',
    passwordSaved: 'Password saved',
    passwordNotSaved: 'Password not saved',
    savePassword: 'Save password',
    savingPassword: 'Saving…',
    keyPath: 'Key path',
    knownHosts: 'known_hosts path',
    fingerprint: 'Expected fingerprint (optional)',
    workspace: 'Remote workspace',
    test: 'Test connection / toolchains',
    testing: 'Checking…',
    ok: 'Preflight passed',
    failed: 'Preflight failed',
    error: 'Preflight failed',
    notConfigured: 'Not configured',
  },
} as const

export function EnvironmentsPage({ lang, capabilities, onProfileSaved }: { lang: Lang; capabilities: Capabilities; onProfileSaved?: () => void }) {
  const t = copyFor(lang)
  const copy = TEXT[lang]
  const [host, setHost] = useState('')
  const [port, setPort] = useState('22')
  const [user, setUser] = useState('')
  const [auth, setAuth] = useState<SshAuthKind>('agent')
  const [keyPath, setKeyPath] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfigured, setPasswordConfigured] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [knownHostsPath, setKnownHostsPath] = useState('')
  const [fingerprint, setFingerprint] = useState('')
  const [workspaceRoot, setWorkspaceRoot] = useState('/tmp/dsh-cicd')
  const [testing, setTesting] = useState(false)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; checks: Array<{ name: string; ok: boolean; detail: string; optional?: boolean }> } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.sshCredential()
      .then((status) => setPasswordConfigured(status.configured))
      .catch(() => setPasswordConfigured(false))
    api.runnerProfile()
      .then(({ profile }) => {
        if (!profile) return
        setHost(profile.host)
        setPort(String(profile.port))
        setUser(profile.user)
        setAuth(profile.auth)
        setKeyPath(profile.keyPath ?? '')
        setKnownHostsPath(profile.knownHostsPath ?? '')
        setFingerprint(profile.expectedFingerprint ?? '')
        setWorkspaceRoot(profile.workspaceRoot || '/tmp/dsh-cicd')
        setProfileLoaded(true)
      })
      .catch(() => setProfileLoaded(false))
  }, [])

  const savePassword = async (): Promise<boolean> => {
    if (!password.trim()) {
      setError(lang === 'zh' ? '请先填写 SSH 密码' : 'Enter the SSH password first')
      return false
    }
    setSavingPassword(true)
    setError('')
    try {
      const saved = await api.setSshPassword(password)
      setPasswordConfigured(saved.configured)
      setPassword('')
      return saved.configured
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : String(caught))
      return false
    } finally {
      setSavingPassword(false)
    }
  }

  const runPreflight = async () => {
    if (!host.trim() || !user.trim() || !knownHostsPath.trim()) {
      setError(lang === 'zh' ? '主机、用户和 known_hosts 路径必填' : 'Host, user and known_hosts path are required')
      return
    }
    if (auth === 'key' && !keyPath.trim()) {
      setError(lang === 'zh' ? '私钥路径必填' : 'Key path is required')
      return
    }
    if (auth === 'password') {
      if (password.trim() && !(await savePassword())) return
      if (!password.trim() && !passwordConfigured) {
        setError(lang === 'zh' ? '请先保存 SSH 密码' : 'Save the SSH password first')
        return
      }
    }
    setTesting(true)
    setError('')
    setResult(null)
    const config: SshRunnerConfig = {
      kind: 'ssh',
      host: host.trim(),
      port: Number(port) || 22,
      user: user.trim(),
      auth,
      ...(auth === 'password' ? { passwordRef: 'DSH_CICD_SSH_PASSWORD' } : {}),
      ...(keyPath.trim() ? { keyPath: keyPath.trim() } : {}),
      ...(fingerprint.trim() ? { expectedFingerprint: fingerprint.trim() } : {}),
      knownHostsPath: knownHostsPath.trim(),
      workspaceRoot: workspaceRoot.trim() || '/tmp/dsh-cicd',
    }
    try {
      await api.saveRunnerProfile(config)
      setProfileLoaded(true)
      onProfileSaved?.()
      const preflight = await api.runnerPreflight(config)
      setResult({ ok: preflight.ok, checks: preflight.checks })
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : String(caught))
    } finally {
      setTesting(false)
    }
  }

  return h('div', { className: 'cicd-section-stack' }, [
    h(Notice, {
      key: 'planned',
      tone: 'info',
      title: copy.preflight,
      icon: 'server',
    }, copy.preflightBody),
    h('div', { key: 'grid', className: 'cicd-placeholder-grid' }, [
      h('div', { key: 'build', className: 'cicd-placeholder-card' }, [
        h('div', { key: 'head', className: 'cicd-placeholder-head' }, [
          h('span', { key: 'icon', className: 'cicd-placeholder-icon' }, h(Icon, { name: 'build', size: 15 })),
          h('span', { key: 'title', className: 'cicd-placeholder-title' }, t.env.build),
          h('span', { key: 'space', className: 'cicd-spacer' }),
          h(Badge, { key: 'badge', tone: profileLoaded ? 'success' : 'muted' }, profileLoaded ? copy.ok : copy.notConfigured),
        ]),
        h('details', { key: 'fold', className: 'cicd-env-fold', open: !profileLoaded }, [
          h('summary', { key: 'summary', className: 'cicd-env-summary' }, [
            h(Icon, { key: 'icon', name: 'server', size: 14 }),
            h('span', { key: 'name', className: 'cicd-env-name' }, host.trim() || (lang === 'zh' ? 'SSH 构建机' : 'SSH build host')),
            h('span', { key: 'target', className: 'cicd-small cicd-muted cicd-mono' }, host.trim() ? `${user.trim() || '?'}@${host.trim()}` : (lang === 'zh' ? '未填写连接信息' : 'No connection details')),
            h('span', { key: 'space', className: 'cicd-spacer' }),
            h(Badge, { key: 'badge', tone: profileLoaded ? 'success' : 'muted' }, profileLoaded ? (lang === 'zh' ? '已保存' : 'Saved') : copy.notConfigured),
          ]),
          h('div', { key: 'fold-body', className: 'cicd-env-body' }, [
        h('p', { key: 'body', className: 'cicd-placeholder-body' }, t.env.buildBody),
        h('ul', { key: 'list', className: 'cicd-list' }, [
          h('li', { key: 'a' }, lang === 'zh' ? '主机、端口、用户和认证方式' : 'Host, port, user and authentication'),
          h('li', { key: 'b' }, lang === 'zh' ? 'Git / 容器引擎 / Buildx 能力检查' : 'Git, container engine and Buildx checks'),
          h('li', { key: 'c' }, lang === 'zh' ? '严格主机密钥指纹校验' : 'Strict host-key fingerprint verification'),
        ]),
        h('div', { key: 'form', className: 'cicd-form-grid', style: { marginTop: 12 } }, [
          h(Field, { key: 'host', label: copy.host }, h(TextInput, { value: host, onChange: setHost, placeholder: 'build.example.com', monospace: true })),
          h(Field, { key: 'port', label: copy.port }, h(TextInput, { value: port, onChange: setPort, placeholder: '22', monospace: true })),
          h(Field, { key: 'user', label: copy.user }, h(TextInput, { value: user, onChange: setUser, placeholder: 'deploy', monospace: true })),
          h(Field, { key: 'auth', label: copy.auth }, h(Select, {
            value: auth,
            onChange: (value: string) => setAuth(value as SshAuthKind),
            options: [
              { value: 'agent', label: copy.agent },
              { value: 'key', label: copy.key },
              { value: 'password', label: copy.password },
            ],
          })),
          auth === 'key' ? h(Field, { key: 'key', label: copy.keyPath, span: 2 }, h(TextInput, { value: keyPath, onChange: setKeyPath, placeholder: 'C:\\Users\\me\\.ssh\\id_ed25519', monospace: true })) : null,
          auth === 'password' ? h(Field, {
            key: 'password',
            label: copy.passwordLabel,
            hint: copy.passwordHint,
            span: 2,
          }, h('div', { className: 'cicd-auth-input' }, [
            h(TextInput, {
              key: 'value',
              value: password,
              onChange: (value: string) => { setPassword(value); setError('') },
              placeholder: '••••••••',
              type: 'password',
            }),
            h(Button, {
              key: 'save',
              variant: 'secondary',
              onClick: () => void savePassword(),
              disabled: savingPassword || !password.trim(),
            }, savingPassword ? copy.savingPassword : copy.savePassword),
            h('span', { key: 'state', className: 'cicd-small cicd-muted' }, passwordConfigured ? copy.passwordSaved : copy.passwordNotSaved),
          ])) : null,
          h(Field, { key: 'known', label: copy.knownHosts, span: 2 }, h(TextInput, { value: knownHostsPath, onChange: setKnownHostsPath, placeholder: 'C:\\Users\\me\\.ssh\\known_hosts', monospace: true })),
          h(Field, { key: 'fingerprint', label: copy.fingerprint, span: 2 }, h(TextInput, { value: fingerprint, onChange: setFingerprint, placeholder: 'SHA256:...', monospace: true })),
          h(Field, { key: 'workspace', label: copy.workspace, span: 2 }, h(TextInput, { value: workspaceRoot, onChange: setWorkspaceRoot, placeholder: '/tmp/dsh-cicd', monospace: true })),
        ]),
        h('div', { key: 'actions', className: 'cicd-inline', style: { marginTop: 12, justifyContent: 'flex-end' } }, [
          h(Button, { key: 'test', variant: 'primary', icon: 'server', onClick: () => void runPreflight(), disabled: testing }, testing ? copy.testing : copy.test),
        ]),
        error ? h('div', { key: 'error', className: 'cicd-small', style: { color: '#b91c1c', marginTop: 8 } }, `${copy.error}: ${error}`) : null,
        result
          ? h('div', { key: 'result', className: 'cicd-section-stack', style: { marginTop: 10 } }, [
              h(Notice, { key: 'summary', tone: result.ok ? 'info' : 'warning', title: result.ok ? copy.ok : copy.failed, icon: 'info' }, ''),
              h('div', { key: 'checks', className: 'cicd-risk-list' }, result.checks.map((check) => h('div', { key: check.name, className: 'cicd-risk' }, [
                h('div', { key: 'name', className: 'cicd-risk-title' }, `${check.ok ? '✓' : check.optional ? '!' : '✕'} ${check.name}${check.optional ? (lang === 'zh' ? '（可选）' : ' (optional)') : ''}`),
                h('div', { key: 'detail', className: 'cicd-risk-body cicd-mono' }, check.detail),
              ]))),
            ])
          : null,
          ]),
        ]),
      ]),
    ]),
  ])
}
