import { describe, expect, it } from 'vitest'
import { kubernetesDeployInvocation } from '../../src/host/runner/ssh/remote-scripts.js'
import { decodeArgForTest } from '../../src/host/runner/ssh/remote-scripts.js'
import { renderManifests } from '../../src/host/deploy/manifests.js'
import { EMPTY_DEPLOY_CONFIG } from '../../src/host/domain/types.js'

describe('kubernetes deploy invocation', () => {
  it('passes namespace, manifest, service port, health path and timeout as base64 args', () => {
    const invocation = kubernetesDeployInvocation({
      namespace: 'dsh-demo',
      deployment: 'sample',
      manifest: 'apiVersion: v1\nkind: Service\n',
      servicePort: 80,
      healthPath: '/health',
      timeoutSeconds: 180,
      localPort: 18080,
    })
    expect(invocation.args).toHaveLength(7)
    expect(decodeArgForTest(invocation.args[0]!)).toBe('dsh-demo')
    expect(decodeArgForTest(invocation.args[1]!)).toBe('sample')
    expect(decodeArgForTest(invocation.args[2]!)).toContain('kind: Service')
    expect(decodeArgForTest(invocation.args[4]!)).toBe('/health')
    expect(invocation.script).toContain('kubectl apply')
    expect(invocation.script).toContain('health check failed')
  })

  it('renders Deployment, Service, Ingress, probes and imagePullSecret', () => {
    const manifests = renderManifests({
      namespace: 'dsh-demo',
      deployment: 'sample',
      image: 'registry.example.com/team/app:sha-1234567',
      deploy: {
        ...EMPTY_DEPLOY_CONFIG,
        containerPort: 5006,
        servicePort: 80,
        healthPath: '/health',
        ingressHost: 'sample.example.com',
        ingressClass: 'nginx',
        imagePullSecret: 'registry-cred',
      },
      environment: 'staging',
    })
    expect(manifests).toContain('kind: Deployment')
    expect(manifests).toContain('kind: Service')
    expect(manifests).toContain('kind: Ingress')
    expect(manifests).toContain('containerPort: 5006')
    expect(manifests).toContain('path: "/health"')
    expect(manifests).toContain('name: "registry-cred"')
    expect(manifests).toContain('ingressClassName: "nginx"')
  })
})
