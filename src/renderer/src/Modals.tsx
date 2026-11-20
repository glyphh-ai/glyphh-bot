import { useEffect, useState } from 'react'
import type { Bot, Look } from '../../shared/types'
import { ACCESSORIES, EXTRAS, EYES, HEADS, POSES, TAILS } from '../../shared/types'
import logo from './assets/glyphh-logo-text-white.png'
import { PART_NAMES } from './catArt'
import { Cat, randomLook } from './Cat'
import { api, confirmAsk, get, refreshProbe, set, setSettings, toast, uid, useStore, why } from './store'
import { speak } from './voice'

/** Follows `claude auth login` and notices when the person is signed in. */
export function startAuthEvents(): () => void {
  const off = api.auth.onLog(async (line) => {
    if (line === '__done__' || line === '__failed__') {
      const auth = await api.auth.status()
      set({ auth, loggingIn: false })
      if (auth.loggedIn) void refreshProbe(true)
      else if (line === '__failed__') toast('Claude sign-in did not finish. Try again.')
      return
    }
    set((s) => ({ authLog: [...s.authLog.slice(-20), line] }))
  })
  const poll = setInterval(async () => {
    if (!get().loggingIn) return
    const auth = await api.auth.status()
    if (auth.loggedIn && auth.email !== get().auth.email) {
      set({ auth, loggingIn: false })
      void refreshProbe(true)
    }
  }, 2500)
  return () => {
    off()
    clearInterval(poll)
  }
}

