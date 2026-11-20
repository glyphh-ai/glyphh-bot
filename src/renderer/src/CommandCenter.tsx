// The home screen (the command center): an iOS-style page of icons that
// takes the chat's place when its icon in the top bar (or ⌘K) is pressed.
// One search at the top over everything; then pages of icons (panels, your
// apps, bots and layouts, with Add app last) and dots underneath. A trackpad
// swipe, a drag or the arrow keys turn the page. A panel, bot or app opens
// into the layout on screen (a pinned frame takes it); a layout icon puts
// that layout on screen. Esc, the icon again, or the Chat icon go back.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { normalizeAppUrl, searchApps, type WebApp } from '../../shared/apps'
import { allLayouts, botPanel, frameOf, openPanels, PANELS } from '../../shared/layouts'
import { clampPage, gridFor, keyStep, pageCount, paginate, perPage, swipeStep, turnPage, WheelSwipe } from '../../shared/paging'
import { AppIcon } from './AppIcon'
import { Cat } from './Cat'
import { MiniGrid } from './LayoutManager'
import { Icon, ICON, Menu } from './Menu'
import { PANEL_ICON } from './panelInfo'
import { api, closeAllPanels, closeHome, get, openApp, openCommand, openPanel, refreshFiles, removeApp, saveApp, set, switchLayout, toast, useStore, why } from './store'

interface Tile {
  key: string
  label: string
  sub?: string
  icon: JSX.Element
  /** Words the search also looks at. */
  words?: string
  /** Set for tiles that can be dragged onto a frame. */
  panel?: string
  app?: WebApp
  kind: 'panel' | 'app' | 'bot' | 'layout' | 'add'
  run: () => void
}

type Editing = { app: WebApp | null } | null

