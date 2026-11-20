// The desk: the chat on the left and the panel area on the right, the way
// Claude's side panels work. Panels stack in as they open (full, under,
// full, under) inside the layout's frames (shared/layouts.ts decides where);
// each panel has a header to drag it to another frame, expand it over the
// whole desk, or close it (the rest reflow). A pinned frame takes every new
// panel. Every panel is placed absolutely from deskRects and rendered in a
// stable order, so a reflow never remounts a browser or an editor.
import { useEffect, useRef, useState } from 'react'
import {
  allLayouts,
  botOfPanel,
  CHAT,
  cloneLayout,
  deskRects,
  evenFractions,
  findLayout,
  frameSeams,
  moveSeam,
  sameShape,
  toSaved,
  type Rect
} from '../../shared/layouts'
import { Cat } from './Cat'
import { Chat } from './Chat'
import { MiniGrid } from './LayoutManager'
import { Icon, ICON } from './Menu'
import { BrowserPanel } from './panels/Browser'
import { DiffPanel } from './panels/Diff'
import { EditorPanel } from './panels/Editor'
import { FilesPanel } from './panels/Files'
import { PANEL_ICON, panelTitle } from './panelInfo'
import { closePanel, get, openCommand, openPanel, set, setLayout, switchLayout, toggleExpand, togglePin, useStore } from './store'

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

