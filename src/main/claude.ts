// Everything that talks to Claude goes through the person's own Claude CLI
// login: the app never holds a key of its own.
import { type ChildProcessWithoutNullStreams, execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { shell, type WebContents } from 'electron'
import type {
  AgentEvent,
  AuthStatus,
  Bot,
  Connector,
  ModelChoice,
  PermissionDecision,
  Probe,
  RunParams,
  RunResult,
  Voice
} from '../shared/types'
import { ACCESSORIES, EXTRAS, EYES, HEADS, POSES, TAILS, normalizeLook } from '../shared/types'
import { load } from './store'

type Sdk = typeof import('@anthropic-ai/claude-agent-sdk')
type Query = ReturnType<Sdk['query']>

let sdkPromise: Promise<Sdk> | null = null
function sdk(): Promise<Sdk> {
  sdkPromise ??= import('@anthropic-ai/claude-agent-sdk')
  return sdkPromise
}

const EXTRA_PATH = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  join(homedir(), '.local', 'bin'),
  join(homedir(), '.claude', 'local')
]

/** An app started from Finder has a bare PATH; add where claude, git and gh live. */
export function env(): NodeJS.ProcessEnv {
  const path = [...EXTRA_PATH, ...(process.env.PATH ?? '').split(':')].filter(Boolean)
  return { ...process.env, PATH: [...new Set(path)].join(':') }
}

export function findClaude(): string {
  const set = load().settings.claudePath
  if (set && existsSync(set)) return set
  for (const dir of (env().PATH ?? '').split(':')) {
    const p = join(dir, 'claude')
    if (existsSync(p)) return p
  }
  return ''
}

function claude(args: string[], timeout = 15000): Promise<string> {
  const bin = findClaude()
  if (!bin) return Promise.reject(new Error('Claude CLI not found'))
  return new Promise((resolve, reject) => {
    execFile(bin, args, { env: env(), timeout }, (err, stdout, stderr) => {
      if (err && !stdout) reject(new Error(stderr || err.message))
      else resolve(stdout)
    })
  })
}

// ---------------------------------------------------------------- sign-in

export async function authStatus(): Promise<AuthStatus> {
  if (!findClaude()) {
    return {
      loggedIn: false,
      error: 'Claude Code is not installed. Install it from claude.com/claude-code, then come back.'
    }
  }
  try {
    const out = JSON.parse(await claude(['auth', 'status', '--json']))
    return {
      loggedIn: !!out.loggedIn,
      email: out.email,
      orgName: out.orgName,
      subscriptionType: out.subscriptionType,
      authMethod: out.authMethod
    }
  } catch (e) {
    return { loggedIn: false, error: (e as Error).message }
  }
}

let loginProc: ChildProcessWithoutNullStreams | null = null