/** Add or change an app: its address, a name, the addresses that belong to it, and whether its pages stay in its panel. */
function AppEditor({ app, onClose }: { app: WebApp | null; onClose: () => void }): JSX.Element {
  const [url, setUrl] = useState(app?.url ?? '')
  const [name, setName] = useState(app?.name ?? '')
  const [prefixes, setPrefixes] = useState(app?.prefixes.join('\n') ?? '')
  const [keep, setKeep] = useState(app?.keepInPanel ?? true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const ok = !!normalizeAppUrl(url)
  let origin = ''
  try {
    origin = ok ? new URL(normalizeAppUrl(url)).origin : ''
  } catch {
    origin = ''
  }
  const save = async (): Promise<void> => {
    if (!ok || busy) return
    setBusy(true)
    setErr('')
    try {
      await saveApp({ id: app?.id, url, name, prefixes, keepInPanel: keep })
      onClose()
    } catch (e) {
      setErr(why(e))
      setBusy(false)
    }
  }
  return (
    <div className="veil front" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal appedit" onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onClose())}>
        <div className="modal-head">
          <h2>{app ? `Edit ${app.name}` : 'Add an app'}</h2>
          <button className="icon" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="form">
          <label>
            Web address
            <input autoFocus value={url} placeholder="app.slack.com" spellCheck={false} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save()} />
          </label>
          <label>
            Name <small>Optional: the site's name is used when you leave it empty.</small>
            <input value={name} placeholder="Slack" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save()} />
          </label>
          <label>
            Addresses that belong to it
            <small>One per line. A * in the host stands for any part of it, as in https://*.slack.com. Add the sign-in hosts it needs. Empty means {origin || 'its own site'}.</small>
            <textarea rows={3} value={prefixes} placeholder={origin || 'https://app.slack.com'} spellCheck={false} onChange={(e) => setPrefixes(e.target.value)} />
          </label>
          <label className="check">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
            <span>
              Keep redirects in the panel
              <small>Pages, redirects and new windows at these addresses open in the app's panel, not a new tab or your browser.</small>
            </span>
          </label>
          {err && <p className="err">{err}</p>}
          <div className="row end">
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" disabled={!ok || busy} onClick={() => void save()}>
              {busy ? 'Fetching its icon…' : app ? 'Save' : 'Add app'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function CommandCenter(): JSX.Element {
  const bots = useStore((s) => s.bots)
  const status = useStore((s) => s.status)
  const saved = useStore((s) => s.layouts)
  const layout = useStore((s) => s.layout)
  const apps = useStore((s) => s.apps)
  const target = useStore((s) => s.commandTarget)
  const anyOpen = openPanels(layout).length > 0
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [editing, setEditing] = useState<Editing>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; app: WebApp } | null>(null)
  const [grid, setGrid] = useState({ cols: 6, rows: 3 })
  const input = useRef<HTMLInputElement>(null)
  const area = useRef<HTMLDivElement>(null)
  const wheel = useRef(new WheelSwipe())
  const dragX = useRef<number | null>(null)

  const into = target ?? undefined
  const go = (fn: () => void): void => {
    closeHome()
    fn()
  }

  const tiles = useMemo<Tile[]>(() => {
    const where = (id: string): string | undefined => (frameOf(layout, id) >= 0 ? 'open' : undefined)
    const panels: Tile[] = PANELS.map((p) => ({
      key: p.id,
      label: p.label,
      sub: p.id === 'chat' ? undefined : where(p.id),
      kind: 'panel' as const,
      icon: <Icon d={PANEL_ICON[p.id]!} size={28} />,
      panel: p.id === 'chat' ? undefined : p.id,
      run: () => (p.id === 'chat' ? closeHome() : go(() => openPanel(p.id, into)))
    }))
    const appTiles: Tile[] = apps.map((a) => ({
      key: 'app:' + a.id,
      label: a.name,
      words: a.url,
      kind: 'app' as const,
      app: a,
      icon: <AppIcon app={a} size={60} />,
      run: () => go(() => openApp(a, into))
    }))
    const botTiles: Tile[] = bots.map((b) => ({
      key: botPanel(b.id),
      label: b.name,
      sub: where(botPanel(b.id)) ?? (status[b.id] && status[b.id] !== 'idle' ? status[b.id] : undefined),
      words: `${b.tagline} bot`,
      kind: 'bot' as const,
      icon: <Cat look={b.look} size={46} busy={status[b.id] === 'thinking'} speaking={status[b.id] === 'speaking'} />,
      panel: botPanel(b.id),
      run: () => go(() => openPanel(botPanel(b.id), into))
    }))
    const layoutTiles: Tile[] = allLayouts(saved).map((l) => ({
      key: 'layout:' + l.name,
      label: l.name,
      sub: l.name === layout.name ? 'on screen' : 'layout',
      words: 'layout',
      kind: 'layout' as const,
      icon: <MiniGrid l={l} />,
      run: () => go(() => switchLayout(l.name))
    }))
    return [
      ...panels,
      ...appTiles,
      ...botTiles,
      ...layoutTiles,
      { key: 'add', label: 'Add app', words: 'new web page site', kind: 'add' as const, icon: <Icon d={ICON.plus} size={28} />, run: () => setEditing({ app: null }) }
    ]
  }, [bots, status, saved, layout, apps, target])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return tiles
    const appHits = new Set(searchApps(apps, s).map((a) => a.id))
    const words = s.split(/\s+/)
    return tiles.filter((t) => (t.app ? appHits.has(t.app.id) : words.every((w) => [t.label, t.sub, t.words].some((x) => x?.toLowerCase().includes(w)))))
  }, [tiles, q, apps])

  // As many whole rows as fit, page after page.
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    const fit = (): void => setGrid(gridFor(el.clientWidth, el.clientHeight))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const per = perPage(grid)
  const pages = paginate(shown, per)
  const count = pageCount(shown.length, per)
  useEffect(() => setPage(0), [q])
  useEffect(() => setPage((p) => clampPage(p, count)), [count])
  useEffect(() => input.current?.focus(), [])

  const turn = (step: number): void => {
    if (step) setPage((p) => turnPage(p, count, step))
  }

  const onKey = (e: React.KeyboardEvent): void => {
    if (editing || menu) return
    if (e.key === 'Escape') {
      e.preventDefault()
      if (q) setQ('')
      else closeHome()
      return
    }
    if (e.key === 'Enter' && shown[0]) {
      e.preventDefault()
      ;(pages[page]?.[0] ?? shown[0]).run()
      return
    }
    // Arrows turn the page, unless they are moving the cursor through a search.
    const typing = e.target === input.current && !!q
    const step = typing ? 0 : keyStep(e.key)
    if (step) {
      e.preventDefault()
      turn(step)
    }
  }

  const dock: { label: string; icon: JSX.Element; run: () => void }[] = [
    { label: 'New bot', icon: <Icon d={ICON.plus} size={22} />, run: () => set({ modal: { kind: 'bot', bot: null } }) },
    ...(anyOpen ? [{ label: 'Close all panels', icon: <Icon d={ICON.forward} size={22} />, run: () => closeAllPanels() }] : []),
    {
      label: 'Open folder',
      icon: <Icon d={ICON.folder} size={22} />,
      run: async () => {
        try {
          if (await api.ws.open()) {
            set({ ws: await api.ws.current(), openFiles: [], activeFile: '' })
            await refreshFiles()
          }
        } catch (e) {
          toast(why(e))
        }
      }
    },
    { label: 'Settings', icon: <Icon d={ICON.settings} size={22} />, run: () => set({ modal: { kind: 'settings' } }) }
  ]

  return (
    <div className="home" onKeyDown={onKey} tabIndex={-1}>
      <div className="home-search">
        <Icon d={ICON.search} size={15} />
        <input
          ref={input}
          value={q}
          spellCheck={false}
          placeholder={target !== null ? 'Pick what opens in this frame' : 'Search apps, panels, bots and layouts'}
          onChange={(e) => setQ(e.target.value)}
        />
        {q && (
          <button className="ibtn" title="Clear" onClick={() => setQ('')}>
            ×
          </button>
        )}
      </div>

      <div
        className="home-pages"
        ref={area}
        onWheel={(e) => turn(wheel.current.push(e.deltaX, e.deltaY, performance.now()))}
        onMouseDown={(e) => {
          if (e.button === 0 && !(e.target as HTMLElement).closest('.home-tile')) dragX.current = e.clientX
        }}
        onMouseUp={(e) => {
          if (dragX.current !== null) turn(swipeStep(e.clientX - dragX.current))
          dragX.current = null
        }}
        onMouseLeave={() => (dragX.current = null)}
      >
        {!shown.length && <p className="dim pad home-none">Nothing matches “{q}”.</p>}
        <div className="home-track" style={{ transform: `translateX(${-page * 100}%)` }}>
          {pages.map((items, i) => (
            <div key={i} className="home-page" style={{ gridTemplateColumns: `repeat(${grid.cols}, 104px)`, gridTemplateRows: `repeat(${grid.rows}, 112px)` }} aria-hidden={i !== page}>
              {items.map((t) => (
                <div key={t.key} className={`home-tile k-${t.kind}`}>
                  <button
                    className="home-btn"
                    tabIndex={i === page ? 0 : -1}
                    title={t.app ? t.app.url : t.kind === 'layout' ? `Put the ${t.label} layout on screen` : t.panel ? 'Click to open, or drag it onto a frame' : t.label}
                    draggable={!!t.panel}
                    onDragStart={(e) => {
                      if (!t.panel) return
                      e.dataTransfer.setData('text/gb-panel', t.panel)
                      e.dataTransfer.effectAllowed = 'copyMove'
                    }}
                    onContextMenu={(e) => {
                      if (!t.app) return
                      e.preventDefault()
                      setMenu({ x: e.clientX, y: e.clientY, app: t.app })
                    }}
                    onClick={t.run}
                  >
                    <span className="home-ico">{t.icon}</span>
                    <span className="home-name">{t.label}</span>
                    {t.sub && <small>{t.sub}</small>}
                  </button>
                  {t.app && (
                    <>
                      <button className="home-x" title={`Remove ${t.app.name}`} onClick={() => void removeApp(t.app!)}>
                        ×
                      </button>
                      <button className="home-ed" title={`Edit ${t.app.name}`} onClick={() => setEditing({ app: t.app! })}>
                        <Icon d={ICON.edit} size={11} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="home-dots" role="tablist">
        {count > 1 &&
          Array.from({ length: count }, (_, i) => (
            <button key={i} className={i === page ? 'on' : ''} title={`Page ${i + 1}`} aria-selected={i === page} onClick={() => setPage(i)} />
          ))}
      </div>

      <div className="home-dock">
        {dock.map((d) => (
          <button key={d.label} className="home-dockbtn" onClick={() => void d.run()} title={d.label}>
            <span className="home-ico sm">{d.icon}</span>
            <span>{d.label}</span>
          </button>
        ))}
      </div>

      {menu && (
        <Menu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Open', onPick: () => go(() => openApp(menu.app, into)) },
            { label: 'Edit…', onPick: () => setEditing({ app: menu.app }) },
            { label: 'Remove…', danger: true, onPick: () => void removeApp(menu.app) }
          ]}
        />
      )}
      {editing && <AppEditor app={editing.app} onClose={() => setEditing(null)} />}
    </div>
  )
}

/** ⌘K anywhere shows and hides the home screen. */
export function startCommandKey(): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      if (get().commandOpen) closeHome()
      else openCommand(null)
    } else if (e.key === 'Escape' && get().commandOpen && !get().modal && !get().confirm && !document.querySelector('.veil, .ctxmenu')) {
      // Esc from anywhere goes back to the chat (the home screen's own handler clears a search first).
      if (!(e.target as HTMLElement | null)?.closest?.('.home')) closeHome()
    }
  }
  window.addEventListener('keydown', onKey, true)
  return () => window.removeEventListener('keydown', onKey, true)
}
