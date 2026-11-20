// Runs the bots: one bot in a direct chat, or the crew taking turns in the
// main room, each turn on its own git branch that ends as a pull request.
import type { AgentEvent, Bot, PR, RunResult } from '../../shared/types'
import {
  addMsg,
  api,
  get,
  patchMsg,
  refreshFiles,
  set,
  setStatus,
  toast,
  uid,
  type Msg
} from './store'
import { mic, speak, stopSpeaking } from './voice'

const live = new Map<string, { room: string; msgId: string }>()
let stopFlag = false
const prWaiters = new Map<number, () => void>()

export function startEvents(): () => void {
  let refresh: ReturnType<typeof setTimeout> | undefined
  return api.agent.onEvent((e: AgentEvent) => {
    const run = live.get(e.runId)
    if (!run) return
    const { room, msgId } = run
    if (e.kind === 'delta') patchMsg(room, msgId, (m) => ({ text: m.text + e.text }))
    else if (e.kind === 'break') patchMsg(room, msgId, (m) => ({ text: m.text + '\n\n' }))
    else if (e.kind === 'tool') {
      patchMsg(room, msgId, (m) => ({
        tools: [...m.tools, { id: e.id, name: e.name, detail: e.detail, status: 'run' }]
      }))
    } else if (e.kind === 'tool_done') {
      patchMsg(room, msgId, (m) => ({
        tools: m.tools.map((t) => (t.id === e.id ? { ...t, status: e.error ? 'err' : 'ok' } : t))
      }))
      clearTimeout(refresh)
      refresh = setTimeout(() => void refreshFiles(), 400)
    } else if (e.kind === 'permission') {
      patchMsg(room, msgId, (m) => ({
        asks: [
          ...m.asks,
          { id: e.id, tool: e.tool, detail: e.detail, reason: e.reason, canAlways: e.canAlways }
        ]
      }))
    } else if (e.kind === 'init' && !get().probe) {
      set({ probe: { connectors: e.connectors, models: [{ value: '', label: 'Default' }] } })
    }
  })
}

function describeLook(bot: Bot): string {
  const l = bot.look
  return `${l.maneStyle} mane, a ${l.top}, ${l.jeans} jeans, sneakers${
    l.accessory !== 'none' ? `, ${l.accessory}` : ''
  }`
}

function persona(bot: Bot, cwd: string): string {
  return `You are ${bot.name} (${bot.pronouns}), a bot in Oliver, a voice-first bot OS. You are a horse with the style of a teen in 2026: ${describeLook(bot)}.
Personality: ${bot.personality}
Your job: ${bot.task}
Stay in character and do real work with your tools. Keep it kind and school-appropriate.
Your final message each turn is read aloud in your own voice. Make it 1 to 4 short sentences of natural speech: no markdown, no lists, no code, no file paths spelled out, no emoji. Put details in files, not in what you say.
Your working folder is ${cwd}.`
}

async function runTurn(
  room: string,
  bot: Bot,
  prompt: string,
  resume?: string,
  turn?: number
): Promise<RunResult & { msg: Msg }> {
  const s = get()
  const runId = uid()
  const msg = addMsg(room, { role: 'bot', botId: bot.id, text: '', streaming: true, turn })
  live.set(runId, { room, msgId: msg.id })
  currentRun = runId
  setStatus(bot.id, 'thinking')
  let res: RunResult
  try {
    res = await api.agent.run({
      runId,
      prompt,
      systemAppend: persona(bot, s.ws?.path ?? ''),
      cwd: s.ws?.path ?? '',
      model: bot.model || s.settings.defaultModel,
      permissionMode: s.settings.permissionMode,
      resume,
      connectors: bot.connectors
    })
  } catch (e) {
    res = { text: '', error: (e as Error).message }
  }
  live.delete(runId)
  currentRun = ''
  patchMsg(room, msg.id, (m) => ({
    streaming: false,
    text: m.text.trim() || res.text,
    error: res.error && res.error !== 'stopped' ? res.error : undefined,
    asks: m.asks.map((a) => (a.answer ? a : { ...a, answer: 'deny' as const }))
  }))
  setStatus(bot.id, 'idle')
  void refreshFiles()
  return { ...res, msg }
}

