/**
 * The DSH browser module table supplies React through `require('react')`.
 * The build keeps it external and bundles this thin adapter so TSX can use the
 * classic `h` factory, exactly like the shipped plugin examples.
 */
declare const require: (id: string) => unknown

type ReactModule = typeof import('react')

const runtime = require('react') as ReactModule

export const React = runtime
export function h(type: unknown, props?: unknown, ...children: unknown[]): unknown {
  return (runtime.createElement as (...args: unknown[]) => unknown)(type, props, ...children)
}
export const Fragment = runtime.Fragment
export const useCallback = runtime.useCallback
export const useEffect = runtime.useEffect
export const useMemo = runtime.useMemo
export const useRef = runtime.useRef
export const useState = runtime.useState