const pct = (r: Rect): React.CSSProperties => ({ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` })

/** The top bar's layout menu: switch layouts, save the one on screen, or open the manager. */
export function LayoutMenu(): JSX.Element {
  const layout = useStore((s) => s.layout)
  const saved = useStore((s) => s.layouts)
  const [open, setOpen] = useState(false)
  const all = allLayouts(saved)
  const stored = findLayout(saved, layout.name)
  const changed = !stored || !sameShape(toSaved(layout), stored)
  return (
    <div className="lmenu nodrag">
      <div>
        <button className="chip" onClick={() => setOpen(!open)} title="Layout: switch, save, or open the layout manager">
          <Icon d={ICON.layout} size={14} /> {layout.name}
          {changed && <span className="dim">·</span>} <span className="dim">▾</span>
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
    </div>
  )
}

/** Drop data: a panel tile from the command center, or a panel's header. */
const PANEL_DRAG = 'text/gb-panel'
const CHAT_MIN_PX = 420

export function Desk(): JSX.Element {
  const layout = useStore((s) => s.layout)
  const focused = useStore((s) => s.focused)
  const flash = useStore((s) => s.flash)
  const expanded = useStore((s) => s.expanded)
  useStore((s) => s.bots)
  useStore((s) => s.room)
  const body = useRef<HTMLDivElement>(null)
  const [over, setOver] = useState<number | null>(null)
  const [width, setWidth] = useState(1200)
  useEffect(() => {
    const el = body.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 1200))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The chat keeps at least 420px, so its composer stays on one line.
  const r = deskRects(layout, expanded, false, CHAT_MIN_PX / width)
  const multi = layout.frames.length > 1
  // A stable order: React never moves a panel's DOM, so a browser never reloads.
  const panels = r.panels.slice().sort((a, b) => (a.panelId < b.panelId ? -1 : 1))

  const drag = (e: React.MouseEvent, move: (fx: number, fy: number) => void, dir: 'v' | 'h', reset?: () => void): void => {
    e.preventDefault()
    const el = body.current
    if (!el) return
    document.body.classList.add(dir === 'v' ? 'resizing-v' : 'resizing-h')
    const mv = (ev: MouseEvent): void => {
      const b = el.getBoundingClientRect()
      move((ev.clientX - b.left) / b.width, (ev.clientY - b.top) / b.height)
    }
    const up = (): void => {
      document.body.classList.remove('resizing-v', 'resizing-h')
      window.removeEventListener('mousemove', mv)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', mv)
    window.addEventListener('mouseup', up)
    void reset
  }

  const dropOn = (frame: number) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(PANEL_DRAG)) return
      e.preventDefault()
      if (over !== frame) setOver(frame)
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null)
    },
    onDrop: (e: React.DragEvent) => {
      setOver(null)
      const p = e.dataTransfer.getData(PANEL_DRAG)
      if (!p) return
      e.preventDefault()
      openPanel(p, frame)
    }
  })

  const area = r.area
  return (
    <section className="desk">
      <div className="dbodyw" ref={body}>
        {/* the chat */}
        <div className={`dslot chatslot ${focused === CHAT ? 'focus' : ''}`} style={r.chat ? pct(r.chat) : { display: 'none' }} onMouseDownCapture={() => focused !== CHAT && set({ focused: CHAT })}>
          {(area || expanded === CHAT) && (
            <button className="ibtn dexpand" title={expanded === CHAT ? 'Put it back' : 'Fill the window'} onClick={() => toggleExpand(CHAT)}>
              <Icon d={expanded === CHAT ? ICON.shrink : ICON.grow} size={14} />
            </button>
          )}
          <Chat />
        </div>

        {/* frames holding open panels: their outline when pinned or dragged over (empty frames are never drawn) */}
        {r.frames.map(({ idx, rect }) => {
          const f = layout.frames[idx]!
          return <div key={`f${f.col},${f.row}`} className={`dframe ${f.pinned && multi ? 'pinned' : ''} ${over === idx ? 'over' : ''}`} style={pct(rect)} {...dropOn(idx)} />
        })}

        {/* the panels, each where its frame's stack puts it */}
        {panels.map((p) => {
          const f = layout.frames[p.frame]!
          const head = f.stack[0] === p.panelId
          const isEx = expanded === p.panelId
          return (
            <div
              key={p.panelId}
              className={`dslot panel ${focused === p.panelId ? 'focus' : ''} ${flash === p.panelId ? 'flash' : ''} ${over === p.frame ? 'over' : ''}`}
              style={p.hidden ? { ...pct(p.rect), display: 'none' } : pct(p.rect)}
              onMouseDownCapture={() => focused !== p.panelId && set({ focused: p.panelId })}
              {...dropOn(p.frame)}
            >
              <div
                className="dhead"
                draggable
                title="Drag onto another frame to move it there"
                onDragStart={(e) => {
                  e.dataTransfer.setData(PANEL_DRAG, p.panelId)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDoubleClick={() => toggleExpand(p.panelId)}
              >
                <PanelIcon panelId={p.panelId} />
                <span className="dtitle">{panelTitle(p.panelId)}</span>
                <span className="spacer" />
                {multi && head && !isEx && (
                  <button className={`pinbtn ${f.pinned ? 'on' : ''}`} title={f.pinned ? 'Pinned: new panels stack into this frame' : 'Pin this frame: new panels stack into it'} onClick={() => togglePin(p.frame)}>
                    <Icon d={ICON.pin} size={13} />
                    {f.pinned && 'Pinned'}
                  </button>
                )}
                <button title={isEx ? 'Put it back' : 'Expand'} onClick={() => toggleExpand(p.panelId)}>
                  <Icon d={isEx ? ICON.shrink : ICON.grow} size={13} />
                </button>
                <button title="Close" onClick={() => closePanel(p.panelId)}>
                  ×
                </button>
              </div>
              <div className="dbody">
                <Panel panelId={p.panelId} />
              </div>
            </div>
          )
        })}

        {/* seams: chat | panels, and between frames */}
        {area && r.chat && (
          <div
            className="seam v"
            style={{ left: `${area.x * 100}%`, top: 0, height: '100%' }}
            title="Drag to resize"
            onMouseDown={(e) =>
              drag(e, (fx) => {
                const l = cloneLayout(get().layout)
                l.chatWidth = Math.max(0.2, Math.min(0.8, +fx.toFixed(4)))
                setLayout(l)
              }, 'v')
            }
          />
        )}
        {area &&
          r.exact &&
          frameSeams(layout).map((s) => {
            const x = area.x + s.rect.x * area.w
            const y = area.y + s.rect.y * area.h
            return (
              <div
                key={`${s.dir}${s.i}-${s.rect.x}-${s.rect.y}`}
                className={`seam ${s.dir}`}
                style={s.dir === 'v' ? { left: `${x * 100}%`, top: `${y * 100}%`, height: `${s.rect.h * area.h * 100}%` } : { top: `${y * 100}%`, left: `${x * 100}%`, width: `${s.rect.w * area.w * 100}%` }}
                title="Drag to resize · double-click to even out"
                onMouseDown={(e) =>
                  drag(e, (fx, fy) => {
                    const l = cloneLayout(get().layout)
                    if (s.dir === 'v') l.colWidths = moveSeam(l.colWidths, s.i, (fx - area.x) / area.w)
                    else l.rowHeights = moveSeam(l.rowHeights, s.i, (fy - area.y) / area.h)
                    setLayout(l)
                  }, s.dir)
                }
                onDoubleClick={() => {
                  const l = cloneLayout(get().layout)
                  if (s.dir === 'v') l.colWidths = evenFractions(l.cols)
                  else l.rowHeights = evenFractions(l.rows)
                  setLayout(l)
                }}
              />
            )
          })}
      </div>
    </section>
  )
}
