import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeApps, type WebApp } from '../shared/apps'
import { normalizeCurrent, normalizeSaved, type Layout, type SavedLayout } from '../shared/layouts'
import { normalizeRecents, type Recent } from '../shared/recents'
import { normalizeLook, type Bot, type Settings } from '../shared/types'

interface Data {
  bots: Bot[]
  settings: Settings
  elevenKey: string
  workspace: string
  /** Your own layouts (the built-ins live in shared/layouts.ts). */
  layouts: SavedLayout[]
  /** The layout on screen when the app last closed. */
  layout: Layout | null
  /** Past chats, with their pins and archives. */
  recents: Recent[]
  /** Web pages you added to the home screen. */
  apps: WebApp[]
}

const DEFAULT_SETTINGS: Settings = {
  defaultModel: '',
  permissionMode: 'acceptEdits',
  autoVoice: false,
  muted: false,
  swarm: true,
  rounds: 2,
  autoMergePRs: true,
  pushPRs: false,
  ttsModel: 'eleven_flash_v2_5',
  claudePath: ''
}

const DEFAULT_BOTS: Bot[] = [
  {
    id: 'juno',
    name: 'Juno',
    pronouns: 'she/her',
    tagline: 'Makes it look right',
    personality:
      'Design lead with strong taste. Obsessed with type, spacing and contrast. Confident and warm, says "okay wait" before every good idea.',
    task: 'Design lead: owns the look and feel, layouts, type, copy tone and anything a person sees.',
    look: { head: 'tall', tail: 'curl', eye: 'heart', extra: 'none', accessory: 'bow', pose: 'lean' },
    voiceId: 'cgSgspJ2msm6clMCkdW9',
    voiceName: 'Jessica',
    model: '',
    connectors: 'all',
    inCrew: true
  },
  {
    id: 'dex',
    name: 'Dex',
    pronouns: 'he/him',
    tagline: 'Ships before lunch',
    personality:
      'Builder. Fast, funny, allergic to meetings. Talks like a speedrunner narrating a run. Hypes his teammates and owns his bugs.',
    task: 'Lead builder: writes the code, wires things together, keeps the project running.',
    look: { head: 'spiky', tail: 'bolt', eye: 'big', extra: 'bolt', accessory: 'headphones', pose: 'hop' },
    voiceId: 'TX3LPaxmHKxFdv7VOQHJ',
    voiceName: 'Liam',
    model: '',
    connectors: 'all',
    inCrew: true
  },
  {
    id: 'rio',
    name: 'Rio',
    pronouns: 'they/them',
    tagline: 'Reads the docs',
    personality:
      'Curious researcher. Calm, dry humor, loves a strange fact. Always checks the source and says what they are not sure about.',
    task: 'Researcher: looks things up, reads docs, uses connectors and the web, brings back what the crew needs to know.',
    look: { head: 'round', tail: 'long', eye: 'side', extra: 'antenna', accessory: 'glasses', pose: 'turn' },
    voiceId: 'SAz9YHcvj6GT2YYXdXww',
    voiceName: 'River',
    model: '',
    connectors: 'all',
    inCrew: true
  },
  {
    id: 'koda',
    name: 'Koda',
    pronouns: 'he/they',
    tagline: 'Will find the bug',
    personality:
      'The skeptic with a soft heart. Calm, asks "but does it actually work though", tests everything and gives credit when it does.',
    task: 'Tester and reviewer: runs it, breaks it, reviews the last turn and fixes what is wrong.',
    look: { head: 'folded', tail: 'spike', eye: 'sleepy', extra: 'none', accessory: 'shades', pose: 'stand' },
    voiceId: 'bIHbv24MWmeRgasZH3Fd',
    voiceName: 'Will',
    model: '',
    connectors: 'all',
    inCrew: true
  },
  {
    id: 'mika',
    name: 'Mika',
    pronouns: 'she/they',
    tagline: 'Keeps the plan',
    personality:
      'Organizer. Bright, quick, zero tolerance for scope creep. Remembers what everybody said and what is still left.',
    task: 'Producer: keeps the plan, writes the notes and README, says what is done and what is next.',
    look: { head: 'classic', tail: 'curl', eye: 'star', extra: 'cape', accessory: 'scarf', pose: 'stand' },
    voiceId: 'FGY2WhTYpPnrIDTdsKH5',
    voiceName: 'Laura',
    model: '',
    connectors: 'all',
    inCrew: true
  }
]

let data: Data | null = null

/** GLYPHH_BOT_DATA points the app at another data folder (the screenshot runs use a scratch one). */
export function dataDir(): string {
  return process.env.GLYPHH_BOT_DATA || app.getPath('userData')
}

function file(): string {
  return join(dataDir(), 'glyphh-bot.json')
}

export function load(): Data {
  if (data) return data
  let saved: Partial<Data> = {}
  try {
    if (existsSync(file())) saved = JSON.parse(readFileSync(file(), 'utf8'))
  } catch {
    saved = {}
  }
  data = {
    bots: (saved.bots?.length ? saved.bots : DEFAULT_BOTS).map((b) => ({ ...b, look: normalizeLook(b.look) })),
    settings: { ...DEFAULT_SETTINGS, ...(saved.settings ?? {}) },
    elevenKey: saved.elevenKey ?? '',
    workspace: saved.workspace ?? '',
    layouts: normalizeSaved(saved.layouts),
    layout: normalizeCurrent(saved.layout),
    recents: normalizeRecents(saved.recents),
    apps: normalizeApps(saved.apps)
  }
  return data
}

export function save(): void {
  if (!data) return
  mkdirSync(dataDir(), { recursive: true })
  writeFileSync(file(), JSON.stringify(data, null, 2), { mode: 0o600 })
}

export function update(fn: (d: Data) => void): Data {
  const d = load()
  fn(d)
  save()
  return d
}
