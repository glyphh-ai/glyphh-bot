// The command center (⌘K): a home screen of icons, like Glyphh OS's Apps
// sheet (glyphh/os app.js openLauncher). Panels, bots and layouts as tiles,
// one search over all of them, arrow keys and Enter, and a dock of actions.
// A panel or a bot opens into the layout on screen (or into the cell that
// asked); a tile can also be dragged straight onto a cell.
import { useEffect, useMemo, useRef, useState } from 'react'
import { allLayouts, botPanel, frameOf, openPanels, PANELS } from '../../shared/layouts'
import mascot from './assets/glyphh-mascot.png'
import { Cat } from './Cat'
import { MiniGrid } from './LayoutManager'
import { Icon, ICON } from './Menu'
import { PANEL_ICON } from './panelInfo'
import { api, closeAllPanels, get, openPanel, refreshFiles, set, switchLayout, toast, useStore, why } from './store'

interface Tile {
  key: string
  label: string
  sub?: string
  group: 'Panels' | 'Bots' | 'Layouts'
  icon: JSX.Element
  /** Set for tiles that can be dragged onto a cell. */
  panel?: string
  run: () => void
}

const GROUPS = ['Panels', 'Bots', 'Layouts'] as const

export function CommandCenter(): JSX.Element {
  const bots = useStore((s) => s.bots)
  const status = useStore((s) => s.status)
  const saved = useStore((s) => s.layouts)
  const layout = useStore((s) => s.layout)
  const target = useStore((s) => s.commandTarget)
  const anyOpen = openPanels(layout).length > 0
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  const close = (): void => set({ commandOpen: false, commandTarget: null })
  const open = (panel: string): void => {
    close()
    openPanel(panel, target ?? undefined)
  }

  const tiles = useMemo<Tile[]>(() => {
    const where = (id: string): string | undefined => (id === 'chat' || frameOf(layout, id) >= 0 ? 'open' : undefined)
    return [
      ...PANELS.map((p) => ({
        key: p.id,
        label: p.id === 'chat' ? 'Chat' : p.label,
        sub: where(p.id),
        group: 'Panels' as const,
        icon: <Icon d={PANEL_ICON[p.id]!} size={26} />,
        panel: p.id,
        run: () => open(p.id)
      })),
      ...bots.map((b) => ({
        key: botPanel(b.id),
        label: b.name,
        sub: where(botPanel(b.id)) ?? (status[b.id] && status[b.id] !== 'idle' ? status[b.id] : b.tagline),
        group: 'Bots' as const,
        icon: <Cat look={b.look} size={40} busy={status[b.id] === 'thinking'} speaking={status[b.id] === 'speaking'} />,
        panel: botPanel(b.id),
        run: () => open(botPanel(b.id))
      })),
      ...allLayouts(saved).map((l) => ({
        key: 'layout:' + l.name,
        label: l.name,
        sub: l.name === layout.name ? 'on screen' : undefined,
        group: 'Layouts' as const,
        icon: <MiniGrid l={l} />,
        run: () => {
          close()
          switchLayout(l.name)
        }
      }))
    ]
  }, [bots, status, saved, layout, target])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? tiles.filter((t) => [t.label, t.sub, t.group, t.key].some((x) => x?.toLowerCase().includes(s))) : tiles
  }, [tiles, q])

  useEffect(() => setSel(0), [q])
  useEffect(() => input.current?.focus(), [])

  // Arrow keys move through the grid by rows of the visible tiles.
  const perRow = 6
  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      shown[sel]?.run()
    } else if (e.key === 'ArrowRight') setSel((i) => Math.min(shown.length - 1, i + 1))
    else if (e.key === 'ArrowLeft') setSel((i) => Math.max(0, i - 1))
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((i) => Math.min(shown.length - 1, i + perRow))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((i) => Math.max(0, i - perRow))
    }
  }

  const dock: { label: string; icon: JSX.Element; run: () => void }[] = [
    { label: 'New bot', icon: <Icon d={ICON.plus} size={22} />, run: () => set({ commandOpen: false, modal: { kind: 'bot', bot: null } }) },
    { label: 'Layouts', icon: <Icon d={ICON.layout} size={22} />, run: () => set({ commandOpen: false, modal: { kind: 'layouts' } }) },
    ...(anyOpen
      ? [
          {
            label: 'Close all panels',
            icon: <Icon d={ICON.forward} size={22} />,
            run: () => {
              close()
              closeAllPanels()
            }
          }
        ]
      : []),
    {
      label: 'Open folder',
      icon: <Icon d={ICON.folder} size={22} />,
      run: async () => {
        close()
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
    { label: 'Settings', icon: <Icon d={ICON.settings} size={22} />, run: () => set({ commandOpen: false, modal: { kind: 'settings' } }) }
  ]

  return (
    <div className="cc-veil" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="cc" onKeyDown={onKey}>
        <div className="cc-search">
          <img className="cc-logo" src={mascot} alt="" />
          <input
            ref={input}
            value={q}
            spellCheck={false}
            placeholder={target !== null ? 'Pick a panel or a bot for this cell' : 'Search panels, bots and layouts'}
            onChange={(e) => setQ(e.target.value)}
          />
          <kbd>esc</kbd>
        </div>
        <div className="cc-body">
          {!shown.length && <p className="dim pad">Nothing matches "{q}".</p>}
          {GROUPS.map((g) => {
            const items = shown.filter((t) => t.group === g)
            if (!items.length) return null
            return (
              <div key={g} className="cc-group">
                <div className="cc-label">{g}</div>
                <div className="cc-grid">
                  {items.map((t) => {
                    const i = shown.indexOf(t)
                    return (
                      <button
                        key={t.key}
                        className={`cc-tile ${i === sel ? 'sel' : ''}`}
                        title={t.panel ? 'Click to open here, or drag it onto a cell' : 'Open this layout'}
                        draggable={!!t.panel}
                        onDragStart={(e) => {
                          if (!t.panel) return
                          e.dataTransfer.setData('text/gb-panel', t.panel)
                          e.dataTransfer.effectAllowed = 'copyMove'
                          // The sheet steps aside so the cells can take the drop.
                          setTimeout(() => set({ commandOpen: false, commandTarget: null }), 0)
                        }}
                        onMouseEnter={() => setSel(i)}
                        onClick={t.run}
                      >
                        <span className="cc-ico">{t.icon}</span>
                        <span className="cc-name">{t.label}</span>
                        {t.sub && <small>{t.sub}</small>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <div className="cc-dock">
          {dock.map((d) => (
            <button key={d.label} className="cc-dockbtn" onClick={() => void d.run()} title={d.label}>
              <span className="cc-ico">{d.icon}</span>
              <span>{d.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** ⌘K anywhere opens and closes the command center. */
export function startCommandKey(): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      if (get().commandOpen) set({ commandOpen: false, commandTarget: null })
      else set({ commandOpen: true, commandTarget: null })
    }
  }
  window.addEventListener('keydown', onKey, true)
  return () => window.removeEventListener('keydown', onKey, true)
}
