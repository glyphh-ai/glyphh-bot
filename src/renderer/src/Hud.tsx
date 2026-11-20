import { useEffect, useState } from 'react'
import { useStore } from './store'

/** The rings: ticks and arcs turning at their own speeds, white on black. */
export function Reactor({ size, className = '' }: { size: number; className?: string }): JSX.Element {
  return (
    <svg className={`reactor ${className}`} width={size} height={size} viewBox="0 0 200 200" aria-hidden>
      <g className="r1">
        <circle cx="100" cy="100" r="97" strokeDasharray="1 5" />
      </g>
      <g className="r2">
        <circle cx="100" cy="100" r="88" strokeDasharray="92 22 8 22 40 22" strokeWidth="2.2" />
      </g>
      <g className="r3">
        <circle cx="100" cy="100" r="77" strokeDasharray="3 9" strokeWidth="5" />
      </g>
      <g className="r4">
        <circle cx="100" cy="100" r="66" strokeDasharray="130 40 30 40" />
        <path d="M100 30 L104 38 L96 38 Z M100 170 L104 162 L96 162 Z M30 100 L38 96 L38 104 Z M170 100 L162 96 L162 104 Z" />
      </g>
      <g className="r5">
        <circle cx="100" cy="100" r="54" strokeDasharray="2 4" strokeWidth="3" />
      </g>
      <circle className="r0" cx="100" cy="100" r="44" />
    </svg>
  )
}

function Clock(): JSX.Element {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return <span className="clock">{now.toLocaleTimeString('en-GB')}</span>
}

const MODE = {
  default: 'Ask me',
  acceptEdits: 'Edit freely',
  auto: 'Auto',
  plan: 'Plan only',
  bypassPermissions: 'Never ask'
} as const

/** The status strip along the bottom. */
export function StatusBar(): JSX.Element {
  const auth = useStore((s) => s.auth)
  const settings = useStore((s) => s.settings)
  const bots = useStore((s) => s.bots)
  const status = useStore((s) => s.status)
  const listening = useStore((s) => s.listening)
  const branch = useStore((s) => s.branch)
  const layout = useStore((s) => s.layout.name)
  const connected = useStore((s) => s.probe?.connectors.filter((c) => c.status === 'connected').length)
  const active = Object.values(status).filter((s) => s === 'thinking' || s === 'speaking').length
  return (
    <footer className="statusbar">
      <span className={auth.loggedIn ? 'stat ok' : 'stat bad'}>
        <i /> Claude {auth.loggedIn ? `connected${auth.subscriptionType ? ` · ${auth.subscriptionType}` : ''}` : 'not connected'}
      </span>
      <span className={settings.elevenKeySource === 'none' ? 'stat bad' : 'stat ok'}>
        <i /> Voice {settings.elevenKeySource === 'none' ? 'no key' : settings.muted ? 'off' : 'on'}
      </span>
      <span className={listening ? 'stat hot' : 'stat'}>
        <i /> Mic {listening ? 'open' : 'off'}
      </span>
      <span className="stat">Connectors {connected ?? '-'}</span>
      <span className={settings.permissionMode === 'bypassPermissions' ? 'stat bad' : 'stat'}>
        Permissions {MODE[settings.permissionMode]}
      </span>
      <span className="eq" aria-hidden>
        {Array.from({ length: 24 }, (_, i) => (
          <i key={i} style={{ animationDelay: `${(i * 137) % 900}ms` }} />
        ))}
      </span>
      <span className="stat">Layout {layout}</span>
      <span className="stat">
        Crew {bots.filter((b) => b.inCrew).length}/{bots.length}
        {active ? ` · ${active} working` : ''}
      </span>
      {branch && <span className="stat">⎇ {branch}</span>}
      <Clock />
    </footer>
  )
}
