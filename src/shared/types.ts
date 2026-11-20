// Types shared by the main process, the preload bridge and the renderer.

export type ManeStyle = 'long' | 'mohawk' | 'curly' | 'braids' | 'buzz' | 'bun' | 'swoosh'
export type TopStyle = 'hoodie' | 'tee' | 'crop' | 'jersey' | 'flannel' | 'bomber'
export type JeansStyle = 'baggy' | 'skinny' | 'ripped' | 'shorts' | 'skirt'
export type Accessory =
  | 'none'
  | 'headphones'
  | 'beanie'
  | 'cap'
  | 'glasses'
  | 'shades'
  | 'bow'
  | 'earring'
  | 'chain'
  | 'septum'
  | 'bandana'
  | 'choker'

export const MANES: ManeStyle[] = ['long', 'mohawk', 'curly', 'braids', 'buzz', 'bun', 'swoosh']
export const TOPS: TopStyle[] = ['hoodie', 'tee', 'crop', 'jersey', 'flannel', 'bomber']
export const JEANS: JeansStyle[] = ['baggy', 'skinny', 'ripped', 'shorts', 'skirt']
export const ACCESSORIES: Accessory[] = [
  'none',
  'headphones',
  'beanie',
  'cap',
  'glasses',
  'shades',
  'bow',
  'earring',
  'chain',
  'septum',
  'bandana',
  'choker'
]

/** How a bot's horse looks. Every bot is the same horse, styled differently. */
export interface Look {
  coat: string
  mane: string
  maneStyle: ManeStyle
  top: TopStyle
  topColor: string
  jeans: JeansStyle
  jeansColor: string
  sneakers: string
  accessory: Accessory
  accent: string
  lashes: boolean
  blaze: boolean
  freckles: boolean
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

export interface OliverApi {
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
  openExternal(url: string): Promise<void>
}
