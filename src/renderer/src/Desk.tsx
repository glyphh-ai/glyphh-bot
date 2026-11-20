// The desk: the layout on screen. A grid of panels the desktop's way (column
// widths and row heights as fractions, cells that span), with the seams
// between cells to drag (double-click evens them out, as in Glyphh OS), cell
// headers to drag onto another cell (the middle swaps, an edge inserts), and
// tiles from the command center to drop in. A one-cell layout has no chrome,
// so the default Chat layout is just the chat, as before layouts.
import { useRef, useState } from 'react'
import {
  allLayouts,
  applyDrop,
  botOfPanel,
  cloneLayout,
  dropModeAt,
  evenFractions,
  findLayout,
  moveSeam,
  sameShape,
  toSaved,
  type Layout
} from '../../shared/layouts'
import { Cat } from './Cat'
import { Chat } from './Chat'
import { Icon, ICON } from './Menu'
import { BrowserPanel } from './panels/Browser'
import { DiffPanel } from './panels/Diff'
import { EditorPanel } from './panels/Editor'
import { FilesPanel } from './panels/Files'
import { SwarmPanel } from './panels/Swarm'
import { MiniGrid } from './LayoutManager'
import { PANEL_ICON, panelTitle } from './panelInfo'
import { closePanel, get, openCommand, placeAt, set, setLayout, switchLayout, useStore } from './store'


function PanelIcon({ panelId }: { panelId: string }): JSX.Element {
  const botId = botOfPanel(panelId)
  const bot = useStore((s) => (botId ? s.bots.find((b) => b.id === botId) : undefined))
  if (bot) return <Cat look={bot.look} size={18} />
  return <Icon d={PANEL_ICON[panelId] ?? ICON.layout} size={14} />
}

function Panel({ panelId }: { panelId: string }): JSX.Element {
  const botId = botOfPanel(panelId)
  if (botId) return <Chat room={botId} />
  switch (panelId) {
    case 'chat':
      return <Chat />
    case 'swarm':
      return <SwarmPanel />
    case 'files':
      return <FilesPanel />
    case 'editor':
      return <EditorPanel />
    case 'diff':
      return <DiffPanel />
    case 'browser':
      return <BrowserPanel />
    default:
      return (
        <div className="empty">
          <b>Unknown panel</b>
          <p>{panelId}</p>
        </div>
      )
  }
}

const GAP = 6

/** The seams between cells that really meet: a cell spanning two rows has no row seam across it. */
function seams(l: Layout): { dir: 'v' | 'h'; i: number; at: number }[] {
  const out: { dir: 'v' | 'h'; i: number; at: number }[] = []
  const ends = (dir: 'v' | 'h', i: number, at: number): boolean =>
    l.cells.some((c) =>
      dir === 'v'
        ? c.col + c.colSpan - 1 === i && at >= c.row && at < c.row + c.rowSpan
        : c.row + c.rowSpan - 1 === i && at >= c.col && at < c.col + c.colSpan
    )
  const starts = (dir: 'v' | 'h', i: number, at: number): boolean =>
    l.cells.some((c) =>
      dir === 'v' ? c.col === i + 1 && at >= c.row && at < c.row + c.rowSpan : c.row === i + 1 && at >= c.col && at < c.col + c.colSpan
    )
  for (const [dir, n, m] of [
    ['v', l.cols, l.rows],
    ['h', l.rows, l.cols]
  ] as const) {
    for (let i = 0; i < n - 1; i++) for (let at = 0; at < m; at++) if (ends(dir, i, at) && starts(dir, i, at)) out.push({ dir, i, at })
  }
  return out
}

const frac = (arr: number[], i: number): number => arr.slice(0, i + 1).reduce((a, b) => a + b, 0) / arr.reduce((a, b) => a + b, 0)

function seamStyle(l: Layout, s: { dir: 'v' | 'h'; i: number; at: number }): React.CSSProperties {
  const v = s.dir === 'v'
  const [along, n, across, m] = v ? [l.colWidths, l.cols, l.rowHeights, l.rows] : [l.rowHeights, l.rows, l.colWidths, l.cols]
  const a0 = s.at === 0 ? 0 : frac(across, s.at - 1)
  const a1 = frac(across, s.at)
  const main = `calc((100% - ${(n - 1) * GAP}px) * ${frac(along, s.i)} + ${s.i * GAP + GAP / 2}px)`
  const s0 = `calc((100% - ${(m - 1) * GAP}px) * ${a0} + ${s.at * GAP}px)`
  const len = `calc((100% - ${(m - 1) * GAP}px) * ${a1 - a0})`
  return v ? { left: main, top: s0, height: len } : { top: main, left: s0, width: len }
}