function LoginSteps(): JSX.Element {
  const loggingIn = useStore((s) => s.loggingIn)
  const log = useStore((s) => s.authLog)
  const [code, setCode] = useState('')
  const link = log.join(' ').match(/https:\/\/\S+/)?.[0]
  if (!loggingIn) return <></>
  return (
    <div className="login-steps">
      <p className="dim">Your browser is opening the Claude sign-in page. Sign in there and come back.</p>
      {link && (
        <button className="link" onClick={() => void api.openExternal(link)}>
          Browser did not open? Open the sign-in page
        </button>
      )}
      <div className="row">
        <input value={code} placeholder="If Claude gives you a code, paste it here" onChange={(e) => setCode(e.target.value)} />
        <button
          className="btn ghost"
          disabled={!code.trim()}
          onClick={() => {
            void api.auth.loginInput(code)
            setCode('')
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}

export function LoginGate(): JSX.Element {
  const auth = useStore((s) => s.auth)
  const loggingIn = useStore((s) => s.loggingIn)
  const bots = useStore((s) => s.bots)
  return (
    <div className="gate">
      <div className="gate-card">
        <div className="hero-crew small">
          {bots.slice(0, 5).map((b, i) => (
            <span key={b.id} style={{ animationDelay: `${i * 0.25}s` }}>
              <Cat look={b.look} size={64} mode="full" />
            </span>
          ))}
        </div>
        <h1 className="gate-brand">
          <img src={logo} alt="Glyphh" />
          <span>Bot</span>
        </h1>
        <p className="sub">Your crew runs on your own Claude account. Connect it to start.</p>
        {auth.error && <p className="err">{auth.error}</p>}
        <button
          className="btn primary big"
          disabled={loggingIn}
          onClick={() => {
            set({ loggingIn: true, authLog: [] })
            void api.auth.login()
          }}
        >
          {loggingIn ? 'Waiting for Claude…' : 'Connect to Claude'}
        </button>
        <LoginSteps />
        <button className="link" onClick={async () => set({ auth: await api.auth.status() })}>
          I already signed in, check again
        </button>
      </div>
    </div>
  )
}

function Modal({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }): JSX.Element {
  return (
    <div className="veil" onMouseDown={(e) => e.target === e.currentTarget && set({ modal: null })}>
      <div className={wide ? 'modal wide' : 'modal'}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon" onClick={() => set({ modal: null })}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function SettingsModal(): JSX.Element {
  const s = useStore((st) => st.settings)
  const [key, setKey] = useState('')
  const [path, setPath] = useState(s.claudePath)

  const saveKey = async (value: string): Promise<void> => {
    set({ settings: await api.settings.setElevenKey(value) })
    setKey('')
    try {
      set({ voices: await api.voice.voices() })
      toast(value ? 'ElevenLabs key saved.' : 'Key removed.')
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <Modal title="Settings">
      <div className="form">
        <h3>Voice</h3>
        <label>
          ElevenLabs API key
          <small>
            {s.elevenKeySource === 'settings'
              ? 'Using the key you saved here.'
              : s.elevenKeySource === 'glyphh'
                ? 'Using the key from glyphh/server/.env. Paste one here to use your own.'
                : 'No key found. Bots stay quiet until you add one.'}
          </small>
          <div className="row">
            <input type="password" value={key} placeholder="sk_…" onChange={(e) => setKey(e.target.value)} />
            <button className="btn" disabled={!key.trim()} onClick={() => void saveKey(key)}>
              Save
            </button>
            {s.elevenKeySource === 'settings' && (
              <button className="btn ghost danger" onClick={() => void saveKey('')}>
                Remove
              </button>
            )}
          </div>
        </label>
        <label>
          Voice model
          <select value={s.ttsModel} onChange={(e) => void setSettings({ ttsModel: e.target.value })}>
            <option value="eleven_flash_v2_5">Flash 2.5 (fastest)</option>
            <option value="eleven_turbo_v2_5">Turbo 2.5</option>
            <option value="eleven_multilingual_v2">Multilingual 2 (richest)</option>
          </select>
        </label>

        <h3>Swarm</h3>
        <label className="check">
          <input type="checkbox" checked={s.autoMergePRs} onChange={(e) => void setSettings({ autoMergePRs: e.target.checked })} />
          <span>
            Merge each bot's pull request by itself
            <small>Off: the next bot waits until you merge or reject.</small>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={s.pushPRs} onChange={(e) => void setSettings({ pushPRs: e.target.checked })} />
          <span>
            Also open the pull requests on GitHub
            <small>Pushes each turn's branch to the folder's origin with the gh CLI. Off: everything stays on this Mac.</small>
          </span>
        </label>

        <h3>Claude</h3>
        <label>
          Claude CLI
          <small>{s.claudeFound ? `Found at ${s.claudeFound}` : 'Not found. Install Claude Code or set the path.'}</small>
          <div className="row">
            <input value={path} placeholder="/opt/homebrew/bin/claude" onChange={(e) => setPath(e.target.value)} />
            <button className="btn ghost" onClick={() => void setSettings({ claudePath: path.trim() })}>
              Set
            </button>
          </div>
        </label>
      </div>
    </Modal>
  )
}

const BLANK: Bot = {
  id: '',
  name: '',
  pronouns: 'they/them',
  tagline: '',
  personality: '',
  task: '',
  look: randomLook(),
  voiceId: '',
  voiceName: '',
  model: '',
  connectors: 'all',
  inCrew: true
}

const PARTS = [
  { key: 'head', list: HEADS },
  { key: 'tail', list: TAILS },
  { key: 'eye', list: EYES },
  { key: 'extra', list: EXTRAS },
  { key: 'accessory', list: ACCESSORIES },
  { key: 'pose', list: POSES }
] as const

/** Asks yes or no in the app's own style (store.confirmAsk). */
export function ConfirmModal(): JSX.Element | null {
  const c = useStore((s) => s.confirm)
  useEffect(() => {
    if (!c) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' && e.key !== 'Enter') return
      e.preventDefault()
      e.stopPropagation()
      answer(e.key === 'Enter')
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [c])
  if (!c) return null
  function answer(ok: boolean): void {
    set({ confirm: null })
    c!.resolve(ok)
  }
  return (
    <div className="veil front" onMouseDown={(e) => e.target === e.currentTarget && answer(false)}>
      <div className={`modal confirm ${c.danger ? 'danger' : ''}`} role="alertdialog">
        <h2>{c.title}</h2>
        {c.body && <p className="dim">{c.body}</p>}
        <div className="row end">
          <button className="btn" onClick={() => answer(false)}>
            Cancel
          </button>
          <button className={c.danger ? 'btn danger solid' : 'btn primary'} autoFocus onClick={() => answer(true)}>
            {c.yes}
          </button>
        </div>
      </div>
    </div>
  )
}

export function BotEditor({ bot }: { bot: Bot | null }): JSX.Element {
  const voices = useStore((s) => s.voices)
  const probe = useStore((s) => s.probe)
  const [b, setB] = useState<Bot>(() => bot ?? { ...BLANK, id: uid(), look: randomLook() })
  const [idea, setIdea] = useState('')
  const [making, setMaking] = useState(false)
  const look = (patch: Partial<Look>): void => setB((x) => ({ ...x, look: { ...x.look, ...patch } }))

  useEffect(() => {
    if (!b.voiceId && voices[0]) setB((x) => ({ ...x, voiceId: voices[0].id, voiceName: voices[0].name }))
  }, [voices])

  const make = async (): Promise<void> => {
    if (!idea.trim()) return
    setMaking(true)
    try {
      const made = await api.bots.generate(idea, voices)
      setB((x) => ({ ...x, ...made }))
    } catch (e) {
      toast(why(e))
    } finally {
      setMaking(false)
    }
  }

  const save = async (): Promise<void> => {
    if (!b.name.trim()) {
      toast('Give your bot a name.')
      return
    }
    set({ bots: await api.bots.save(b), modal: null })
  }

  const connectors = probe?.connectors ?? []
  const allowed = (name: string): boolean => b.connectors === 'all' || b.connectors.includes(name)
  const toggle = (name: string): void => {
    const names = connectors.map((c) => c.name)
    const now = b.connectors === 'all' ? names : b.connectors
    const next = now.includes(name) ? now.filter((n) => n !== name) : [...now, name]
    setB({ ...b, connectors: next.length === names.length ? 'all' : next })
  }

  return (
    <Modal title={bot ? `Edit ${bot.name}` : 'New bot'} wide>
      <div className="botedit">
        <div className="preview">
          <Cat look={b.look} size={190} mode="full" />
          <b>{b.name || 'Your bot'}</b>
          <small>{b.tagline || b.pronouns}</small>
          <button className="btn ghost" onClick={() => look(randomLook())}>
            Shuffle the cat
          </button>
        </div>

        <div className="form">
          <label>
            Describe your bot and Claude makes it
            <div className="row">
              <input
                value={idea}
                placeholder="a careful tester who checks every page on a phone"
                onChange={(e) => setIdea(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void make()}
              />
              <button className="btn" disabled={making || !idea.trim()} onClick={() => void make()}>
                {making ? 'Making…' : 'Make it'}
              </button>
            </div>
          </label>

          <div className="two">
            <label>
              Name
              <input value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} />
            </label>
            <label>
              Pronouns
              <input value={b.pronouns} onChange={(e) => setB({ ...b, pronouns: e.target.value })} />
            </label>
          </div>
          <label>
            Tagline
            <input value={b.tagline} onChange={(e) => setB({ ...b, tagline: e.target.value })} />
          </label>
          <label>
            Personality
            <textarea rows={2} value={b.personality} onChange={(e) => setB({ ...b, personality: e.target.value })} />
          </label>
          <label>
            Task
            <textarea rows={2} value={b.task} placeholder="What this bot does for the crew" onChange={(e) => setB({ ...b, task: e.target.value })} />
          </label>

          <div className="two">
            <label>
              Voice
              <div className="row">
                <select
                  value={b.voiceId}
                  onChange={(e) => {
                    const v = voices.find((x) => x.id === e.target.value)
                    setB({ ...b, voiceId: e.target.value, voiceName: v?.name ?? '' })
                  }}
                >
                  {!voices.some((v) => v.id === b.voiceId) && <option value={b.voiceId}>{b.voiceName || 'Pick a voice'}</option>}
                  {voices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} {v.desc ? `(${v.desc})` : ''}
                    </option>
                  ))}
                </select>
                <button
                  className="btn ghost"
                  disabled={!b.voiceId}
                  onClick={() => void speak(`Hey, I'm ${b.name || 'your new bot'}. ${b.tagline}`, b.voiceId)}
                >
                  ▶
                </button>
              </div>
            </label>
            <label>
              Model
              <select value={b.model} onChange={(e) => setB({ ...b, model: e.target.value })}>
                {(probe?.models ?? [{ value: '', label: 'Default' }]).map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.value ? m.label : 'Same as the app'}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>Look</label>
          <div className="looks">
            {PARTS.map((p) => (
              <select key={p.key} value={b.look[p.key]} onChange={(e) => look({ [p.key]: e.target.value } as Partial<Look>)}>
                {p.list.map((m) => (
                  <option key={m} value={m}>
                    {(PART_NAMES[p.key] as Record<string, string>)[m] ?? m}
                  </option>
                ))}
              </select>
            ))}
          </div>

          <label>Connectors this bot can use</label>
          <div className="swatches">
            {connectors.length === 0 && <small className="dim">All of your Claude connectors.</small>}
            {connectors.map((c) => (
              <button key={c.name} className={allowed(c.name) ? 'pill on' : 'pill'} onClick={() => toggle(c.name)}>
                {c.name.replace(/^claude\.ai /, '')}
              </button>
            ))}
          </div>

          <div className="row end">
            {bot && (
              <button
                className="btn ghost danger"
                onClick={async () => {
                  if (!(await confirmAsk({ title: `Delete ${bot.name}?`, body: 'The bot and its chat go. Your files stay.', yes: 'Delete', danger: true })))
                    return
                  set({ bots: await api.bots.remove(bot.id), modal: null, room: 'crew' })
                }}
              >
                Delete bot
              </button>
            )}
            {bot?.sessionId && (
              <button
                className="btn ghost"
                title="Start the direct chat over"
                onClick={() => {
                  setB({ ...b, sessionId: undefined })
                  set((s) => ({ msgs: { ...s.msgs, [bot.id]: [] } }))
                  toast('Memory of your chat cleared when you save.')
                }}
              >
                Forget our chat
              </button>
            )}
            <button className="btn primary" onClick={() => void save()}>
              Save bot
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
