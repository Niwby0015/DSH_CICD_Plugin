import type { DeployConfig } from '../domain/types.js'

export interface ManifestInput {
  namespace: string
  deployment: string
  image: string
  deploy: DeployConfig
  environment: string
}

function label(value: string, fallback: string): string {
  return value || fallback
}

export function renderManifests(input: ManifestInput): string {
  const { namespace, deployment, image, deploy } = input
  const selector = {
    'app.kubernetes.io/name': deployment,
    'app.kubernetes.io/managed-by': 'dsh-cicd',
  }
  const environment = label(input.environment, 'default')
  const labels: Record<string, string> = { ...selector, 'dsh-cicd/environment': environment }
  const podLabels = JSON.stringify(labels)
  const pullSecrets = deploy.imagePullSecret
    ? `\n      imagePullSecrets:\n        - name: ${JSON.stringify(deploy.imagePullSecret)}`
    : ''
  const ingressClass = deploy.ingressClass
    ? `\n  ingressClassName: ${JSON.stringify(deploy.ingressClass)}`
    : ''
  const ingress = deploy.ingressHost
    ? `---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${deployment}
  namespace: ${namespace}
  labels: ${JSON.stringify(selector)}
spec:${ingressClass}
  rules:
    - host: ${JSON.stringify(deploy.ingressHost)}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ${deployment}
                port:
                  number: ${deploy.servicePort}
`
    : ''

  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${deployment}
  namespace: ${namespace}
  labels: ${JSON.stringify(labels)}
spec:
  replicas: ${deploy.replicas}
  selector:
    matchLabels: ${JSON.stringify(selector)}
  template:
    metadata:
      labels: ${podLabels}
    spec:${pullSecrets}
      containers:
        - name: app
          image: ${JSON.stringify(image)}
          imagePullPolicy: IfNotPresent
          ports:
            - name: http
              containerPort: ${deploy.containerPort}
          readinessProbe:
            httpGet:
              path: ${JSON.stringify(deploy.healthPath)}
              port: http
            initialDelaySeconds: 3
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: ${JSON.stringify(deploy.healthPath)}
              port: http
            initialDelaySeconds: 15
            periodSeconds: 20
---
apiVersion: v1
kind: Service
metadata:
  name: ${deployment}
  namespace: ${namespace}
  labels: ${JSON.stringify(selector)}
spec:
  type: ${deploy.serviceType}
  selector: ${JSON.stringify(selector)}
  ports:
    - name: http
      port: ${deploy.servicePort}
      targetPort: http
${ingress}`
}
