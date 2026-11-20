// The layout manager: your layouts and the built-ins, and the grid editor the
// Glyphh desktop uses for workspaces (help/workspace-grid.ts, ported to
// shared/layouts.ts): pick a shape or set columns and rows, put a panel or a
// bot in each cell, merge right or down, split, pin the cell new panels
// reuse, drag a cell onto another to swap or move it, name it, save it.
import { useState } from 'react'
import {
  allLayouts,
  applyDrop,
  assignPanel,
  botPanel,
  canMergeDown,
  canMergeRight,
  canSplit,
  dropModeAt,
  emptyGrid,
  fractionsFor,
  gridCells,
  gridFromCells,
  isBuiltin,
  MAX_GRID,
  mergeDown,
  mergeRight,
  openLayout,
  PANELS,
  resizeGrid,
  saveError,
  setSticky,
  SHAPES,
  splitCell,
  type Grid,
  type SavedLayout
} from '../../shared/layouts'
import { panelTitle } from './panelInfo'
import { api, confirmAsk, get, set, setLayout, toast, useStore, why } from './store'

/** A layout's shape as a small icon: its cells, filled where a panel is. */
export function MiniGrid({ l }: { l: Pick<SavedLayout, 'cols' | 'rows' | 'colWidths' | 'rowHeights' | 'cells'> }): JSX.Element {
  const g = gridFromCells(l.cols, l.rows, l.cells)
  return (
    <span
      className="minigrid"
      style={{
        gridTemplateColumns: fractionsFor(l.colWidths, g.cols).map((w) => `${w}fr`).join(' '),
        gridTemplateRows: fractionsFor(l.rowHeights, g.rows).map((h) => `${h}fr`).join(' ')
      }}
    >
      {g.cells.map((c, i) => (
        <i key={i} className={c.panelId ? 'on' : ''} style={{ gridColumn: `${c.col + 1} / span ${c.colSpan}`, gridRow: `${c.row + 1} / span ${c.rowSpan}` }} />
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
}

const draftOf = (l: SavedLayout, keepName: boolean): Draft => ({
  name: keepName ? l.name : '',
  replacing: keepName ? l.name : undefined,
  grid: gridFromCells(l.cols, l.rows, l.cells),
  colWidths: l.colWidths,
  rowHeights: l.rowHeights
})

function Editor({ draft, onDone }: { draft: Draft; onDone: () => void }): JSX.Element {
  const bots = useStore((s) => s.bots)
  const [d, setD] = useState<Draft>(draft)
  const [sel, setSel] = useState(0)
  const [over, setOver] = useState<number | null>(null)
  const g = d.grid
  const isNew = !d.replacing

  /** Change the grid in a copy and keep it. */
  const edit = (fn: (g: Grid) => number | void): void => {
    const copy: Grid = { cols: g.cols, rows: g.rows, cells: g.cells.map((c) => ({ ...c })) }
    const nextSel = fn(copy)
    setD({ ...d, grid: copy })
    if (typeof nextSel === 'number') setSel(nextSel)
    else if (!copy.cells[sel]) setSel(0)
  }

  const saved = (): SavedLayout => ({
    name: d.name,
    cols: g.cols,
    rows: g.rows,
    colWidths: fractionsFor(d.colWidths, g.cols),
    rowHeights: fractionsFor(d.rowHeights, g.rows),
    cells: gridCells(g)
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
      // The layout on screen follows a rename of itself.
      if (open || (d.replacing && get().layout.name === d.replacing)) setLayout(openLayout(layouts.find((x) => x.name === l.name.trim())!), 0)
      toast(`Saved ${l.name.trim()}.`)
      if (open) set({ modal: null })
      else onDone()
    } catch (e) {
      toast(why(e))
    }
  }

  const options = [...PANELS.map((p) => ({ id: p.id, label: p.label })), ...bots.map((b) => ({ id: botPanel(b.id), label: `${b.name} (bot)` }))]
  const cell = g.cells[sel]

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
                const apps = g.cells.map((c) => c.panelId)
                const next = emptyGrid(s.cols, s.rows)
                for (const [i, dir] of s.merge ?? []) dir === 'down' ? mergeDown(next, i) : mergeRight(next, i)
                next.cells.forEach((c, i) => (c.panelId = apps[i] ?? ''))
                setD({ ...d, grid: next, colWidths: undefined, rowHeights: undefined })
                setSel(0)
              }}
            >
              <MiniGrid l={{ cols: s.cols, rows: s.rows, cells: [] }} />
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
        <span className="dim">Click a cell to pick it. Drag a cell onto another to swap or move it.</span>
      </div>
      <div
        className="lm-grid"
        style={{
          gridTemplateColumns: fractionsFor(d.colWidths, g.cols).map((w) => `${w}fr`).join(' '),
          gridTemplateRows: fractionsFor(d.rowHeights, g.rows).map((h) => `${h}fr`).join(' ')
        }}
      >
        {g.cells.map((c, i) => (
          <div
            key={`${c.col},${c.row}`}
            className={`lm-cell ${i === sel ? 'on' : ''} ${c.panelId ? 'full' : ''} ${over === i ? 'over' : ''}`}
            style={{ gridColumn: `${c.col + 1} / span ${c.colSpan}`, gridRow: `${c.row + 1} / span ${c.rowSpan}` }}
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
            <b>{c.panelId ? panelTitle(c.panelId) : 'Empty'}</b>
            {c.sticky && <small>pinned</small>}
            {(c.colSpan > 1 || c.rowSpan > 1) && (
              <small>
                {c.colSpan} x {c.rowSpan}
              </small>
            )}
          </div>
        ))}
      </div>
      {cell && (
        <div className="lm-cellbar">
          <select value={cell.panelId} onChange={(e) => edit((x) => assignPanel(x, sel, e.target.value))}>
            <option value="">Empty</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <button className="btn" disabled={!canMergeRight(g, sel)} onClick={() => edit((x) => mergeRight(x, sel))}>
            Merge right
          </button>
          <button className="btn" disabled={!canMergeDown(g, sel)} onClick={() => edit((x) => mergeDown(x, sel))}>
            Merge down
          </button>
          <button className="btn" disabled={!canSplit(g, sel)} onClick={() => edit((x) => splitCell(x, sel))}>
            Split
          </button>
          <button
            className={`btn ${cell.sticky ? 'primary' : ''}`}
            disabled={!cell.panelId}
            title="Once the layout is full, panels you open replace this one"
            onClick={() => edit((x) => setSticky(x, sel, !cell.sticky))}
          >
            {cell.sticky ? 'Pinned' : 'Pin'}
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
              return (
                <div key={l.name} className={`lm-row ${l.name === current ? 'on' : ''}`}>
                  <MiniGrid l={l} />
                  <div className="lm-main">
                    <b>{l.name}</b>
                    <small>
                      {mine ? 'yours' : 'built in'} · {l.cells.map((c) => panelTitle(c.panelId)).join(', ')}
                    </small>
                  </div>
                  <button
                    className="btn primary"
                    onClick={() => {
                      setLayout(openLayout(l), 0)
                      set({ modal: null })
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
