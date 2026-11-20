import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Voice } from '../shared/types'
import { load } from './store'

const API = 'https://api.elevenlabs.io/v1'

/** Where the key comes from when Settings has none: the glyphh server's .env. */
const GLYPHH_ENV = join(homedir(), 'development', 'glyphh', 'server', '.env')

function glyphhKey(): string {
  try {
    if (!existsSync(GLYPHH_ENV)) return ''
    const line = readFileSync(GLYPHH_ENV, 'utf8')
      .split('\n')
      .find((l) => l.trim().startsWith('ELEVENLABS_API_KEY='))
    if (!line) return ''
    return line
      .slice(line.indexOf('=') + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
  } catch {
    return ''
  }
}

export function keySource(): 'settings' | 'glyphh' | 'none' {
  if (load().elevenKey) return 'settings'
  return glyphhKey() ? 'glyphh' : 'none'
}

function key(): string {
  const k = load().elevenKey || glyphhKey()
  if (!k) throw new Error('No ElevenLabs key. Add one in Settings.')
  return k
}

async function fail(res: Response, what: string): Promise<never> {
  let detail = ''
  try {
    const body = await res.json()
    detail = body?.detail?.message ?? body?.detail?.status ?? JSON.stringify(body).slice(0, 200)
  } catch {
    detail = res.statusText
  }
  throw new Error(`ElevenLabs ${what} failed (${res.status}): ${detail}`)
}

/** Text a voice should say: no markdown, and "Glyphh" said as "glyph". */
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'a link')
    .replace(/[*_#>|]/g, '')
    .replace(/^\s*DONE\s*$/gim, '')
    .replace(/glyphh/gi, 'glyph')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1400)
}

export async function tts(text: string, voiceId: string): Promise<Uint8Array> {
  const say = speakable(text)
  if (!say) return new Uint8Array()
  const res = await fetch(`${API}/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key(), 'content-type': 'application/json' },
    body: JSON.stringify({
      text: say,
      model_id: load().settings.ttsModel || 'eleven_flash_v2_5',
      voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.35 }
    })
  })
  if (!res.ok) await fail(res, 'voice')
  return new Uint8Array(await res.arrayBuffer())
}

export async function stt(audio: Uint8Array, mime: string): Promise<string> {
  const form = new FormData()
  form.append('model_id', 'scribe_v1')
  form.append('file', new Blob([audio as BlobPart], { type: mime || 'audio/webm' }), 'speech.webm')
  const res = await fetch(`${API}/speech-to-text`, {
    method: 'POST',
    headers: { 'xi-api-key': key() },
    body: form
  })
  if (!res.ok) await fail(res, 'listening')
  const body = (await res.json()) as { text?: string }
  return (body.text ?? '').trim()
}

export async function voices(): Promise<Voice[]> {
  const res = await fetch(`${API}/voices`, { headers: { 'xi-api-key': key() } })
  if (!res.ok) await fail(res, 'voice list')
  const body = (await res.json()) as {
    voices: { voice_id: string; name: string; labels?: Record<string, string> }[]
  }
  return body.voices.map((v) => ({
    id: v.voice_id,
    name: v.name.split(' - ')[0],
    desc: [v.labels?.gender, v.labels?.age, v.labels?.accent, v.labels?.descriptive]
      .filter(Boolean)
      .join(', ')
  }))
}
