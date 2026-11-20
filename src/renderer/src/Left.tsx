import { useEffect, useState } from 'react'
import { connectorLabel } from '../../shared/connectors'
import { botPanel } from '../../shared/layouts'
import { Cat } from './Cat'
import { Icon, ICON } from './Menu'
import { api, browse, confirmAsk, openPanel, refreshProbe, set, toast, useStore } from './store'

const CONNECTORS_URL = 'https://claude.ai/settings/connectors'

const icons = new Map<string, Promise<string | null>>()

/** A connector's service icon, as Claude shows it (cached on disk by the main process); a letter tile when there is none. */
export function ConnectorIcon({ name, domain, size = 20 }: { name: string; domain?: string; size?: number }): JSX.Element {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    if (!domain) return
    let p = icons.get(domain)
    if (!p) {
      p = api.claude.icon(domain).catch(() => null)
      icons.set(domain, p)
    }
    let live = true
    void p.then((s) => live && setSrc(s))
    return () => {
      live = false
    }
  }, [domain])
  return src ? (
    <img className="cicon" src={src} width={size} height={size} alt="" />
  ) : (
    <span className="cicon blank" style={{ width: size, height: size }}>
      {connectorLabel(name).replace(/[^a-z0-9]/gi, '').charAt(0).toUpperCase() || '?'}
    </span>
  )
}

const STATUS_LABEL = { idle: '', thinking: 'working', speaking: 'talking', waiting: 'waiting' } as const

/** Show a room in the chat (putting the chat back if another panel fills the desk). */
function goRoom(room: string): void {
  set({ room, commandOpen: false })
  openPanel('chat')
}

function Bots(): JSX.Element {
  const bots = useStore((s) => s.bots)
  const room = useStore((s) => s.room)
  const status = useStore((s) => s.status)
  const crew = bots.filter((b) => b.inCrew)

  return (
    <div className="rail-scroll">
      <button className={room === 'crew' ? 'bot crew on' : 'bot crew'} onClick={() => goRoom('crew')}>
        <div className="stack">
          {crew.slice(0, 4).map((b) => (
            <span key={b.id} className="mini">
              <Cat look={b.look} size={26} />
            </span>
          ))}
        </div>
        <div className="meta">
          <b>The Crew</b>
          <small>{crew.length ? `${crew.length} bots, taking turns` : 'nobody in yet'}</small>
        </div>
      </button>

      <div className="rail-label">Bots</div>
      {bots.map((b) => {
        const st = status[b.id] ?? 'idle'
        return (
          <div key={b.id} className={`bot ${room === b.id ? 'on' : ''} ${st}`} onClick={() => goRoom(b.id)}>
            <span className="ava">
              <Cat look={b.look} size={44} speaking={st === 'speaking'} busy={st === 'thinking'} />
            </span>
            <div className="meta">
              <b>
                {b.name} <i>{b.pronouns}</i>
              </b>
              <small>{STATUS_LABEL[st] || b.tagline}</small>
            </div>
            <div className="bot-actions">
              <button
                className={b.inCrew ? 'pill on' : 'pill'}
                title={b.inCrew ? 'In the crew: click to bench' : 'Benched: click to add to the crew'}
                onClick={async (e) => {
                  e.stopPropagation()
                  set({ bots: await api.bots.save({ ...b, inCrew: !b.inCrew }) })
                }}
              >
                {b.inCrew ? 'crew' : 'bench'}
              </button>
              <button
                className="pill"
                title="Open this bot as its own panel in the layout"
                onClick={(e) => {
                  e.stopPropagation()
                  openPanel(botPanel(b.id))
                }}
              >
                panel
              </button>
              <button
                className="pill"
                title="Edit this bot"
                onClick={(e) => {
                  e.stopPropagation()
                  set({ modal: { kind: 'bot', bot: b } })
                }}
              >
                edit
              </button>
            </div>
          </div>
        )
      })}
      <button className="newbot" onClick={() => set({ modal: { kind: 'bot', bot: null } })}>
        <span>+</span> New bot
      </button>
    </div>
  )
}

