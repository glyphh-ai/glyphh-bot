import { create } from 'zustand'
import {
  BUILTIN_LAYOUTS,
  CHAT,
  closePanel as closeIn,
  findLayout,
  frameOf,
  openLayout,
  openPanel as openIn,
  openPanels,
  freshWebPanel,
  setPinned,
  cloneLayout,
  withPanels,
  type Layout,
  type PanelId,
  type SavedLayout
} from '../../shared/layouts'
import { titleFrom, type Recent } from '../../shared/recents'
import type { AppInput, WebApp } from '../../shared/apps'
import type {
  Attachment,
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
  /** Files the person attached to this message. */
  attachments?: Attachment[]
}

export interface PendingFile {
  att: Attachment
  /** Sent to the bot as a picture too. */
  image?: { mediaType: string; data: string }
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
  | { kind: 'layouts'; edit?: SavedLayout | null; fromScreen?: boolean; copy?: boolean; back?: boolean; fresh?: boolean }

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
  /** Past chats, and which one each room is on now (room → recent id). */
  recents: Recent[]
  chatId: Record<string, string>
  /** Files attached in a room's composer, waiting for the next message. */
  pending: Record<string, PendingFile[]>
  recentsOpen: boolean
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
  /** The layout on screen (its frames and the panels stacked in them), and your saved layouts. */
  layout: Layout
  layouts: SavedLayout[]
  /** The panel last clicked, and the one that just opened (briefly lit). */
  focused: PanelId
  flash: PanelId | null
  /** The panel filling the whole desk, or null. */
  expanded: PanelId | null
  /** The home screen (the command center) is on screen in the chat's place. */
  commandOpen: boolean
  /** Web pages you added to the home screen. */
  apps: WebApp[]
  /** The frame the command center opens into, or null for wherever the stack puts it. */
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
  recents: [],
  chatId: {},
  pending: {},
  recentsOpen: false,
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
  focused: CHAT,
  flash: null,
  expanded: null,
  commandOpen: false,
  apps: [],
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
  saveChat(room)
  return msg
}

export function patchMsg(room: string, id: string, fn: (m: Msg) => Partial<Msg>): void {
  set((s) => ({
    msgs: {
      ...s.msgs,
      [room]: (s.msgs[room] ?? []).map((m) => (m.id === id ? { ...m, ...fn(m) } : m))
    }
  }))
  saveChat(room)
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

/** The panel is open in one of the layout's frames. */
export const inLayout = (panelId: PanelId): boolean => frameOf(get().layout, panelId) >= 0

/** Open a file in the Editor panel (stacking the Editor in if it is not open). */
export async function openFile(path: string): Promise<void> {
  if (!get().openFiles.some((f) => f.path === path)) {
    const content = await api.ws.read(path)
    set((s) => ({ openFiles: [...s.openFiles, { path, content, saved: content }] }))
  }
  set({ activeFile: path })
  openPanel('editor')
}

/** Show a page in the app's own Browser panel. */
export function browse(url: string): void {
  set({ browserUrl: url })
  openPanel('browser')
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
export function setLayout(layout: Layout): void {
  const s = get()
  set({
    layout,
    focused: s.focused === CHAT || frameOf(layout, s.focused) >= 0 ? s.focused : CHAT,
    expanded: s.expanded && (s.expanded === CHAT || frameOf(layout, s.expanded) >= 0) ? s.expanded : null
  })
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void api.layouts.setCurrent(get().layout), 300)
}

/** Open one of the layouts (built-in or yours) by name: its frames and panels, and the panels you had open stack in. */
export function switchLayout(name: string): void {
  const l = findLayout(get().layouts, name)
  if (!l) {
    toast(`No layout called ${name}.`)
    return
  }
  set({ expanded: null })
  setLayout(withPanels(openLayout(l), openPanels(get().layout)))
}

let flashTimer: ReturnType<typeof setTimeout> | undefined
function lightUp(panelId: PanelId): void {
  set({ flash: panelId, focused: panelId })
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => set({ flash: null }), 900)
}

/**
 * Open a panel or a bot: one already open is focused; a new one stacks in
 * (full, under, full, under) in the pinned frame, an empty frame, or the
 * frame with fewest panels; `into` picks the frame by hand.
 */
export function openPanel(panelId: PanelId, into?: number): void {
  const o = openIn(get().layout, panelId, into)
  if (o.how !== 'chat' && o.how !== 'already') setLayout(o.layout)
  const ex = get().expanded
  if (ex && ex !== panelId) set({ expanded: null })
  lightUp(panelId)
}

/** Close a panel; the rest reflow. Closing the last one gives the chat the whole width. */
export function closePanel(panelId: PanelId): void {
  setLayout(closeIn(get().layout, panelId))
}

export function closeAllPanels(): void {
  let l = get().layout
  for (const p of openPanels(l)) l = closeIn(l, p)
  set({ expanded: null })
  setLayout(l)
}

// ------------------------------------------------------------- recents

const roomTimers = new Map<string, ReturnType<typeof setTimeout>>()