/** Runs `claude auth login`, which sends the person to the Claude sign-in page. */
export function login(wc: WebContents): void {
  loginProc?.kill()
  probeCache = null
  const bin = findClaude()
  if (!bin) {
    wc.send('auth:log', 'Claude Code is not installed.')
    return
  }
  const opened = new Set<string>()
  const proc = spawn(bin, ['auth', 'login', '--claudeai'], { env: env() })
  loginProc = proc
  const onData = (buf: Buffer): void => {
    const text = buf.toString().replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    for (const line of text.split('\n')) {
      if (line.trim()) wc.send('auth:log', line.trim())
    }
    // The CLI opens the browser itself; if it only printed the link, open it.
    for (const url of text.match(/https:\/\/[^\s"']+/g) ?? []) {
      if (/claude\.(ai|com)|anthropic\.com/.test(new URL(url).hostname) && !opened.has(url)) {
        opened.add(url)
        if (/didn.t open|manually|visit|copy/i.test(text)) void shell.openExternal(url)
      }
    }
  }
  proc.stdout.on('data', onData)
  proc.stderr.on('data', onData)
  proc.on('close', (code) => {
    if (loginProc === proc) loginProc = null
    wc.send('auth:log', code === 0 ? '__done__' : '__failed__')
  })
}

export function loginInput(text: string): void {
  loginProc?.stdin.write(text.trim() + '\n')
}

export async function logout(): Promise<AuthStatus> {
  probeCache = null
  try {
    await claude(['auth', 'logout'])
  } catch {
    // Report whatever state the CLI is left in.
  }
  return authStatus()
}

// ----------------------------------------------- connectors and models

const FALLBACK_MODELS: ModelChoice[] = [
  { value: '', label: 'Default' },
  { value: 'claude-fable-5-2', label: 'Fable 5.2' },
  { value: 'claude-opus-5-5', label: 'Opus 5.5' },
  { value: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  { value: 'claude-haiku-5-5', label: 'Haiku 5.5' }
]

let probeCache: Probe | null = null

/** Opens a session that says nothing, to read the connectors and models Claude offers this login. */
export async function probe(cwd: string, force = false): Promise<Probe> {
  if (probeCache && !force) return probeCache
  const { query } = await sdk()
  let release: () => void = () => {}
  const hold = new Promise<void>((r) => (release = r))
  async function* nothing(): AsyncGenerator<never> {
    await hold
  }
  const q = query({
    prompt: nothing(),
    options: { pathToClaudeCodeExecutable: findClaude(), cwd, env: env() }
  })
  try {
    const models = await q.supportedModels().catch(() => [])
    let servers = await q.mcpServerStatus().catch(() => [])
    for (let i = 0; i < 8 && servers.some((s) => s.status === 'pending'); i++) {
      await new Promise((r) => setTimeout(r, 1000))
      servers = await q.mcpServerStatus().catch(() => servers)
    }
    const list: ModelChoice[] = models.map((m) => ({
      value: m.value === 'default' ? '' : m.value,
      label: m.displayName,
      description: m.description
    }))
    if (!list.some((m) => m.value === '')) list.unshift({ value: '', label: 'Default' })
    probeCache = {
      models: models.length ? list : FALLBACK_MODELS,
      connectors: servers.map((s) => ({
        name: s.name,
        status: s.status,
        error: s.error,
        scope: (s as { scope?: string }).scope
      }))
    }
    return probeCache
  } finally {
    release()
    q.close()
  }
}

// ------------------------------------------------------------------ runs

const runs = new Map<string, { q: Query; abort: AbortController }>()
const waiting = new Map<string, (d: PermissionDecision) => void>()

function describe(tool: string, input: Record<string, unknown>): string {
  const pick = (k: string): string => (typeof input[k] === 'string' ? (input[k] as string) : '')
  const text =
    pick('command') ||
    pick('file_path') ||
    pick('path') ||
    pick('pattern') ||
    pick('url') ||
    pick('query') ||
    pick('description') ||
    pick('prompt')
  if (text) return text.length > 400 ? text.slice(0, 400) + '…' : text
  const json = JSON.stringify(input)
  return json === '{}' ? '' : json.slice(0, 300)
}

export async function run(wc: WebContents, p: RunParams): Promise<RunResult> {
  const { query } = await sdk()
  const send = (e: AgentEvent): void => {
    if (!wc.isDestroyed()) wc.send('agent:event', e)
  }
  const abort = new AbortController()
  let finished: () => void = () => {}
  const done = new Promise<void>((r) => (finished = r))

  // Streaming input keeps the session open so permission questions can be answered.
  async function* input(): AsyncGenerator<{
    type: 'user'
    message: { role: 'user'; content: string }
    parent_tool_use_id: null
    session_id: string
  }> {
    yield {
      type: 'user',
      message: { role: 'user', content: p.prompt },
      parent_tool_use_id: null,
      session_id: ''
    }
    await done
  }

  // A bot limited to some connectors is denied the tools of every other one.
  const blocked =
    p.connectors === 'all'
      ? []
      : (probeCache?.connectors ?? [])
          .filter((c) => !(p.connectors as string[]).includes(c.name))
          .map((c) => `mcp__${c.name.replace(/[^a-zA-Z0-9_-]/g, '_')}`)

  const q = query({
    prompt: input() as never,
    options: {
      pathToClaudeCodeExecutable: findClaude(),
      cwd: p.cwd,
      env: env(),
      abortController: abort,
      includePartialMessages: true,
      systemPrompt: { type: 'preset', preset: 'claude_code', append: p.systemAppend },
      permissionMode: p.permissionMode,
      allowDangerouslySkipPermissions: p.permissionMode === 'bypassPermissions',
      ...(p.model ? { model: p.model } : {}),
      ...(p.resume ? { resume: p.resume } : {}),
      ...(blocked.length ? { disallowedTools: blocked } : {}),
      canUseTool: async (tool, toolInput, opts) => {
        const id = `${p.runId}:${opts.toolUseID ?? Math.random().toString(36).slice(2)}`
        send({
          runId: p.runId,
          kind: 'permission',
          id,
          tool,
          detail: describe(tool, toolInput),
          reason: opts.decisionReason,
          canAlways: !!opts.suggestions?.length
        })
        const decision = await new Promise<PermissionDecision>((resolve) => {
          waiting.set(id, resolve)
          opts.signal.addEventListener('abort', () => resolve('deny'), { once: true })
        })
        waiting.delete(id)
        if (decision === 'deny') {
          return { behavior: 'deny', message: 'The person said no to this.' }
        }
        return {
          behavior: 'allow',
          updatedInput: toolInput,
          ...(decision === 'always' && opts.suggestions
            ? { updatedPermissions: opts.suggestions }
            : {})
        }
      }
    }
  })
  runs.set(p.runId, { q, abort })

  const result: RunResult = { text: '' }
  let streamed = ''
  try {
    for await (const m of q) {
      if (m.type === 'system' && m.subtype === 'init') {
        result.sessionId = m.session_id
        const connectors: Connector[] = m.mcp_servers.map((s) => ({
          name: s.name,
          status: s.status
        }))
        send({ runId: p.runId, kind: 'init', sessionId: m.session_id, model: m.model, connectors })
      } else if (m.type === 'stream_event' && m.parent_tool_use_id === null) {
        const ev = m.event as {
          type: string
          delta?: { type: string; text?: string }
        }
        if (ev.type === 'message_start' && streamed) {
          send({ runId: p.runId, kind: 'break' })
        } else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          streamed += ev.delta.text ?? ''
          send({ runId: p.runId, kind: 'delta', text: ev.delta.text ?? '' })
        }
      } else if (m.type === 'assistant' && m.parent_tool_use_id === null) {
        for (const block of m.message.content as {
          type: string
          id?: string
          name?: string
          input?: Record<string, unknown>
        }[]) {
          if (block.type === 'tool_use') {
            send({
              runId: p.runId,
              kind: 'tool',
              id: block.id ?? '',
              name: block.name ?? 'tool',
              detail: describe(block.name ?? '', block.input ?? {})
            })
          }
        }
      } else if (m.type === 'user' && m.parent_tool_use_id === null) {
        const content = m.message.content
        if (Array.isArray(content)) {
          for (const block of content as {
            type: string
            tool_use_id?: string
            is_error?: boolean
          }[]) {
            if (block.type === 'tool_result') {
              send({
                runId: p.runId,
                kind: 'tool_done',
                id: block.tool_use_id ?? '',
                error: !!block.is_error
              })
            }
          }
        }
      } else if (m.type === 'result') {
        result.sessionId = m.session_id
        result.costUsd = m.total_cost_usd
        if (m.subtype === 'success') result.text = m.result
        else result.error = `Claude stopped: ${m.subtype.replace(/_/g, ' ')}`
        break
      }
    }
  } catch (e) {
    if (!abort.signal.aborted) result.error = (e as Error).message
  } finally {
    finished()
    runs.delete(p.runId)
    try {
      q.close()
    } catch {
      // Already closed.
    }
  }
  if (abort.signal.aborted && !result.text) result.error = 'stopped'
  if (!result.text && !result.error) result.text = streamed
  return result
}

export function stop(runId: string): void {
  const r = runs.get(runId)
  if (!r) return
  for (const [id, resolve] of waiting) if (id.startsWith(runId + ':')) resolve('deny')
  r.abort.abort()
}

export function stopAll(): void {
  for (const id of [...runs.keys()]) stop(id)
}

export function answerPermission(id: string, decision: PermissionDecision): void {
  waiting.get(id)?.(decision)
}

// ----------------------------------------------- a bot from a prompt

/** Turns "a calm tester who roasts bugs" into a whole bot: name, voice, personality and cat. */
export async function generateBot(prompt: string, voices: Voice[]): Promise<Partial<Bot>> {
  const { query } = await sdk()
  const voiceList = voices
    .slice(0, 40)
    .map((v) => `${v.id}: ${v.name} (${v.desc})`)
    .join('\n')
  const system = `You design characters for Glyphh Bot, a bot OS where every bot is Spike, the Glyphh alien cat, drawn in black and white: one big ringed eye, a tall ear, a tail. Bots differ by the cat's parts, an accessory and a pose, and by how they talk. Characters have attitude but are kind.
Reply with one JSON object and nothing else:
{"name": short first name, "pronouns": "she/her" | "he/him" | "they/them" | a mix, "tagline": 2-5 plain words, "personality": 2 sentences on how they talk and act, "task": 1 sentence on their job in a crew that builds things, "voiceId": one id from the voice list that fits, "look": {"head": one of ${HEADS.join('|')}, "tail": one of ${TAILS.join('|')}, "eye": one of ${EYES.join('|')} (the expression), "extra": one of ${EXTRAS.join('|')}, "accessory": one of ${ACCESSORIES.join('|')}, "pose": one of ${POSES.join('|')}}}
Voice list:
${voiceList || '(none: use "")'}`
  let text = ''
  const q = query({
    prompt: `Make a bot from this description: ${prompt}`,
    options: {
      pathToClaudeCodeExecutable: findClaude(),
      env: env(),
      model: 'haiku',
      systemPrompt: system,
      settingSources: [],
      allowedTools: [],
      maxTurns: 1,
      permissionMode: 'dontAsk'
    }
  })
  for await (const m of q) {
    if (m.type === 'result') {
      if (m.subtype !== 'success') throw new Error('Claude could not make that bot. Try again.')
      text = m.result
    }
  }
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  const raw = JSON.parse(json) as Record<string, unknown>
  const voice = voices.find((v) => v.id === raw.voiceId)
  return {
    name: String(raw.name ?? 'New bot').slice(0, 24),
    pronouns: String(raw.pronouns ?? 'they/them').slice(0, 24),
    tagline: String(raw.tagline ?? '').slice(0, 60),
    personality: String(raw.personality ?? '').slice(0, 600),
    task: String(raw.task ?? '').slice(0, 400),
    ...(voice ? { voiceId: voice.id, voiceName: voice.name } : {}),
    look: normalizeLook(raw.look)
  }
}
