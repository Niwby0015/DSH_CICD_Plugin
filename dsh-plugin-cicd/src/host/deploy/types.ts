export interface KubernetesDeployInput {
  namespace: string
  deployment: string
  image: string
  manifest: string
  servicePort: number
  healthPath: string
  timeoutSeconds: number
  localPort: number
}

export interface KubernetesDeployResult {
  namespace: string
  deployment: string
  image: string
  readyReplicas: number
  desiredReplicas: number
  httpStatus: number
  logs: string[]
}