function LayoutBar(): JSX.Element {
  const layout = useStore((s) => s.layout)
  const saved = useStore((s) => s.layouts)
  const [open, setOpen] = useState(false)
  const all = allLayouts(saved)
  const stored = findLayout(saved, layout.name)
  const changed = !stored || !sameShape(toSaved(layout), stored)
  return (
    <div className="layoutbar">
      <div className="lmenu">
        <button className="chip" onClick={() => setOpen(!open)} title="Switch layout">
          <Icon d={ICON.layout} size={14} /> {layout.name}
          {changed && <span className="dim">· changed</span>} <span className="dim">▾</span>
        </button>
        {open && (
          <div className="menu" onMouseLeave={() => setOpen(false)}>
            {all.map((l) => (
              <button
                key={l.name}
                className={l.name === layout.name ? 'on' : ''}
                onClick={() => {
                  setOpen(false)
                  switchLayout(l.name)
                }}
              >
                <MiniGrid l={l} />
                {l.name}
              </button>
            ))}
            <hr />
            <button
              onClick={() => {
                setOpen(false)
                set({ modal: { kind: 'layouts', edit: toSaved(layout), fromScreen: true } })
              }}
            >
              Save this layout…
            </button>
            <button
              onClick={() => {
                setOpen(false)
                set({ modal: { kind: 'layouts' } })
              }}
            >
              Layout manager…
            </button>
          </div>
        )}
      </div>
      <span className="spacer" />
      <button className="chip" title="Open a panel or a bot in this layout (⌘K)" onClick={() => openCommand(null)}>
        <Icon d={ICON.plus} size={14} /> Open <kbd>⌘K</kbd>
      </button>
    </div>
  )
}

export function Desk(): JSX.Element {
  const layout = useStore((s) => s.layout)
  const focused = useStore((s) => s.focused)
  const flash = useStore((s) => s.flash)
  useStore((s) => s.bots)
  useStore((s) => s.room)
  const grid = useRef<HTMLDivElement>(null)
  const [drop, setDrop] = useState<{ idx: number; mode: string } | null>(null)
  const single = layout.cells.length === 1

  const dragSeam = (e: React.MouseEvent, s: { dir: 'v' | 'h'; i: number }): void => {
    e.preventDefault()
    const el = grid.current
    if (!el) return
    document.body.classList.add(s.dir === 'v' ? 'resizing-v' : 'resizing-h')
    const move = (ev: MouseEvent): void => {
      const r = el.getBoundingClientRect()
      const l = cloneLayout(get().layout)
      if (s.dir === 'v') l.colWidths = moveSeam(l.colWidths, s.i, (ev.clientX - r.left) / r.width)
      else l.rowHeights = moveSeam(l.rowHeights, s.i, (ev.clientY - r.top) / r.height)
      setLayout(l)
    }
    const up = (): void => {
      document.body.classList.remove('resizing-v', 'resizing-h')
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const onDrop = (e: React.DragEvent, idx: number): void => {
    setDrop(null)
    const panel = e.dataTransfer.getData('text/gb-panel')
    const from = e.dataTransfer.getData('text/gb-cell')
    if (panel) {
      e.preventDefault()
      placeAt(idx, panel)
    } else if (from !== '') {
      e.preventDefault()
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const l = cloneLayout(get().layout)
      applyDrop(l, Number(from), idx, dropModeAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height))
      setLayout(l, idx)
    }
  }

  return (
    <section className="desk">
      <LayoutBar />
      <div
        className={`dgrid ${single ? 'single' : ''}`}
        ref={grid}
        style={{
          gridTemplateColumns: layout.colWidths.map((w) => `${w}fr`).join(' '),
          gridTemplateRows: layout.rowHeights.map((h) => `${h}fr`).join(' ')
        }}
      >
        {layout.cells.map((c, i) => (
          <div
            key={`${c.col},${c.row}:${c.panelId}`}
            className={`dcell ${i === focused && !single ? 'focus' : ''} ${i === flash ? 'flash' : ''} ${drop?.idx === i ? `drop ${drop.mode}` : ''}`}
            style={{ gridColumn: `${c.col + 1} / span ${c.colSpan}`, gridRow: `${c.row + 1} / span ${c.rowSpan}` }}
            onMouseDownCapture={() => i !== get().focused && set({ focused: i })}
            onDragOver={(e) => {
              const t = e.dataTransfer.types
              if (!t.includes('text/gb-panel') && !t.includes('text/gb-cell')) return
              e.preventDefault()
              const r = e.currentTarget.getBoundingClientRect()
              const mode = t.includes('text/gb-panel') ? 'swap' : dropModeAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
              if (drop?.idx !== i || drop.mode !== mode) setDrop({ idx: i, mode })
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(null)
            }}
            onDrop={(e) => onDrop(e, i)}
          >
            {c.panelId ? (
              <>
                {!single && (
                  <div
                    className="dhead"
                    draggable
                    title="Drag onto another cell: the middle swaps, an edge moves it there"
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/gb-cell', String(i))
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                  >
                    <PanelIcon panelId={c.panelId} />
                    <span>{panelTitle(c.panelId)}</span>
                    {c.sticky && (
                      <span className="pin" title="New panels open here once the layout is full">
                        pinned
                      </span>
                    )}
                    <span className="spacer" />
                    <button title="Close this panel" onClick={() => closePanel(i)}>
                      ×
                    </button>
                  </div>
                )}
                <div className="dbody">
                  <Panel panelId={c.panelId} />
                </div>
              </>
            ) : (
              <div className="dempty">
                <button className="btn" onClick={() => openCommand(i)}>
                  + Add a panel
                </button>
                <small>or drag one here from the command center</small>
              </div>
            )}
          </div>
        ))}
        {seams(layout).map((s) => (
          <div
            key={`${s.dir}${s.i}-${s.at}`}
            className={`seam ${s.dir}`}
            style={seamStyle(layout, s)}
            title="Drag to resize · double-click to even out"
            onMouseDown={(e) => dragSeam(e, s)}
            onDoubleClick={() => {
              const l = cloneLayout(get().layout)
              if (s.dir === 'v') l.colWidths = evenFractions(l.cols)
              else l.rowHeights = evenFractions(l.rows)
              setLayout(l)
            }}
          />
        ))}
      </div>
    </section>
  )
}
