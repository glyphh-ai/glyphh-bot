import { create } from 'zustand'
import type {
  AuthStatus,
  Bot,
  OliverApi,
  PR,
  PermissionDecision,
  Probe,
  SettingsView,
  TreeNode,
  Voice,
  Workspace
} from '../../shared/types'

declare global {
  interface Window {
    oliver: OliverApi
  }
}

export const api = window.oliver

export interface ToolCall {
  id: string
  name: string
  detail: string
  status: 'run' | 'ok' | 'err'
}

export interface Ask {
  id: string
  tool: string
  detail: string
  reason?: string
  canAlways: boolean
  answer?: PermissionDecision
}

export interface Msg {
  id: string
  role: 'user' | 'bot' | 'note'
  botId?: string
  text: string
  tools: ToolCall[]
  asks: Ask[]
  streaming?: boolean
  error?: string
  pr?: PR
  turn?: number
  spoken?: boolean
}

export interface Swarm {
  task: string
  running: boolean
  git: boolean
  order: string[]
  current: number
  round: number
  rounds: number
  turn: number
  /** Message index in the crew room where this swarm started. */
  from: number
}

export type BotStatus = 'idle' | 'thinking' | 'speaking' | 'waiting'
export type RightTab = 'swarm' | 'files' | 'editor' | 'browser'

export interface OpenFile {
  path: string
  content: string
  saved: string
}

export type Modal = null | { kind: 'settings' } | { kind: 'bot'; bot: Bot | null }

interface State {
  ready: boolean
  auth: AuthStatus
  authLog: string[]
  loggingIn: boolean
  bots: Bot[]
  settings: SettingsView
  probe: Probe | null
  probing: boolean
  voices: Voice[]
  ws: Workspace | null
  tree: TreeNode[]
  prs: PR[]
  branch: string
  room: string
  msgs: Record<string, Msg[]>
  busy: Record<string, boolean>
  status: Record<string, BotStatus>
  swarm: Swarm | null
  leftTab: 'bots' | 'connections'
  rightTab: RightTab
  rightOpen: boolean
  modal: Modal
  openFiles: OpenFile[]
  activeFile: string
  browserUrl: string
  listening: boolean
  hearing: boolean
  toast: string
}

export const useStore = create<State>(() => ({
  ready: false,
  auth: { loggedIn: false },
  authLog: [],
  loggingIn: false,
  bots: [],
  settings: {
    defaultModel: '',
    permissionMode: 'acceptEdits',
    autoVoice: false,
    muted: false,
    swarm: true,
    rounds: 2,
    autoMergePRs: true,
    pushPRs: false,
    ttsModel: 'eleven_flash_v2_5',
    claudePath: '',
    elevenKeySource: 'none',
    claudeFound: ''
  },
  probe: null,
  probing: false,
  voices: [],
  ws: null,
  tree: [],
  prs: [],
  branch: '',
  room: 'crew',
  msgs: {},
  busy: {},
  status: {},
  swarm: null,
  leftTab: 'bots',
  rightTab: 'files',
  rightOpen: true,
  modal: null,
  openFiles: [],
  activeFile: '',
  browserUrl: '',
  listening: false,
  hearing: false,
  toast: ''
}))

export const set = useStore.setState
export const get = useStore.getState

export const uid = (): string => Math.random().toString(36).slice(2, 10)

let toastTimer: ReturnType<typeof setTimeout> | undefined
export function toast(text: string): void {
  set({ toast: text })
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => set({ toast: '' }), 5000)
}

export function addMsg(room: string, m: Partial<Msg> & Pick<Msg, 'role' | 'text'>): Msg {
  const msg: Msg = { id: uid(), tools: [], asks: [], ...m }
  set((s) => ({ msgs: { ...s.msgs, [room]: [...(s.msgs[room] ?? []), msg] } }))
  return msg
}

export function patchMsg(room: string, id: string, fn: (m: Msg) => Partial<Msg>): void {
  set((s) => ({
    msgs: {
      ...s.msgs,
      [room]: (s.msgs[room] ?? []).map((m) => (m.id === id ? { ...m, ...fn(m) } : m))
    }
  }))
}

export function setStatus(botId: string, st: BotStatus): void {
  set((s) => ({ status: { ...s.status, [botId]: st } }))
}

export async function setSettings(patch: Parameters<OliverApi['settings']['set']>[0]): Promise<void> {
  set((s) => ({ settings: { ...s.settings, ...patch } }))
  set({ settings: await api.settings.set(patch) })
}

export async function refreshFiles(): Promise<void> {
  const [tree, prs, branch] = await Promise.all([api.ws.tree(), api.git.prs(), api.git.branch()])
  set({ tree, prs, branch })
  // Files a bot changed are reloaded, unless the person has unsaved edits in them.
  const open = get().openFiles
  const next = await Promise.all(
    open.map(async (f) => {
      if (f.content !== f.saved) return f
      const disk = await api.ws.read(f.path).catch(() => f.saved)
      return disk === f.saved ? f : { ...f, content: disk, saved: disk }
    })
  )
  set({ openFiles: next })
}

export async function openFile(path: string): Promise<void> {
  if (!get().openFiles.some((f) => f.path === path)) {
    const content = await api.ws.read(path)
    set((s) => ({ openFiles: [...s.openFiles, { path, content, saved: content }] }))
  }
  set({ activeFile: path, rightTab: 'editor', rightOpen: true })
}

export async function refreshProbe(force = false): Promise<void> {
  set({ probing: true })
  try {
    set({ probe: await api.claude.probe(force) })
  } catch (e) {
    toast(`Could not read your Claude connectors: ${(e as Error).message}`)
  } finally {
    set({ probing: false })
  }
}

export async function boot(): Promise<void> {
  const [auth, bots, settings, ws] = await Promise.all([
    api.auth.status(),
    api.bots.list(),
    api.settings.get(),
    api.ws.current()
  ])
  set({ auth, bots, settings, ws, ready: true })
  void refreshFiles()
  if (settings.elevenKeySource !== 'none') {
    api.voice
      .voices()
      .then(async (voices) => {
        set({ voices })
        // A bot whose voice this ElevenLabs account does not have gets one that fits.
        const used = new Set(get().bots.map((b) => b.voiceId))
        for (const b of get().bots) {
          if (!voices.length || voices.some((v) => v.id === b.voiceId)) continue
          const want = b.pronouns.startsWith('he') ? /\bmale/ : b.pronouns.startsWith('she') ? /female/ : /neutral/
          const free = voices.filter((v) => !used.has(v.id))
          const pool = free.length ? free : voices
          const v =
            pool.find((x) => want.test(x.desc) && /young/.test(x.desc)) ??
            pool.find((x) => want.test(x.desc)) ??
            pool[0]
          used.add(v.id)
          set({ bots: await api.bots.save({ ...b, voiceId: v.id, voiceName: v.name }) })
        }
      })
      .catch((e: Error) => toast(e.message))
  }
  if (auth.loggedIn) void refreshProbe()
}