let currentRun = ''

async function say(bot: Bot, text: string): Promise<void> {
  if (!text || get().settings.muted) return
  setStatus(bot.id, 'speaking')
  await speak(text, bot.voiceId)
  setStatus(bot.id, 'idle')
}

// ------------------------------------------------------------ direct chat

async function sendDirect(bot: Bot, text: string): Promise<void> {
  const room = bot.id
  addMsg(room, { role: 'user', text })
  set((s) => ({ busy: { ...s.busy, [room]: true } }))
  stopFlag = false
  const res = await runTurn(room, bot, text, bot.sessionId)
  if (res.sessionId && res.sessionId !== bot.sessionId) {
    const bots = await api.bots.save({ ...bot, sessionId: res.sessionId })
    set({ bots })
  }
  set((s) => ({ busy: { ...s.busy, [room]: false } }))
  if (!stopFlag) await say(bot, res.text)
}

// ------------------------------------------------------------- the swarm

function transcript(from: number): string {
  const bots = get().bots
  return (get().msgs.crew ?? [])
    .slice(from)
    .filter((m) => m.role !== 'note' && m.text.trim() && !m.streaming)
    .slice(-14)
    .map((m) => {
      const who = m.role === 'user' ? 'The person' : (bots.find((b) => b.id === m.botId)?.name ?? 'Bot')
      const text = m.text.trim()
      return `${who}: ${text.length > 700 ? '…' + text.slice(-700) : text}`
    })
    .join('\n\n')
}

function turnPrompt(bot: Bot, crew: Bot[], task: string, from: number, branch: string | null, turn: number, last: boolean): string {
  const roster = crew.map((b) => `- ${b.name} (${b.pronouns}): ${b.task}`).join('\n')
  const work = branch
    ? `You are on git branch "${branch}" in the crew's shared repo; every earlier turn is already merged into it. Do your part of the task now and change real files. Do not commit, push or switch branches: when you finish, Oliver commits your branch and opens your pull request.
Then end with your spoken update to the crew: what you did and what should happen next.${
        last ? ' This is the last turn, so leave things working.' : ''
      } If the whole task is finished and nothing is left to do, put the single word DONE on its own last line.`
    : `This is a round-table: just talk. Answer the person in your own voice, add something the others have not said, and keep it short.`
  return `CREW TASK from the person: ${task}

The crew, in speaking order:
${roster}

What has been said so far:
${transcript(from) || '(nothing yet, you go first)'}

It is your turn, ${bot.name} (turn ${turn}). ${work}`
}

