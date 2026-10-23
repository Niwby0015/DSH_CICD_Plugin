// Loads the built browser artifact with the same module-loader contract the DSH
// Web page uses. This is a registration smoke test, not a visual test.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const code = readFileSync(resolve('dist/client.js'), 'utf8')
const registrations = []
let loaded
const fakeReact = {
  createElement: (...args) => ({ args }),
  Fragment: 'fragment',
  useCallback: (fn) => fn,
  useEffect: () => {},
  useMemo: (fn) => fn(),
  useRef: (value) => ({ current: value }),
  useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
}
globalThis.window = {
  __ModuleLoader__: {
    load(entry) {
      loaded = entry
    },
  },
}
globalThis.document = undefined
new Function('window', code)(globalThis.window)
if (!loaded) throw new Error('client did not call __ModuleLoader__.load')
if (loaded.id !== 'dsh-plugin-cicd') throw new Error(`unexpected module id: ${loaded.id}`)
const factory = loaded.factory
const exports = factory((id) => {
  if (id !== 'react') throw new Error(`unexpected require: ${id}`)
  return fakeReact
})
if (typeof exports.apply !== 'function') throw new Error('client did not export apply')
if (!Array.isArray(exports.inject) || !exports.inject.includes('slots')) throw new Error('client inject is wrong')
const ctx = {
  slots: {
    inject(_owner, callback) {
      callback()
    },
    register(options, component) {
      registrations.push({ options, component })
      return () => {}
    },
  },
  locale: { getSnapshot: () => ({ active: 'zh' }) },
}
exports.apply(ctx)
if (registrations.length !== 2) throw new Error(`expected 2 slot registrations, got ${registrations.length}`)
const sidebar = registrations.find((entry) => entry.options.name === 'sidebar.panellist')
const main = registrations.find((entry) => entry.options.name === 'main')
if (!sidebar || sidebar.options.id !== 'dsh-cicd') throw new Error('sidebar entry missing')
if (!main || main.options.key !== 'dsh-cicd') throw new Error('main page missing')
if (typeof sidebar.options.label !== 'function' || !String(sidebar.options.label()).length) {
  throw new Error('sidebar label is empty')
}
console.log('PASS client bundle loaded; slots:', registrations.map((entry) => entry.options.name).join(', '))
