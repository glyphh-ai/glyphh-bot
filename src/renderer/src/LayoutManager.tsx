// The layout manager: your layouts and the built-ins, and the frame editor
// (the Glyphh desktop's workspace grid, ported to shared/layouts.ts): pick a
// shape or set columns and rows, merge right or down, split, pin the frame
// new panels stack into, start a frame with a panel or a bot, drag a frame
// onto another to swap or move it, name it, save it. Pins are saved.
import { useState } from 'react'
import {
  allLayouts,
  applyDrop,
  botPanel,
  canMergeDown,
  canMergeRight,
  canSplit,
  CHAT,
  dropModeAt,
  emptyGrid,
  fractionsFor,
  gridFromFrames,
  isBuiltin,
  MAX_GRID,
  mergeDown,
  mergeRight,
  openLayout,
  openPanels,
  PANELS,
  resizeGrid,
  saveError,
  savedFrames,
  setPinned,
  SHAPES,
  splitFrame,
  withPanels,
  type Grid,
  type SavedLayout
} from '../../shared/layouts'
import { panelTitle } from './panelInfo'
import { api, confirmAsk, get, set, setLayout, toast, useStore, why } from './store'

/** A layout's frames as a small icon: filled where a frame has panels, outlined where it is pinned. */
export function MiniGrid({ l }: { l: Pick<SavedLayout, 'cols' | 'rows' | 'colWidths' | 'rowHeights' | 'frames'> }): JSX.Element {
  const g = gridFromFrames(l.cols, l.rows, l.frames)
  return (
    <span
      className="minigrid"
      style={{
        gridTemplateColumns: fractionsFor(l.colWidths, g.cols).map((w) => `${w}fr`).join(' '),
        gridTemplateRows: fractionsFor(l.rowHeights, g.rows).map((h) => `${h}fr`).join(' ')
      }}
    >
      {g.frames.map((f, i) => (
        <i
          key={i}
          className={`${f.stack.length ? 'on' : ''} ${f.pinned ? 'pin' : ''}`}
          style={{ gridColumn: `${f.col + 1} / span ${f.colSpan}`, gridRow: `${f.row + 1} / span ${f.rowSpan}` }}
        />
      ))}
    </span>
  )
}

interface Draft {
  name: string
  /** The saved layout this edit replaces (a rename drops the old name). */
  replacing?: string
  grid: Grid
  colWidths?: number[]
  rowHeights?: number[]
  chatWidth?: number
}

const draftOf = (l: SavedLayout, keepName: boolean): Draft => ({
  name: keepName ? l.name : '',
  replacing: keepName ? l.name : undefined,
  grid: gridFromFrames(l.cols, l.rows, l.frames),
  colWidths: l.colWidths,
  rowHeights: l.rowHeights,
  chatWidth: l.chatWidth
})

const describe = (stack: string[]): string => (stack.length ? stack.map(panelTitle).join(', ') : 'empty')

