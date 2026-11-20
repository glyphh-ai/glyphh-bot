// Types shared by the main process, the preload bridge and the renderer.
import type { Layout, SavedLayout } from './layouts'

// Every bot is Spike, the Glyphh cat, in black and white. The parts, the
// extras and the pose change from bot to bot; the colours never do.
export type Head = 'classic' | 'spiky' | 'tall' | 'folded' | 'round'
export type Tail = 'spike' | 'bolt' | 'curl' | 'long'
export type Eye = 'dot' | 'side' | 'big' | 'sleepy' | 'heart' | 'star'
export type Extra = 'none' | 'antenna' | 'cape' | 'bolt'
export type Accessory =
  | 'none'
  | 'headphones'
  | 'beanie'
  | 'cap'
  | 'glasses'
  | 'shades'
  | 'bow'
  | 'scarf'
  | 'crown'
  | 'chain'
export type Pose = 'stand' | 'lean' | 'hop' | 'turn'

export const HEADS: Head[] = ['classic', 'spiky', 'tall', 'folded', 'round']
export const TAILS: Tail[] = ['spike', 'bolt', 'curl', 'long']
export const EYES: Eye[] = ['dot', 'side', 'big', 'sleepy', 'heart', 'star']
export const EXTRAS: Extra[] = ['none', 'antenna', 'cape', 'bolt']
export const ACCESSORIES: Accessory[] = [
  'none',
  'headphones',
  'beanie',
  'cap',
  'glasses',
  'shades',
  'bow',
  'scarf',
  'crown',
  'chain'
]
export const POSES: Pose[] = ['stand', 'lean', 'hop', 'turn']

/** How a bot's cat looks. */
export interface Look {
  head: Head
  tail: Tail
  eye: Eye
  extra: Extra
  accessory: Accessory
  pose: Pose
}

/** Any partial or old look made whole: unknown parts fall back to Spike's own. */
export function normalizeLook(raw: unknown): Look {
  const l = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const one = <T extends string>(v: unknown, all: T[], d: T): T => (all.includes(v as T) ? (v as T) : d)
  return {
    head: one(l.head, HEADS, 'classic'),
    tail: one(l.tail, TAILS, 'spike'),
    eye: one(l.eye, EYES, 'dot'),
    extra: one(l.extra, EXTRAS, 'none'),
    accessory: one(l.accessory, ACCESSORIES, 'none'),
    pose: one(l.pose, POSES, 'stand')
  }
}

export interface Bot {
  id: string
  name: string
  pronouns: string
  tagline: string
  personality: string
  /** The bot's standing job in the crew. */
  task: string
  look: Look
  voiceId: string
  voiceName: string
  /** Model id, or '' for the app default. */
  model: string
  /** 'all' or the names of the Claude connectors this bot may use. */
  connectors: 'all' | string[]
  /** Takes turns in the crew room. */
  inCrew: boolean
  /** Claude session of the direct chat, resumed on the next message. */
  sessionId?: string
}

export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'auto' | 'bypassPermissions'

export interface Settings {
  defaultModel: string
  permissionMode: PermissionMode
  autoVoice: boolean
  muted: boolean
  swarm: boolean
  rounds: number
  autoMergePRs: boolean
  pushPRs: boolean
  ttsModel: string
  claudePath: string
}

export interface SettingsView extends Settings {
  elevenKeySource: 'settings' | 'glyphh' | 'none'
  claudeFound: string
}

export interface AuthStatus {
  loggedIn: boolean
  email?: string
  orgName?: string
  subscriptionType?: string
  authMethod?: string
  error?: string
}

export interface Connector {
  name: string
  status: string
  error?: string
  scope?: string
}

export interface ModelChoice {
  value: string
  label: string
  description?: string
}

export interface Probe {
  connectors: Connector[]
  models: ModelChoice[]
}

export interface RunParams {
  runId: string
  prompt: string
  systemAppend: string
  cwd: string
  model: string
  permissionMode: PermissionMode
  resume?: string
  connectors: 'all' | string[]
}

export interface RunResult {
  text: string
  sessionId?: string
  error?: string
  costUsd?: number
}

