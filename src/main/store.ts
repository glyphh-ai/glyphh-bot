import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Bot, Settings } from '../shared/types'

interface Data {
  bots: Bot[]
  settings: Settings
  elevenKey: string
  workspace: string
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
    tagline: 'Makes it look unreal',
    personality:
      'Creative director energy. Obsessed with color, type and vibes. Confident, warm, a little dramatic, says "okay wait" before every good idea.',
    task: 'Design lead: owns the look and feel, layouts, colors, copy tone and anything a person sees.',
    look: {
      coat: '#b8794a',
      mane: '#ff2bd6',
      maneStyle: 'long',
      top: 'crop',
      topColor: '#14101f',
      jeans: 'baggy',
      jeansColor: '#5f7fd0',
      sneakers: '#ffffff',
      accessory: 'choker',
      accent: '#ff2bd6',
      lashes: true,
      blaze: true,
      freckles: false
    },
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
    look: {
      coat: '#4a382c',
      mane: '#0e0e14',
      maneStyle: 'mohawk',
      top: 'hoodie',
      topColor: '#16121f',
      jeans: 'ripped',
      jeansColor: '#34426e',
      sneakers: '#0e0e14',
      accessory: 'headphones',
      accent: '#00e5ff',
      lashes: false,
      blaze: false,
      freckles: false
    },
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
    tagline: 'Knows a guy (the internet)',
    personality:
      'Curious researcher. Calm, dry humor, loves a weird fact. Always checks the source and says what they are not sure about.',
    task: 'Researcher: looks things up, reads docs, uses connectors and the web, brings back what the crew needs to know.',
    look: {
      coat: '#e6dfd2',
      mane: '#7c3aed',
      maneStyle: 'swoosh',
      top: 'bomber',
      topColor: '#2d3a2f',
      jeans: 'skinny',
      jeansColor: '#17171f',
      sneakers: '#ff5a1f',
      accessory: 'septum',
      accent: '#c6ff00',
      lashes: true,
      blaze: false,
      freckles: true
    },
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
      'The skeptic with a soft heart. Skater calm, asks "but does it actually work though", tests everything and gives props when it does.',
    task: 'Tester and reviewer: runs it, breaks it, reviews the last turn and fixes what is wrong.',
    look: {
      coat: '#23232b',
      mane: '#f4f4f5',
      maneStyle: 'buzz',
      top: 'flannel',
      topColor: '#b91c1c',
      jeans: 'shorts',
      jeansColor: '#4b5a8f',
      sneakers: '#ffd60a',
      accessory: 'shades',
      accent: '#ffd60a',
      lashes: false,
      blaze: true,
      freckles: false
    },
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
    tagline: 'Keeps the plot',
    personality:
      'Organizer and hype captain. Bright, quick, zero tolerance for scope creep. Remembers what everybody said and what is still left.',
    task: 'Producer: keeps the plan, writes the notes and README, says what is done and what is next.',
    look: {
      coat: '#e9bd7c',
      mane: '#2b1a12',
      maneStyle: 'braids',
      top: 'jersey',
      topColor: '#3b0764',
      jeans: 'skirt',
      jeansColor: '#17171f',
      sneakers: '#ff3b5c',
      accessory: 'bandana',
      accent: '#ff3b5c',
      lashes: true,
      blaze: false,
      freckles: true
    },
    voiceId: 'FGY2WhTYpPnrIDTdsKH5',
    voiceName: 'Laura',
    model: '',
    connectors: 'all',
    inCrew: true
  }
]

let data: Data | null = null

function file(): string {
  return join(app.getPath('userData'), 'oliver.json')
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
    bots: saved.bots?.length ? saved.bots : DEFAULT_BOTS,
    settings: { ...DEFAULT_SETTINGS, ...(saved.settings ?? {}) },
    elevenKey: saved.elevenKey ?? '',
    workspace: saved.workspace ?? ''
  }
  return data
}

export function save(): void {
  if (!data) return
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(file(), JSON.stringify(data, null, 2), { mode: 0o600 })
}

export function update(fn: (d: Data) => void): Data {
  const d = load()
  fn(d)
  save()
  return d
}