function Editor({ draft, onDone }: { draft: Draft; onDone: () => void }): JSX.Element {
  const bots = useStore((s) => s.bots)
  const [d, setD] = useState<Draft>(draft)
  const [sel, setSel] = useState(0)
  const [over, setOver] = useState<number | null>(null)
  const g = d.grid
  const isNew = !d.replacing

  /** Change the grid in a copy and keep it. */
  const edit = (fn: (g: Grid) => number | void): void => {
    const copy: Grid = { cols: g.cols, rows: g.rows, frames: g.frames.map((f) => ({ ...f, stack: f.stack.slice() })) }
    const nextSel = fn(copy)
    setD({ ...d, grid: copy })
    if (typeof nextSel === 'number') setSel(nextSel)
    else if (!copy.frames[sel]) setSel(0)
  }

  const saved = (): SavedLayout => ({
    name: d.name,
    cols: g.cols,
    rows: g.rows,
    colWidths: fractionsFor(d.colWidths, g.cols),
    rowHeights: fractionsFor(d.rowHeights, g.rows),
    ...(d.chatWidth ? { chatWidth: d.chatWidth } : {}),
    frames: savedFrames(g)
  })

  const save = async (open: boolean): Promise<void> => {
    const l = saved()
    const err = saveError(l, d.replacing)
    if (err) {
      toast(err)
      return
    }
    try {
      const layouts = await api.layouts.save(l, d.replacing)
      set({ layouts })
      // The layout on screen follows a save of itself; Save and open puts it on screen.
      if (open || (d.replacing && get().layout.name === d.replacing)) {
        set({ expanded: null })
        setLayout(withPanels(openLayout(layouts.find((x) => x.name === l.name.trim())!), openPanels(get().layout)))
      }
      toast(`Saved ${l.name.trim()}.`)
      if (open) set({ modal: null })
      else onDone()
    } catch (e) {
      toast(why(e))
    }
  }

  const options = [...PANELS.filter((p) => p.id !== CHAT).map((p) => ({ id: p.id, label: p.label })), ...bots.map((b) => ({ id: botPanel(b.id), label: `${b.name} (bot)` }))]
  const frame = g.frames[sel]

  return (
    <div className="lm-edit">
      <label className="lm-name">
        Name
        <input value={d.name} autoFocus placeholder="My layout" onChange={(e) => setD({ ...d, name: e.target.value })} />
      </label>
      {isNew && (
        <div className="shapes">
          {SHAPES.map((s) => (
            <button
              key={s.name}
              className="shape"
              onClick={() => {
                const stacks = g.frames.map((f) => f.stack)
                const next = emptyGrid(s.cols, s.rows)
                for (const [i, dir] of s.merge ?? []) dir === 'down' ? mergeDown(next, i) : mergeRight(next, i)
                next.frames.forEach((f, i) => (f.stack = stacks[i] ?? []))
                setD({ ...d, grid: next, colWidths: undefined, rowHeights: undefined })
                setSel(0)
              }}
            >
              <MiniGrid l={{ cols: s.cols, rows: s.rows, frames: [] }} />
              <span>{s.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="lm-dims">
        <label>
          Columns
          <input type="number" min={1} max={MAX_GRID} value={g.cols} onChange={(e) => edit((x) => resizeGrid(x, Number(e.target.value), x.rows))} />
        </label>
        <label>
          Rows
          <input type="number" min={1} max={MAX_GRID} value={g.rows} onChange={(e) => edit((x) => resizeGrid(x, x.cols, Number(e.target.value)))} />
        </label>
        <span className="dim">These are the frames beside the chat. Panels stack into them as they open: full, then under.</span>
      </div>
      <div
        className="lm-grid"
        style={{
          gridTemplateColumns: fractionsFor(d.colWidths, g.cols).map((w) => `${w}fr`).join(' '),
          gridTemplateRows: fractionsFor(d.rowHeights, g.rows).map((h) => `${h}fr`).join(' ')
        }}
      >
        {g.frames.map((f, i) => (
          <div
            key={`${f.col},${f.row}`}
            className={`lm-cell ${i === sel ? 'on' : ''} ${f.stack.length ? 'full' : ''} ${f.pinned ? 'pinned' : ''} ${over === i ? 'over' : ''}`}
            style={{ gridColumn: `${f.col + 1} / span ${f.colSpan}`, gridRow: `${f.row + 1} / span ${f.rowSpan}` }}
            draggable
            onClick={() => setSel(i)}
            onDragStart={(e) => e.dataTransfer.setData('text/gb-lm', String(i))}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(i)
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(null)
              const from = Number(e.dataTransfer.getData('text/gb-lm'))
              const r = e.currentTarget.getBoundingClientRect()
              edit((x) => {
                applyDrop(x, from, i, dropModeAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height))
                return i
              })
            }}
          >
            <b>{describe(f.stack)}</b>
            {f.pinned && <small>pinned · new panels go here</small>}
            {(f.colSpan > 1 || f.rowSpan > 1) && (
              <small>
                {f.colSpan} x {f.rowSpan}
              </small>
            )}
          </div>
        ))}
      </div>
      {frame && (
        <div className="lm-cellbar">
          <select
            value={frame.stack[0] ?? ''}
            title="The panel this frame opens with"
            onChange={(e) =>
              edit((x) => {
                const id = e.target.value
                for (const o of x.frames) o.stack = o.stack.filter((p) => p !== id)
                x.frames[sel]!.stack = id ? [id, ...x.frames[sel]!.stack.filter((p) => p !== id).slice(1)] : []
              })
            }
          >
            <option value="">Starts empty</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                Starts with {o.label}
              </option>
            ))}
          </select>
          <button className="btn" disabled={!canMergeRight(g, sel)} onClick={() => edit((x) => mergeRight(x, sel))}>
            Merge right
          </button>
          <button className="btn" disabled={!canMergeDown(g, sel)} onClick={() => edit((x) => mergeDown(x, sel))}>
            Merge down
          </button>
          <button className="btn" disabled={!canSplit(g, sel)} onClick={() => edit((x) => splitFrame(x, sel))}>
            Split
          </button>
          <button className={`btn ${frame.pinned ? 'primary' : ''}`} title="New panels stack into a pinned frame" onClick={() => edit((x) => setPinned(x, sel, !frame.pinned))}>
            {frame.pinned ? 'Pinned' : 'Pin'}
          </button>
        </div>
      )}
      <div className="row end">
        <button className="btn" onClick={onDone}>
          Back
        </button>
        <button className="btn" onClick={() => void save(false)}>
          Save
        </button>
        <button className="btn primary" onClick={() => void save(true)}>
          Save and open
        </button>
      </div>
    </div>
  )
}

