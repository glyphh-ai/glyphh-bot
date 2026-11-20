import { contextBridge, ipcRenderer } from 'electron'
import type { AgentEvent, GlyphhBotApi } from '../shared/types'

const call =
  (channel: string) =>
  (...args: unknown[]): Promise<never> =>
    ipcRenderer.invoke(channel, ...args) as Promise<never>

function on<T>(channel: string, cb: (v: T) => void): () => void {
  const fn = (_e: unknown, v: T): void => cb(v)
  ipcRenderer.on(channel, fn)
  return () => ipcRenderer.removeListener(channel, fn)
}

const api: GlyphhBotApi = {
  auth: {
    status: call('auth:status'),
    login: call('auth:login'),
    loginInput: call('auth:loginInput'),
    logout: call('auth:logout'),
    onLog: (cb) => on<string>('auth:log', cb)
  },
  claude: { probe: call('claude:probe'), icon: call('claude:icon') },
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
    reveal: call('ws:reveal'),
    list: call('ws:list'),
    search: call('ws:search'),
    mkdir: call('ws:mkdir'),
    rename: call('ws:rename'),
    trash: call('ws:trash'),
    exists: call('ws:exists'),
    diff: call('ws:diff'),
    pickFile: call('ws:pickFile'),
    attach: call('ws:attach'),
    stat: call('ws:stat')
  },
  recents: {
    list: call('recents:list'),
    save: call('recents:save'),
    pin: call('recents:pin'),
    archive: call('recents:archive'),
    remove: call('recents:remove')
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
  layouts: {
    list: call('layouts:list'),
    save: call('layouts:save'),
    remove: call('layouts:remove'),
    current: call('layouts:current'),
    setCurrent: call('layouts:setCurrent')
  },
  apps: {
    list: call('apps:list'),
    save: call('apps:save'),
    remove: call('apps:remove')
  },
  term: {
    spawn: call('term:spawn'),
    write: (id, data) => ipcRenderer.send('term:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('term:resize', id, cols, rows),
    kill: (id) => ipcRenderer.send('term:kill', id),
    onData: (id, cb) => on<string>(`term:data:${id}`, cb),
    onExit: (id, cb) => on<number>(`term:exit:${id}`, cb)
  },
  onBrowserOpen: (cb) => on<string>('browser:open', cb),
  openExternal: call('openExternal'),
  shot: new URLSearchParams(location.search).has('shot')
}

contextBridge.exposeInMainWorld('glyphhBot', api)
