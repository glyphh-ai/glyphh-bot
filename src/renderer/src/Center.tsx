import { useEffect, useRef, useState } from 'react'
import type { Bot, PermissionMode } from '../../shared/types'
import { answer, decidePr, send, stop, toggleMic } from './engine'
import { Horse } from './Horse'
import { Reactor } from './Hud'
import { get, set, setSettings, useStore, type Msg } from './store'
import { stopSpeaking } from './voice'

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Just enough markdown for chat: code, bold, links, headings and line breaks. */
function md(text: string): string {
  return text
    .split(/```/)
    .map((part, i) => {
      if (i % 2) return `<pre>${esc(part.replace(/^[a-z0-9+#-]*\n/i, ''))}</pre>`
      return esc(part)
        .replace(/`([^`\n]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank">$1</a>')
        .replace(/^#{1,4} (.+)$/gm, '<b>$1</b>')
        .replace(/^\s*DONE\.?\s*$/gm, '<span class="done">DONE</span>')
        .replace(/\n/g, '<br/>')
    })
    .join('')
}

const TOOL_ICON: Record<string, string> = {
  Bash: '›_',
  Read: '◎',
  Edit: '✎',
  Write: '✎',
  Grep: '⌕',
  Glob: '⌕',
  WebSearch: '◍',
  WebFetch: '◍',
  Agent: '❖'
}

function Bubble({ m, room, bot }: { m: Msg; room: string; bot?: Bot }): JSX.Element {
  const status = useStore((s) => (bot ? s.status[bot.id] : undefined))
  if (m.role === 'note') return <div className="note">{m.text}</div>
  if (m.role === 'user') {
    return (
      <div className="msg me">
        <div className="bubble">{m.text}</div>
      </div>
    )
  }
  const speaking = status === 'speaking'
  return (
    <div className={`msg bot-msg ${m.streaming ? 'live' : ''}`} style={{ ['--accent' as string]: bot?.look.accent ?? '#a855f7' }}>
      <div className={`face ${speaking ? 'speaking' : ''}`}>
        {bot && <Horse look={bot.look} size={44} speaking={speaking && !m.streaming} />}
      </div>
      <div className="body">
        <div className="who">
          {bot?.name ?? 'Bot'}
          {m.turn ? <span className="turn">turn {m.turn}</span> : null}
          {m.streaming && <span className="typing"><i /><i /><i /></span>}
        </div>
        {m.tools.length > 0 && (
          <div className="tools">
            {m.tools.map((t) => (
              <div key={t.id} className={`tool ${t.status}`} title={t.detail}>
                <span className="ti">{TOOL_ICON[t.name] ?? (t.name.startsWith('mcp__') ? '⚡' : '•')}</span>
                <b>{t.name.startsWith('mcp__') ? t.name.split('__').slice(1).join(' › ') : t.name}</b>
                <span className="td">{t.detail}</span>
              </div>
            ))}
          </div>
        )}
        {m.text && <div className="bubble" dangerouslySetInnerHTML={{ __html: md(m.text) }} />}
        {m.asks.map((a) => (
          <div key={a.id} className={`ask ${a.answer ?? 'open'}`}>
            <div className="ask-head">
              {bot?.name ?? 'The bot'} wants to use <b>{a.tool.replace(/^mcp__/, '').replace(/__/g, ' › ')}</b>
            </div>
            {a.detail && <pre>{a.detail}</pre>}
            {a.reason && <small>{a.reason}</small>}
            {a.answer ? (
              <div className="ask-done">{a.answer === 'deny' ? 'You said no' : a.answer === 'always' ? 'Always allowed' : 'Allowed'}</div>
            ) : (
              <div className="row">
                <button className="btn" onClick={() => answer(room, m.id, a.id, 'allow')}>
                  Allow
                </button>
                {a.canAlways && (
                  <button className="btn ghost" onClick={() => answer(room, m.id, a.id, 'always')}>
                    Always allow
                  </button>
                )}
                <button className="btn ghost danger" onClick={() => answer(room, m.id, a.id, 'deny')}>
                  No
                </button>
              </div>
            )}
          </div>
        ))}
        {m.pr && (
          <div className={`prcard ${m.pr.status}`} onClick={() => set({ rightTab: 'swarm', rightOpen: true })}>
            <span className="prnum">PR #{m.pr.id}</span>
            <span className="prtitle">{m.pr.title}</span>
            <span className="prstat">
              {m.pr.files.length} file{m.pr.files.length === 1 ? '' : 's'}
              <i className="add">+{m.pr.files.reduce((n, f) => n + f.added, 0)}</i>
              <i className="del">-{m.pr.files.reduce((n, f) => n + f.removed, 0)}</i>
            </span>
            {m.pr.status === 'open' ? (
              <span className="row" onClick={(e) => e.stopPropagation()}>
                <button className="btn" onClick={() => void decidePr(m.pr!, true)}>
                  Merge
                </button>
                <button className="btn ghost danger" onClick={() => void decidePr(m.pr!, false)}>
                  Reject
                </button>
              </span>
            ) : (
              <span className={`badge ${m.pr.status}`}>{m.pr.status}</span>
            )}
          </div>
        )}
        {m.error && <div className="err">{m.error}</div>}
      </div>
    </div>
  )
}

/** Who is up, who is waiting: the crew's speaking order. */
function Stage(): JSX.Element | null {
  const swarm = useStore((s) => s.swarm)
  const bots = useStore((s) => s.bots)
  const status = useStore((s) => s.status)
  const crew = swarm?.running ? swarm.order.map((id) => bots.find((b) => b.id === id)!).filter(Boolean) : bots.filter((b) => b.inCrew)
  if (!crew.length) return null
  return (
    <div className="stage">
      <div className="queue">
        {crew.map((b, i) => {
          const st = status[b.id] ?? 'idle'
          return (
            <div key={b.id} className={`seat ${st}`} style={{ ['--accent' as string]: b.look.accent }} title={`${b.name}: ${st}`}>
              <Horse look={b.look} size={38} speaking={st === 'speaking'} />
              <span>{b.name}</span>
              {i < crew.length - 1 && <em>→</em>}
            </div>
          )
        })}
      </div>
      {swarm?.running && (
        <div className="stage-info">
          <b>{swarm.git ? 'Swarm' : 'Round-table'}</b> round {swarm.round}/{swarm.rounds} · turn {swarm.turn}
        </div>
      )}
    </div>
  )
}

const MODES: { value: PermissionMode; label: string; hint: string }[] = [
  { value: 'default', label: 'Ask me', hint: 'Bots ask before they change or run anything' },
  { value: 'acceptEdits', label: 'Edit freely', hint: 'Bots edit files freely and ask before running commands' },
  { value: 'auto', label: 'Auto', hint: 'Claude decides what is safe and asks when unsure' },
  { value: 'plan', label: 'Plan only', hint: 'Bots plan and change nothing' },
  { value: 'bypassPermissions', label: 'YOLO', hint: 'Bots never ask. Only for folders you can afford to lose.' }
]

function Composer({ hero }: { hero: boolean }): JSX.Element {
  const room = useStore((s) => s.room)
  const bots = useStore((s) => s.bots)
  const busy = useStore((s) => !!s.busy[s.room])
  const anySpeaking = useStore((s) => Object.values(s.status).includes('speaking'))
  const settings = useStore((s) => s.settings)
  const models = useStore((s) => s.probe?.models)
  const listening = useStore((s) => s.listening)
  const hearing = useStore((s) => s.hearing)
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const bot = bots.find((b) => b.id === room)

  useEffect(() => {
    ref.current?.focus()
  }, [room])

  const go = (): void => {
    if (!text.trim()) return
    send(text)
    setText('')
  }

  const placeholder = hearing
    ? 'Got it, writing that down…'
    : listening
      ? 'Listening… just talk'
      : room === 'crew'
        ? settings.swarm
          ? 'Give the crew a task…'
          : 'Ask the crew anything…'
        : `Talk to ${bot?.name ?? 'your bot'}…`

  return (
    <div className={hero ? 'composer hero' : 'composer'}>
      <div className={`inputbar ${listening ? 'listening' : ''}`}>
        <button
          className={`orb ${listening ? 'on' : ''} ${hearing ? 'hearing' : ''}`}
          title={listening ? 'Stop listening' : 'Talk'}
          onClick={toggleMic}
        >
          <span className="orb-core" />
          <Reactor size={62} />
          <svg className="mic" viewBox="0 0 24 24" width="20" height="20">
            <path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 0 0-7 0v5A3.5 3.5 0 0 0 12 15Zm6-3.5a6 6 0 0 1-12 0M12 17.5V21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <textarea
          ref={ref}
          rows={1}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              go()
            }
          }}
        />
        {busy || anySpeaking ? (
          <button
            className="send stop"
            title="Stop"
            onClick={() => {
              if (busy) stop()
              else stopSpeaking()
            }}
          >
            ■
          </button>
        ) : (
          <button className="send" title="Send" onClick={go} disabled={!text.trim()}>
            ↑
          </button>
        )}
      </div>

      <div className="controls">
        <button
          className={settings.autoVoice ? 'ctl on' : 'ctl'}
          title="Hands-free: the mic opens again after every answer"
          onClick={() => {
            const on = !settings.autoVoice
            void setSettings({ autoVoice: on })
            if (on && !get().listening) toggleMic()
          }}
        >
          <i className="led" /> Auto-voice
        </button>
        <button
          className={settings.muted ? 'ctl' : 'ctl on'}
          title="Bots talk out loud"
          onClick={() => {
            if (!settings.muted) stopSpeaking()
            void setSettings({ muted: !settings.muted })
          }}
        >
          <i className="led" /> {settings.muted ? 'Voices off' : 'Voices on'}
        </button>
        {room === 'crew' && (
          <>
            <button
              className={settings.swarm ? 'ctl on hot' : 'ctl'}
              title="Swarm: the crew builds it in turns, one git branch and pull request per turn. Off: they just talk it over."
              onClick={() => void setSettings({ swarm: !settings.swarm })}
            >
              <i className="led" /> Swarm
            </button>
            {settings.swarm && (
              <label className="ctl sel" title="How many times around the crew">
                Rounds
                <select value={settings.rounds} onChange={(e) => void setSettings({ rounds: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
        <label className="ctl sel" title="The model bots use unless a bot has its own">
          Model
          <select value={settings.defaultModel} onChange={(e) => void setSettings({ defaultModel: e.target.value })}>
            {(models ?? [{ value: '', label: 'Default' }]).map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className={`ctl sel ${settings.permissionMode === 'bypassPermissions' ? 'warn' : ''}`} title={MODES.find((m) => m.value === settings.permissionMode)?.hint}>
          Permissions
          <select value={settings.permissionMode} onChange={(e) => void setSettings({ permissionMode: e.target.value as PermissionMode })}>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
}

const IDEAS = [
  'Build a one-page site for our school club',
  'Make a tiny browser game with a high score',
  'Plan and write a study guide for my next test'
]

export function Center(): JSX.Element {
  const room = useStore((s) => s.room)
  const bots = useStore((s) => s.bots)
  const msgs = useStore((s) => s.msgs[s.room]) ?? []
  const scroller = useRef<HTMLDivElement>(null)
  const bot = bots.find((b) => b.id === room)
  const hero = msgs.length === 0

  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs])

  return (
    <section className="center">
      <div className="room-head">
        {room === 'crew' ? (
          <Stage />
        ) : (
          bot && (
            <div className="solo" style={{ ['--accent' as string]: bot.look.accent }}>
              <b>{bot.name}</b>
              <span>{bot.pronouns}</span>
              <small>{bot.task}</small>
            </div>
          )
        )}
      </div>

      {hero ? (
        <div className="hero-wrap">
          <Reactor size={620} className="backdrop" />
          {room === 'crew' ? (
            <div className="hero-crew">
              {bots
                .filter((b) => b.inCrew)
                .map((b, i) => (
                  <span key={b.id} style={{ animationDelay: `${i * 0.25}s` }}>
                    <Horse look={b.look} size={118} mode="full" />
                  </span>
                ))}
            </div>
          ) : (
            bot && (
              <div className="hero-crew solo-hero">
                <span>
                  <Horse look={bot.look} size={150} mode="full" />
                </span>
              </div>
            )
          )}
          <div className="floor" />
          <h1 className="glitch" data-text={room === 'crew' ? 'What are we making?' : `Yo, it's ${bot?.name}.`}>
            {room === 'crew' ? (
              <>
                What are we <mark>making?</mark>
              </>
            ) : (
              <>
                Yo, it's <mark>{bot?.name}.</mark>
              </>
            )}
          </h1>
          <p className="sub">
            {room === 'crew' ? 'Say it or type it. The crew takes turns, out loud.' : bot?.tagline}
          </p>
          <Composer hero />
          {room === 'crew' && (
            <div className="ideas">
              {IDEAS.map((t) => (
                <button key={t} onClick={() => send(t)}>
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="chat" ref={scroller}>
            {msgs.map((m) => (
              <Bubble key={m.id} m={m} room={room} bot={bots.find((b) => b.id === m.botId)} />
            ))}
          </div>
          <Composer hero={false} />
        </>
      )}
    </section>
  )
}