export function LayoutManager({ edit, fromScreen }: { edit?: SavedLayout | null; fromScreen?: boolean }): JSX.Element {
  const saved = useStore((s) => s.layouts)
  const current = useStore((s) => s.layout.name)
  const [draft, setDraft] = useState<Draft | null>(() =>
    edit ? draftOf(edit, !!fromScreen && !isBuiltin(edit.name) && saved.some((l) => l.name === edit.name)) : null
  )
  const all = allLayouts(saved)

  return (
    <div className="veil" onMouseDown={(e) => e.target === e.currentTarget && set({ modal: null })}>
      <div className="modal wide">
        <div className="modal-head">
          <h2>{draft ? (draft.replacing ? `Edit ${draft.replacing}` : 'New layout') : 'Layouts'}</h2>
          <button className="icon" onClick={() => set({ modal: null })}>
            ×
          </button>
        </div>
        {draft ? (
          <Editor draft={draft} onDone={() => setDraft(null)} />
        ) : (
          <div className="lm-list">
            {all.map((l) => {
              const mine = !isBuiltin(l.name)
              const pinned = l.frames.some((f) => f.pinned)
              return (
                <div key={l.name} className={`lm-row ${l.name === current ? 'on' : ''}`}>
                  <MiniGrid l={l} />
                  <div className="lm-main">
                    <b>{l.name}</b>
                    <small>
                      {mine ? 'yours' : 'built in'} · {l.frames.length} {l.frames.length === 1 ? 'frame' : 'frames'}
                      {pinned ? ' · one pinned' : ''}
                      {l.frames.some((f) => f.stack?.length) ? ` · ${l.frames.flatMap((f) => f.stack ?? []).map(panelTitle).join(', ')}` : ''}
                    </small>
                  </div>
                  <button
                    className="btn primary"
                    onClick={() => {
                      set({ modal: null, expanded: null })
                      setLayout(withPanels(openLayout(l), openPanels(get().layout)))
                    }}
                  >
                    Open
                  </button>
                  <button className="btn" onClick={() => setDraft(mine ? draftOf(l, true) : { ...draftOf(l, false), name: `${l.name} copy` })}>
                    {mine ? 'Edit' : 'Copy'}
                  </button>
                  {mine && (
                    <button
                      className="btn danger"
                      onClick={async () => {
                        if (!(await confirmAsk({ title: `Delete ${l.name}?`, body: 'The layout goes. Your files and bots stay.', yes: 'Delete', danger: true })))
                          return
                        set({ layouts: await api.layouts.remove(l.name) })
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              )
            })}
            <div className="row end">
              <button className="btn primary" onClick={() => setDraft({ name: '', grid: emptyGrid(2, 1) })}>
                + New layout
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
