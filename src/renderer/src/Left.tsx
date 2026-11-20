import { Horse } from './Horse'
import { api, refreshProbe, set, toast, useStore } from './store'

const STATUS_LABEL = { idle: '', thinking: 'working', speaking: 'talking', waiting: 'waiting' } as const

function Bots(): JSX.Element {
  const bots = useStore((s) => s.bots)
  const room = useStore((s) => s.room)
  const status = useStore((s) => s.status)
  const crew = bots.filter((b) => b.inCrew)

  return (
    <div className="rail-scroll">
      <button className={room === 'crew' ? 'bot crew on' : 'bot crew'} onClick={() => set({ room: 'crew' })}>
        <div className="stack">
          {crew.slice(0, 4).map((b) => (
            <span key={b.id} className="mini">
              <Horse look={b.look} size={26} />
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
          <div
            key={b.id}
            className={`bot ${room === b.id ? 'on' : ''} ${st}`}
            onClick={() => set({ room: b.id })}
            style={{ ['--accent' as string]: b.look.accent }}
          >
            <span className="ava">
              <Horse look={b.look} size={46} speaking={st === 'speaking'} />
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
      <div className="rail-label">Claude</div>
      <div className="card">
        {auth.loggedIn ? (
          <>
            <div className="acct">
              <span className="dot ok" />
              <div>
                <b>{auth.email}</b>
                <small>
                  {auth.subscriptionType ? `${auth.subscriptionType} plan` : auth.authMethod}
                  {auth.orgName ? ` · ${auth.orgName}` : ''}
                </small>
              </div>
            </div>
            <div className="row">
              <button className="btn ghost" onClick={login} disabled={loggingIn}>
                Switch account
              </button>
              <button
                className="btn ghost"
                onClick={async () => {
                  set({ auth: await api.auth.logout(), probe: null })
                }}
              >
                Log out
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="dim">Not connected. Oliver uses your own Claude login.</p>
            <button className="btn" onClick={login} disabled={loggingIn}>
              {loggingIn ? 'Waiting for Claude…' : 'Connect to Claude'}
            </button>
          </>
        )}
      </div>

      <div className="rail-label">
        Connectors
        <button className="link" disabled={probing || !auth.loggedIn} onClick={() => void refreshProbe(true)}>
          {probing ? 'checking…' : 'refresh'}
        </button>
      </div>
      {!probe && <p className="dim pad">{probing ? 'Asking Claude what is connected…' : 'Connect to Claude to see them.'}</p>}
      {probe?.connectors.length === 0 && <p className="dim pad">No connectors yet.</p>}
      {probe?.connectors.map((c) => (
        <div key={c.name} className="conn" title={c.error}>
          <span className={`dot ${c.status === 'connected' ? 'ok' : c.status === 'needs-auth' ? 'warn' : 'bad'}`} />
          <b>{c.name.replace(/^claude\.ai /, '')}</b>
          <small>{c.status === 'needs-auth' ? 'needs sign-in' : c.status}</small>
        </div>
      ))}
      <button className="btn ghost wide" onClick={() => void api.openExternal('https://claude.ai/settings/connectors')}>
        Add connectors on claude.ai ↗
      </button>

      <div className="rail-label">Voice</div>
      <div className="conn">
        <span className={`dot ${settings.elevenKeySource === 'none' ? 'bad' : 'ok'}`} />
        <b>ElevenLabs</b>
        <small>
          {settings.elevenKeySource === 'settings'
            ? 'your key'
            : settings.elevenKeySource === 'glyphh'
              ? 'glyphh server key'
              : 'no key'}
        </small>
      </div>
      <button className="btn ghost wide" onClick={() => set({ modal: { kind: 'settings' } })}>
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
    </aside>
  )
}
