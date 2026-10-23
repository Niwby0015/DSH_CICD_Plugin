import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface GitAuthEnvironment {
  env: Record<string, string>
  cleanup(): Promise<void>
}

export type GithubTokenProvider = () => Promise<string | undefined>

export function isHttpRemote(remoteUrl: string): boolean {
  return /^https?:\/\//i.test(remoteUrl)
}

/**
 * Git authentication is handed to Git through a one-use askpass helper. The
 * token lives in the child environment, never in argv, a URL, or a log line.
 */
export class GitAuth {
  constructor(private readonly token: GithubTokenProvider) {}

  async prepare(remoteUrl: string): Promise<GitAuthEnvironment> {
    const base: Record<string, string> = {
      GIT_TERMINAL_PROMPT: '0',
      GIT_TRACE: '0',
      GIT_TRACE_CURL: '0',
      GIT_TRACE_CURL_NO_DATA: '1',
      GIT_HTTP_TRACE: '0',
      GIT_CURL_VERBOSE: '0',
    }
    if (!isHttpRemote(remoteUrl)) {
      return { env: base, cleanup: async () => {} }
    }
    const token = await this.token()
    if (!token) {
      return { env: base, cleanup: async () => {} }
    }
    const dir = await mkdtemp(join(tmpdir(), 'dsh-cicd-auth-'))
    const script = join(dir, process.platform === 'win32' ? 'askpass.cmd' : 'askpass.sh')
    if (process.platform === 'win32') {
      await writeFile(
        script,
        '@echo off\r\nsetlocal\r\necho %~1 | findstr /I "username" >nul\r\nif %errorlevel%==0 (\r\n  echo %CICD_GIT_USERNAME%\r\n) else (\r\n  echo %CICD_GIT_TOKEN%\r\n)\r\n',
        { mode: 0o700 },
      )
    } else {
      await writeFile(
        script,
        '#!/bin/sh\ncase "$1" in\n  *[Uu]sername*) printf \'%s\\n\' "$CICD_GIT_USERNAME" ;;\n  *) printf \'%s\\n\' "$CICD_GIT_TOKEN" ;;\nesac\n',
        { mode: 0o700 },
      )
      await chmod(script, 0o700)
    }
    return {
      env: {
        ...base,
        GIT_ASKPASS: script,
        CICD_GIT_USERNAME: 'x-access-token',
        CICD_GIT_TOKEN: token,
      },
      cleanup: async () => {
        await rm(dir, { recursive: true, force: true }).catch(() => {})
      },
    }
  }
}
