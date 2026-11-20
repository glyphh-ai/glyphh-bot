import { contextBridge, ipcRenderer } from 'electron'
import type { AgentEvent, OliverApi } from '../shared/types'

const call =
  (channel: string) =>
  (...args: unknown[]): Promise<never> =>
    ipcRenderer.invoke(channel, ...args) as Promise<never>

function on<T>(channel: string, cb: (v: T) => void): () => void {
  const fn = (_e: unknown, v: T): void => cb(v)
  ipcRenderer.on(channel, fn)
  return () => ipcRenderer.removeListener(channel, fn)
}

const api: OliverApi = {
  auth: {
    status: call('auth:status'),
    login: call('auth:login'),
    loginInput: call('auth:loginInput'),
    logout: call('auth:logout'),
    onLog: (cb) => on<string>('auth:log', cb)
  },
  claude: { probe: call('claude:probe') },
  agent: {
    run: call('agent:run'),
    stop: call('agent:stop'),
    permission: call('agent:permission'),
    onEvent: (cb) => on<AgentEvent>('agent:event', cb)
  },
  bots: {
    list: call('bots:list'),
    save: call('bots:save'),
    remove: call('bots:remove'),
    generate: call('bots:generate')
  },
  settings: {
    get: call('settings:get'),
    set: call('settings:set'),
    setElevenKey: call('settings:setElevenKey')
  },
  voice: {
    tts: call('voice:tts'),
    stt: call('voice:stt'),
    voices: call('voice:voices')
  },
  ws: {
    current: call('ws:current'),
    create: call('ws:create'),
    open: call('ws:open'),
    tree: call('ws:tree'),
    read: call('ws:read'),
    write: call('ws:write'),
    reveal: call('ws:reveal')
  },
  git: {
    beginTurn: call('git:beginTurn'),
    endTurn: call('git:endTurn'),
    merge: call('git:merge'),
    reject: call('git:reject'),
    prs: call('git:prs'),
    diff: call('git:diff'),
    branch: call('git:branch')
  },
  openExternal: call('openExternal')
}

contextBridge.exposeInMainWorld('oliver', api)