async function swarm(task: string): Promise<void> {
  const s = get()
  const crew = s.bots.filter((b) => b.inCrew)
  if (!crew.length) {
    toast('Nobody is in the crew. Turn a bot on in the left rail.')
    return
  }
  const git = s.settings.swarm
  const from = (s.msgs.crew ?? []).length
  addMsg('crew', { role: 'user', text: task })
  const rounds = git ? Math.max(1, s.settings.rounds) : 1
  set((st) => ({
    busy: { ...st.busy, crew: true },
    swarm: { task, running: true, git, order: crew.map((b) => b.id), current: 0, round: 1, rounds, turn: 0, from },
    ...(git ? { rightTab: 'swarm' as const, rightOpen: true } : {})
  }))
  stopFlag = false
  const stamp = Date.now().toString(36).slice(-4)
  const done = new Set<string>()
  let turn = 0

  outer: for (let round = 1; round <= rounds; round++) {
    for (let i = 0; i < crew.length; i++) {
      if (stopFlag) break outer
      // Pick up edits to the bot made while the swarm runs.
      const bot = get().bots.find((b) => b.id === crew[i].id) ?? crew[i]
      turn++
      set((st) => ({ swarm: st.swarm && { ...st.swarm, current: i, round, turn } }))
      crew.forEach((b, j) => setStatus(b.id, j === i ? 'thinking' : 'waiting'))

      let begin: { base: string; baseSha: string } | null = null
      const branch = `turn-${turn}-${bot.id}-${stamp}`
      if (git) {
        try {
          begin = await api.git.beginTurn(branch)
        } catch (e) {
          addMsg('crew', { role: 'note', text: `Git turn could not start: ${(e as Error).message}` })
        }
      }
      const last = round === rounds && i === crew.length - 1
      const res = await runTurn('crew', bot, turnPrompt(bot, crew, task, from, begin ? branch : null, turn, last), undefined, turn)

      if (begin) {
        try {
          const first = res.text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0] ?? ''
          const pr = await api.git.endTurn({
            branch,
            ...begin,
            botId: bot.id,
            botName: bot.name,
            title: `${bot.name}: ${first.slice(0, 80) || `turn ${turn}`}`,
            body: res.text
          })
          if (pr) {
            patchMsg('crew', res.msg.id, () => ({ pr }))
            await refreshFiles()
            if (pr.status === 'conflict') {
              addMsg('crew', { role: 'note', text: `PR #${pr.id} conflicts with ${pr.base}. It stays open on branch ${pr.branch}.` })
            } else if (pr.status === 'open' && !stopFlag) {
              // The person reviews: the next bot waits for a merge or a no.
              crew.forEach((b) => setStatus(b.id, 'waiting'))
              await new Promise<void>((r) => prWaiters.set(pr.id, r))
            }
          }
        } catch (e) {
          addMsg('crew', { role: 'note', text: `Could not open the pull request: ${(e as Error).message}` })
        }
      }
      if (stopFlag) break outer
      crew.forEach((b, j) => setStatus(b.id, j === i ? 'speaking' : 'waiting'))
      await say(bot, res.text)

      if (/^\s*DONE\.?\s*$/im.test(res.text)) done.add(bot.id)
      else done.clear()
      if (git && done.size >= Math.min(2, crew.length)) break outer
    }
  }
  crew.forEach((b) => setStatus(b.id, 'idle'))
  set((st) => ({ busy: { ...st.busy, crew: false }, swarm: st.swarm && { ...st.swarm, running: false } }))
  void refreshFiles()
}

// ---------------------------------------------------------------- public

/** Sends what the person typed or said to the room they are in. */
export function send(text: string): void {
  text = text.trim()
  if (!text) return
  const s = get()
  if (!s.auth.loggedIn) {
    toast('Connect to Claude first.')
    return
  }
  if (s.room === 'crew') {
    // While the crew is working, a message is heard by the next bot up.
    if (s.busy.crew) addMsg('crew', { role: 'user', text })
    else void swarm(text)
    return
  }
  const bot = s.bots.find((b) => b.id === s.room)
  if (!bot) return
  if (s.busy[bot.id]) {
    toast(`${bot.name} is still working.`)
    return
  }
  void sendDirect(bot, text)
}

export function stop(): void {
  stopFlag = true
  stopSpeaking()
  if (currentRun) void api.agent.stop(currentRun)
  for (const r of prWaiters.values()) r()
  prWaiters.clear()
}

export async function decidePr(pr: PR, merge: boolean): Promise<void> {
  try {
    const next = merge ? await api.git.merge(pr.id) : await api.git.reject(pr.id)
    set((s) => ({
      msgs: { ...s.msgs, crew: (s.msgs.crew ?? []).map((m) => (m.pr?.id === pr.id ? { ...m, pr: next } : m)) }
    }))
    if (next.status === 'conflict') toast(`PR #${pr.id} has a conflict and was not merged.`)
  } catch (e) {
    toast((e as Error).message)
  }
  await refreshFiles()
  prWaiters.get(pr.id)?.()
  prWaiters.delete(pr.id)
}

export function answer(room: string, msgId: string, askId: string, decision: 'allow' | 'always' | 'deny'): void {
  void api.agent.permission(askId, decision)
  patchMsg(room, msgId, (m) => ({
    asks: m.asks.map((a) => (a.id === askId ? { ...a, answer: decision } : a))
  }))
}

/** Mic on: one message, or hands-free back and forth when auto-voice is on. */
export function toggleMic(): void {
  if (mic.on) {
    mic.stop()
    return
  }
  void mic.start((text) => {
    send(text)
    if (!get().settings.autoVoice) mic.stop()
  })
}