function Connections(): JSX.Element {
  const auth = useStore((s) => s.auth)
  const probe = useStore((s) => s.probe)
  const probing = useStore((s) => s.probing)
  const settings = useStore((s) => s.settings)
  const loggingIn = useStore((s) => s.loggingIn)

  const login = (): void => {
    set({ loggingIn: true, authLog: [] })
    void api.auth.login()
  }

  return (
    <div className="rail-scroll">
      {!auth.loggedIn && (
        <>
          <div className="rail-label">Claude</div>
          <div className="card">
            <p className="dim">Not connected. Glyphh Bot uses your own Claude login.</p>
            <button className="btn primary" onClick={login} disabled={loggingIn}>
              {loggingIn ? 'Waiting for Claude…' : 'Connect to Claude'}
            </button>
          </div>
        </>
      )}

      <div className="rail-label">
        Connectors
        <button className="link" disabled={probing || !auth.loggedIn} onClick={() => void refreshProbe(true)}>
          {probing ? 'checking…' : 'refresh'}
        </button>
      </div>
      {!probe && <p className="dim pad">{probing ? 'Asking Claude what is connected…' : 'Connect to Claude to see them.'}</p>}
      {probe?.connectors.length === 0 && <p className="dim pad">No connectors yet.</p>}
      {probe?.connectors.map((c) => (
        <div key={c.name} className="conn" title={c.error ?? c.name}>
          <ConnectorIcon name={c.name} domain={c.domain} />
          <b>{connectorLabel(c.name)}</b>
          <span className={`dot ${c.status === 'connected' ? 'ok' : c.status === 'needs-auth' ? 'warn' : 'bad'}`} />
          <small>{c.status === 'needs-auth' ? 'sign in' : c.status === 'connected' ? 'on' : c.status}</small>
        </div>
      ))}
      <button className="btn wide" onClick={() => browse(CONNECTORS_URL)}>
        + Add connectors
      </button>

      <div className="rail-label">Voice</div>
      <div className="conn">
        <span className={`dot ${settings.elevenKeySource === 'none' ? 'bad' : 'ok'}`} />
        <b>ElevenLabs</b>
        <small>{settings.elevenKeySource === 'settings' ? 'your key' : settings.elevenKeySource === 'glyphh' ? 'glyphh server key' : 'no key'}</small>
      </div>
      <button className="btn wide" onClick={() => set({ modal: { kind: 'settings' } })}>
        Voice settings
      </button>
    </div>
  )
}

export function Left(): JSX.Element {
  const tab = useStore((s) => s.leftTab)
  const auth = useStore((s) => s.auth)
  return (
    <aside className="rail left">
      <div className="tabs">
        <button className={tab === 'bots' ? 'on' : ''} onClick={() => set({ leftTab: 'bots' })}>
          Bots
        </button>
        <button
          className={tab === 'connections' ? 'on' : ''}
          onClick={() => {
            set({ leftTab: 'connections' })
            if (!auth.loggedIn) toast('Connect to Claude to see your connectors.')
          }}
        >
          Connections
        </button>
      </div>
      {tab === 'bots' ? <Bots /> : <Connections />}
      <Account />
    </aside>
  )
}

/** The account button at the foot of the rail: its menu opens upward with the account, Settings, Switch account and Log out. */
function Account(): JSX.Element {
  const auth = useStore((s) => s.auth)
  const loggingIn = useStore((s) => s.loggingIn)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  const name = auth.email ?? 'Not connected'
  const initial = (auth.email ?? '?').charAt(0).toUpperCase()
  const login = (): void => {
    setOpen(false)
    set({ loggingIn: true, authLog: [] })
    void api.auth.login()
  }
  return (
    <div className="account">
      {open && <div className="acc-veil" onMouseDown={() => setOpen(false)} />}
      {open && (
        <div className="acc-menu" role="menu">
          <div className="acc-who">
            <span className="acc-ava big">{initial}</span>
            <div>
              <b>{name}</b>
              <small>
                {auth.loggedIn ? (auth.subscriptionType ? `${auth.subscriptionType} plan` : auth.authMethod ?? 'Claude') : 'Glyphh Bot uses your own Claude login'}
                {auth.orgName ? ` · ${auth.orgName}` : ''}
              </small>
            </div>
          </div>
          <hr />
          <button
            onClick={() => {
              setOpen(false)
              set({ modal: { kind: 'settings' } })
            }}
          >
            <Icon d={ICON.settings} size={15} /> Settings
          </button>
          <button onClick={login} disabled={loggingIn}>
            <Icon d={ICON.refresh} size={15} /> {auth.loggedIn ? 'Switch account' : 'Connect to Claude'}
          </button>
          {auth.loggedIn && (
            <button
              className="danger"
              onClick={async () => {
                setOpen(false)
                const ok = await confirmAsk({
                  title: 'Log out of Claude?',
                  body: `Glyphh Bot stops using ${name} until you connect again.`,
                  yes: 'Log out',
                  danger: true
                })
                if (ok) set({ auth: await api.auth.logout(), probe: null })
              }}
            >
              <Icon d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" size={15} /> Log out
            </button>
          )}
        </div>
      )}
      <button className={`acc-btn ${open ? 'on' : ''}`} title={name} onClick={() => setOpen(!open)}>
        <span className="acc-ava">{initial}</span>
        <span className="acc-name">{name}</span>
        {auth.subscriptionType && <span className="plan">{auth.subscriptionType}</span>}
        <span className="acc-caret dim">▴</span>
      </button>
    </div>
  )
}