/** Keep a room's chat in Recents (debounced): its title is the person's first message. */
export function saveChat(room: string): void {
  clearTimeout(roomTimers.get(room))
  roomTimers.set(
    room,
    setTimeout(() => {
      const s = get()
      const msgs = s.msgs[room] ?? []
      if (!msgs.some((m) => m.role === 'user')) return
      let id = s.chatId[room]
      if (!id) {
        id = uid()
        set((st) => ({ chatId: { ...st.chatId, [room]: id! } }))
      }
      const prev = s.recents.find((r) => r.id === id)
      const first = msgs.find((m) => m.role === 'user')
      const r: Recent = {
        id,
        room,
        title: prev?.title && prev.title !== 'New chat' ? prev.title : titleFrom(first?.text || first?.attachments?.[0]?.name || ''),
        folder: prev?.folder || s.ws?.path || '',
        updatedAt: Date.now(),
        sessionId: room === 'crew' ? undefined : s.bots.find((b) => b.id === room)?.sessionId,
        msgs: msgs.map((m) => ({ ...m, streaming: false }))
      }
      void api.recents.save(r).then((recents) => set({ recents }))
    }, 700)
  )
}

/** Start a fresh chat in a room (the old one stays in Recents). */
export async function newChat(room = get().room): Promise<void> {
  if (get().busy[room]) {
    toast('Wait for this chat to finish, or stop it first.')
    return
  }
  set((s) => {
    const chatId = { ...s.chatId }
    delete chatId[room]
    return { msgs: { ...s.msgs, [room]: [] }, chatId, room, commandOpen: false }
  })
  const bot = get().bots.find((b) => b.id === room)
  if (bot?.sessionId) set({ bots: await api.bots.save({ ...bot, sessionId: undefined }) })
}

/** Reopen a past chat with its history; a bot chat resumes its Claude session. */
export async function reopenRecent(r: Recent): Promise<void> {
  const s = get()
  if (r.room !== 'crew' && !s.bots.some((b) => b.id === r.room)) {
    toast('That bot was deleted, so its chat cannot be reopened.')
    return
  }
  if (s.busy[r.room]) {
    toast('That room is busy. Stop it first.')
    return
  }
  set((st) => ({
    msgs: { ...st.msgs, [r.room]: (r.msgs as Msg[]).map((m) => ({ ...m, streaming: false })) },
    chatId: { ...st.chatId, [r.room]: r.id },
    room: r.room,
    focused: CHAT,
    commandOpen: false
  }))
  const bot = get().bots.find((b) => b.id === r.room)
  if (bot && bot.sessionId !== r.sessionId) set({ bots: await api.bots.save({ ...bot, sessionId: r.sessionId }) })
  if (r.archived) set({ recents: await api.recents.archive(r.id, false) })
}

export async function pinRecent(id: string, on: boolean): Promise<void> {
  set({ recents: await api.recents.pin(id, on) })
}

export async function archiveRecent(id: string, on: boolean): Promise<void> {
  set({ recents: await api.recents.archive(id, on) })
}

/** Delete a past chat for good, after the shared confirm. */
export async function deleteRecent(r: Recent): Promise<void> {
  const ok = await confirmAsk({
    title: `Delete “${r.title}”?`,
    body: 'The chat and its history are gone for good. Files it made stay in the folder.',
    yes: 'Delete',
    danger: true
  })
  if (!ok) return
  if (get().chatId[r.room] === r.id) await newChat(r.room)
  set({ recents: await api.recents.remove(r.id) })
}

/** Fill the whole desk with a panel, or put it back. */
export function toggleExpand(panelId: PanelId): void {
  set((s) => ({ expanded: s.expanded === panelId ? null : panelId, focused: panelId }))
}

/** Pin a frame (new panels stack into it), or unpin it. */
export function togglePin(frame: number): void {
  const l = cloneLayout(get().layout)
  const on = !l.frames[frame]?.pinned
  setPinned(l, frame, on)
  setLayout(l)
}

/** Show the home screen in the chat's place; `target` is the frame what it opens goes into, or null for wherever the stack puts it. */
export function openCommand(target: number | null = null): void {
  set((s) => ({ commandOpen: true, commandTarget: target, expanded: s.expanded === CHAT ? s.expanded : null, focused: CHAT }))
}

/** Back from the home screen to the chat. */
export function closeHome(): void {
  set({ commandOpen: false, commandTarget: null })
}

export const toggleHome = (): void => (get().commandOpen ? closeHome() : openCommand(null))

// ------------------------------------------------------------- apps

/** Open one of your apps in a new Browser panel of its own, stacked in like any panel (a pinned frame takes it). */
export function openApp(app: WebApp, into?: number): void {
  openPanel(freshWebPanel(get().layout, app.id), into)
}

/** Add an app (no id) or change one; its icon is fetched when its address is new. */
export async function saveApp(input: AppInput & { id?: string }): Promise<WebApp[]> {
  const apps = await api.apps.save(input)
  set({ apps })
  return apps
}

/** Remove an app after the shared confirm; its open panels close. */
export async function removeApp(app: WebApp): Promise<void> {
  const ok = await confirmAsk({
    title: `Remove ${app.name}?`,
    body: 'It comes off the home screen and its open panels close. Its sign-in stays on this computer.',
    yes: 'Remove',
    danger: true
  })
  if (!ok) return
  let l = get().layout
  for (const p of openPanels(l)) if (p.startsWith(`web:${app.id}:`)) l = closeIn(l, p)
  setLayout(l)
  set({ apps: await api.apps.remove(app.id) })
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
  api.recents
    .list()
    .then((recents) => set({ recents }))
    .catch(() => undefined)
  api.apps
    .list()
    .then((apps) => set({ apps }))
    .catch(() => undefined)
  // A new window an app's panel sent out (outside the app's prefixes) opens in the Browser.
  api.onBrowserOpen((url) => browse(url))
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
