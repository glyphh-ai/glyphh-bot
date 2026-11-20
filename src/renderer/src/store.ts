import { create } from 'zustand'
import {
  BUILTIN_LAYOUTS,
  closeCell,
  findLayout,
  openLayout,
  placePanel,
  type Layout,
  type PanelId,
  type SavedLayout
} from '../../shared/layouts'
import type {
  AuthStatus,
  Bot,
  GlyphhBotApi,
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
    glyphhBot: GlyphhBotApi
  }
}

export const api = window.glyphhBot

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
export type RightTab = 'swarm' | 'files' | 'editor' | 'diff' | 'browser'

export interface OpenFile {
  path: string
  content: string
  saved: string
}

export interface ConfirmAsk {
  title: string
  body?: string
  yes: string
  danger?: boolean
  resolve: (ok: boolean) => void
}

export type Modal =
  | null
  | { kind: 'settings' }
  | { kind: 'bot'; bot: Bot | null }
  | { kind: 'layouts'; edit?: SavedLayout | null; fromScreen?: boolean }

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
  /** The room the main Chat panel shows: 'crew' or a bot's id. */
  room: string
  msgs: Record<string, Msg[]>
  busy: Record<string, boolean>
  status: Record<string, BotStatus>
  swarm: Swarm | null
  leftTab: 'bots' | 'connections'
  rightTab: RightTab
  rightOpen: boolean
  modal: Modal
  confirm: ConfirmAsk | null
  openFiles: OpenFile[]
  activeFile: string
  browserUrl: string
  listening: boolean
  hearing: boolean
  toast: string
  /** Bumped whenever files on disk may have changed (the Files and Diff panels re-read). */
  fsTick: number
  /** The layout on screen, your saved layouts, and the cell last clicked. */
  layout: Layout
  layouts: SavedLayout[]
  focused: number
  /** The cell that just got a panel, briefly lit. */
  flash: number
  commandOpen: boolean
  commandTarget: number | null
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
  confirm: null,
  openFiles: [],
  activeFile: '',
  browserUrl: '',
  listening: false,
  hearing: false,
  toast: '',
  fsTick: 0,
  layout: openLayout(BUILTIN_LAYOUTS[0]!),
  layouts: [],
  focused: 0,
  flash: -1,
  commandOpen: false,
  commandTarget: null
}))

export const set = useStore.setState
export const get = useStore.getState

export const uid = (): string => Math.random().toString(36).slice(2, 10)

/** The message of an error from the main process, without Electron's wrapping. */
export const why = (e: unknown): string =>
  ((e as Error)?.message ?? String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

let toastTimer: ReturnType<typeof setTimeout> | undefined
export function toast(text: string): void {
  set({ toast: text })
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => set({ toast: '' }), 5000)
}

/** An in-app yes/no question; resolves true on yes. */
export function confirmAsk(q: Omit<ConfirmAsk, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => set({ confirm: { ...q, resolve } }))
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

export async function setSettings(patch: Parameters<GlyphhBotApi['settings']['set']>[0]): Promise<void> {
  set((s) => ({ settings: { ...s.settings, ...patch } }))
  set({ settings: await api.settings.set(patch) })
}

export async function refreshFiles(): Promise<void> {
  const [tree, prs, branch] = await Promise.all([api.ws.tree(), api.git.prs(), api.git.branch()])
  set((s) => ({ tree, prs, branch, fsTick: s.fsTick + 1 }))
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

/** The layout shows this panel somewhere (a cell), so the right rail need not. */
export const inLayout = (panelId: PanelId): boolean => get().layout.cells.some((c) => c.panelId === panelId)

export async function openFile(path: string): Promise<void> {
  if (!get().openFiles.some((f) => f.path === path)) {
    const content = await api.ws.read(path)
    set((s) => ({ openFiles: [...s.openFiles, { path, content, saved: content }] }))
  }
  set({ activeFile: path })
  if (!inLayout('editor')) set({ rightTab: 'editor', rightOpen: true })
}

export async function refreshProbe(force = false): Promise<void> {
  set({ probing: true })
  try {
    set({ probe: await api.claude.probe(force) })
  } catch (e) {
    toast(`Could not read your Claude connectors: ${why(e)}`)
  } finally {
    set({ probing: false })
  }
}

// ------------------------------------------------------------- layouts

let saveTimer: ReturnType<typeof setTimeout> | undefined

/** Put a layout on screen; it is kept so the app reopens on it. */
export function setLayout(layout: Layout, focused = get().focused): void {
  set({ layout, focused: layout.cells[focused] ? focused : 0 })
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void api.layouts.setCurrent(get().layout), 300)
}

/** Open one of the layouts (built-in or yours) by name. */
export function switchLayout(name: string): void {
  const l = findLayout(get().layouts, name)
  if (!l) {
    toast(`No layout called ${name}.`)
    return
  }
  setLayout(openLayout(l), 0)
}

let flashTimer: ReturnType<typeof setTimeout> | undefined

/** Open a panel or a bot in the layout on screen (the command center's job). */
export function openPanel(panelId: PanelId): void {
  const { layout, idx } = placePanel(get().layout, panelId, get().focused)
  setLayout(layout, idx)
  set({ flash: idx })
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => set({ flash: -1 }), 900)
}

export function closePanel(idx: number): void {
  setLayout(closeCell(get().layout, idx))
}

/** Put a panel in one cell (an empty cell's button, or a tile dropped on a cell). A panel already elsewhere moves. */
export function placeAt(idx: number, panelId: PanelId): void {
  const l = get().layout
  if (!l.cells[idx]) return
  const next = { ...l, cells: l.cells.map((c) => ({ ...c })) }
  const was = next.cells.findIndex((c) => c.panelId === panelId)
  if (was >= 0 && was !== idx) next.cells[was]!.panelId = ''
  next.cells[idx]!.panelId = panelId
  setLayout(next, idx)
  set({ flash: idx })
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => set({ flash: -1 }), 900)
}

/** Open the command center; `target` is the empty cell it fills, or null for wherever fits. */
export function openCommand(target: number | null = null): void {
  set({ commandOpen: true, commandTarget: target })
}

export async function boot(): Promise<void> {
  const [auth, bots, settings, ws, layouts, current] = await Promise.all([
    api.auth.status(),
    api.bots.list(),
    api.settings.get(),
    api.ws.current(),
    api.layouts.list(),
    api.layouts.current()
  ])
  set({ auth, bots, settings, ws, layouts, ready: true, ...(current ? { layout: current } : {}) })
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
            pool[0]!
          used.add(v.id)
          set({ bots: await api.bots.save({ ...b, voiceId: v.id, voiceName: v.name }) })
        }
      })
      .catch((e: Error) => toast(why(e)))
  }
  if (auth.loggedIn) void refreshProbe()
}