export type AgentEvent =
  | { runId: string; kind: 'init'; sessionId: string; model: string; connectors: Connector[] }
  | { runId: string; kind: 'delta'; text: string }
  | { runId: string; kind: 'break' }
  | { runId: string; kind: 'tool'; id: string; name: string; detail: string }
  | { runId: string; kind: 'tool_done'; id: string; error: boolean }
  | {
      runId: string
      kind: 'permission'
      id: string
      tool: string
      detail: string
      reason?: string
      canAlways: boolean
    }

export type PermissionDecision = 'allow' | 'always' | 'deny'

export interface TreeNode {
  name: string
  path: string
  dir: boolean
  children?: TreeNode[]
}

/** One row of the Files panel: a path relative to the workspace. */
export interface FileEntry {
  name: string
  path: string
  dir: boolean
}

export interface FileSearch {
  entries: FileEntry[]
  truncated?: boolean
  error?: string
}

export interface PRFile {
  path: string
  added: number
  removed: number
}

export interface PR {
  id: number
  branch: string
  base: string
  baseSha: string
  headSha: string
  title: string
  body: string
  botId: string
  botName: string
  status: 'open' | 'merged' | 'rejected' | 'conflict'
  files: PRFile[]
  url?: string
  createdAt: number
}

export interface Voice {
  id: string
  name: string
  desc: string
}

export interface Workspace {
  path: string
  name: string
}

export interface GlyphhBotApi {
  auth: {
    status(): Promise<AuthStatus>
    login(): Promise<void>
    loginInput(text: string): Promise<void>
    logout(): Promise<AuthStatus>
    onLog(cb: (line: string) => void): () => void
  }
  claude: {
    probe(force?: boolean): Promise<Probe>
  }
  agent: {
    run(p: RunParams): Promise<RunResult>
    stop(runId: string): Promise<void>
    permission(id: string, decision: PermissionDecision): Promise<void>
    onEvent(cb: (e: AgentEvent) => void): () => void
  }
  bots: {
    list(): Promise<Bot[]>
    save(bot: Bot): Promise<Bot[]>
    remove(id: string): Promise<Bot[]>
    generate(prompt: string, voices: Voice[]): Promise<Partial<Bot>>
  }
  settings: {
    get(): Promise<SettingsView>
    set(patch: Partial<Settings>): Promise<SettingsView>
    setElevenKey(key: string): Promise<SettingsView>
  }
  voice: {
    tts(text: string, voiceId: string): Promise<Uint8Array>
    stt(audio: Uint8Array, mime: string): Promise<string>
    voices(): Promise<Voice[]>
  }
  ws: {
    current(): Promise<Workspace>
    create(name: string): Promise<Workspace>
    open(): Promise<Workspace | null>
    tree(): Promise<TreeNode[]>
    read(path: string): Promise<string>
    write(path: string, content: string): Promise<void>
    reveal(): Promise<void>
    /** The Files panel: one folder's children, a name search, and changes. */
    list(dir: string): Promise<FileEntry[]>
    search(query: string): Promise<FileSearch>
    mkdir(path: string): Promise<void>
    rename(from: string, to: string): Promise<void>
    trash(path: string): Promise<void>
    exists(path: string): Promise<boolean>
    /** The working tree against HEAD, untracked files included. */
    diff(): Promise<{ text: string; error?: string }>
    /** A file from anywhere on disk, picked in the system dialog (the Browser opens it). */
    pickFile(): Promise<string | null>
  }
  git: {
    beginTurn(branch: string): Promise<{ base: string; baseSha: string }>
    endTurn(p: {
      branch: string
      base: string
      baseSha: string
      botId: string
      botName: string
      title: string
      body: string
    }): Promise<PR | null>
    merge(id: number): Promise<PR>
    reject(id: number): Promise<PR>
    prs(): Promise<PR[]>
    diff(id: number): Promise<string>
    branch(): Promise<string>
  }
  layouts: {
    list(): Promise<SavedLayout[]>
    save(layout: SavedLayout, replacing?: string): Promise<SavedLayout[]>
    remove(name: string): Promise<SavedLayout[]>
    current(): Promise<Layout | null>
    setCurrent(layout: Layout): Promise<void>
  }
  openExternal(url: string): Promise<void>
  /** True only in a GLYPHH_BOT_SHOT run, so the screenshot script can set the scene. */
  shot: boolean
}
