// Talking and listening. Bots speak through ElevenLabs in their own voice; the
// mic waits for the person to stop talking, then sends what it heard.
import { api, get, set, toast } from './store'

let audio: HTMLAudioElement | null = null
let endSpeech: (() => void) | null = null
let warned = false

function level(v: number): void {
  document.documentElement.style.setProperty('--level', v.toFixed(3))
}

/** Says the text in a voice and resolves when it is finished (or stopped). */
export async function speak(text: string, voiceId: string): Promise<void> {
  if (get().settings.muted || !text.trim()) return
  stopSpeaking()
  mic.paused = true
  try {
    const bytes = await api.voice.tts(text, voiceId)
    if (!bytes.length) return
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'audio/mpeg' }))
    await new Promise<void>((resolve) => {
      audio = new Audio(url)
      endSpeech = resolve
      audio.onended = () => resolve()
      audio.onerror = () => resolve()
      void audio.play().catch(() => resolve())
    })
    URL.revokeObjectURL(url)
  } catch (e) {
    if (!warned) toast((e as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, ''))
    warned = true
  } finally {
    audio = null
    endSpeech = null
    mic.paused = false
  }
}

export function stopSpeaking(): void {
  audio?.pause()
  endSpeech?.()
}

type Heard = (text: string) => void

class Mic {
  paused = false
  private stream: MediaStream | null = null
  private ctx: AudioContext | null = null
  private timer: ReturnType<typeof setInterval> | undefined
  private rec: MediaRecorder | null = null
  private chunks: Blob[] = []
  private started = 0
  private lastVoice = 0
  private floor = 0.01
  private onHeard: Heard = () => {}

  get on(): boolean {
    return !!this.stream
  }

  async start(onHeard: Heard): Promise<void> {
    this.onHeard = onHeard
    if (this.stream) return
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      })
    } catch {
      toast('Glyphh Bot needs the microphone. Allow it in System Settings, Privacy, Microphone.')
      return
    }
    this.ctx = new AudioContext()
    const analyser = this.ctx.createAnalyser()
    analyser.fftSize = 1024
    this.ctx.createMediaStreamSource(this.stream).connect(analyser)
    const buf = new Float32Array(analyser.fftSize)
    set({ listening: true })

    this.timer = setInterval(() => {
      analyser.getFloatTimeDomainData(buf)
      let sum = 0
      for (const v of buf) sum += v * v
      const rms = Math.sqrt(sum / buf.length)
      level(this.paused ? 0 : Math.min(1, rms * 9))
      if (this.paused) {
        if (this.rec) this.finish(false)
        return
      }
      const now = performance.now()
      const threshold = Math.max(0.018, this.floor * 3.2)
      if (!this.rec) {
        // Follow the room's background noise while nobody is talking.
        this.floor = this.floor * 0.95 + rms * 0.05
        if (rms > threshold) this.begin(now)
        return
      }
      if (rms > threshold) this.lastVoice = now
      if (now - this.lastVoice > 1200 || now - this.started > 45000) {
        this.finish(this.lastVoice - this.started > 300)
      }
    }, 50)
  }

  private begin(now: number): void {
    if (!this.stream) return
    this.chunks = []
    this.started = now
    this.lastVoice = now
    this.rec = new MediaRecorder(this.stream)
    this.rec.ondataavailable = (e) => this.chunks.push(e.data)
    this.rec.start()
  }

  private finish(keep: boolean): void {
    const rec = this.rec
    if (!rec) return
    this.rec = null
    rec.onstop = async () => {
      if (!keep) return
      const blob = new Blob(this.chunks, { type: rec.mimeType })
      set({ hearing: true })
      try {
        const text = await api.voice.stt(new Uint8Array(await blob.arrayBuffer()), rec.mimeType)
        // Scribe marks noises like (laughs); a clip that is only noise is not a message.
        if (text.replace(/\([^)]*\)/g, '').trim().length > 1) this.onHeard(text)
      } catch (e) {
        toast((e as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, ''))
      } finally {
        set({ hearing: false })
      }
    }
    rec.stop()
  }

  stop(): void {
    clearInterval(this.timer)
    if (this.rec) this.finish(false)
    this.stream?.getTracks().forEach((t) => t.stop())
    void this.ctx?.close()
    this.stream = null
    this.ctx = null
    level(0)
    set({ listening: false })
  }
}

export const mic = new Mic()
