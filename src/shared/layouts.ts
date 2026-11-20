// Layouts: grids of panels, the desktop's way (glyphh/app
// src/renderer/help/workspace-grid.ts, ported). Every position of a cols x
// rows grid is covered by exactly one cell; a merged cell is stored by its
// top-left with its spans; an empty cell has panelId "" and is never saved.
// Column widths and row heights are fractions, kept with the layout.
//
// Everything here is data, no DOM and no Electron: the layout manager's
// modal and the main process both use it, and test/layouts.test.ts checks it.

/** Grids go up to 6 x 6 here: a window, not a wall of terminals. */
export const MAX_GRID = 6

/** What a cell can hold: a work panel, or one bot's own chat ("bot:<id>"). */
export type PanelId = string

export const PANELS: ReadonlyArray<{ id: PanelId; label: string }> = Object.freeze([
  { id: 'chat', label: 'Chat' },
  { id: 'swarm', label: 'Swarm' },
  { id: 'files', label: 'Files' },
  { id: 'editor', label: 'Editor' },
  { id: 'diff', label: 'Diff' },
  { id: 'browser', label: 'Browser' }
])

export const botPanel = (botId: string): PanelId => `bot:${botId}`
export const botOfPanel = (panelId: PanelId): string | null => (panelId.startsWith('bot:') ? panelId.slice(4) : null)

/** One cell of a grid. panelId "" = an empty cell. */
export interface GridCell {
  panelId: PanelId
  col: number
  row: number
  colSpan: number
  rowSpan: number
  /** Opening a panel with no empty cell left reuses THIS one. At most one cell is sticky. */
  sticky?: boolean
}

/** A grid: every position covered by exactly one cell. */
export interface Grid {
  cols: number
  rows: number
  cells: GridCell[]
}

/** The layout on screen: the whole grid, its seams and its name. */
export interface Layout extends Grid {
  name: string
  colWidths: number[]
  rowHeights: number[]
}

/** A cell as a saved layout keeps it (only the assigned ones are saved). */
export interface SavedCell {
  panelId: PanelId
  col?: number
  row?: number
  colSpan?: number
  rowSpan?: number
  sticky?: boolean
}

/** A layout as it is saved: its name, its shape, its seams, its assigned cells. */
export interface SavedLayout {
  name: string
  cols: number
  rows: number
  colWidths?: number[]
  rowHeights?: number[]
  cells: SavedCell[]
  /** Set by the save; the built-ins have none. */
  updatedAt?: number
}

const clampDim = (n: unknown, fallback: number): number => {
  const v = Math.floor(Number(n))
  return Number.isFinite(v) && v >= 1 ? Math.min(v, MAX_GRID) : fallback
}

/** A fresh grid of empty 1x1 cells. */
export function emptyGrid(cols: number, rows: number): Grid {
  const c = clampDim(cols, 2)
  const r = clampDim(rows, 1)
  const cells: GridCell[] = []
  for (let y = 0; y < r; y++) for (let x = 0; x < c; x++) cells.push({ panelId: '', col: x, row: y, colSpan: 1, rowSpan: 1 })
  return { cols: c, rows: r, cells }
}

/** The index of the cell covering (col, row), or -1. */
export function cellAt(g: Grid, col: number, row: number): number {
  return g.cells.findIndex((c) => col >= c.col && col < c.col + c.colSpan && row >= c.row && row < c.row + c.rowSpan)
}

/**
 * Saved cells -> a whole grid: 1x1s, each saved cell laid on its top-left with
 * its spans and pin, and the 1x1s a merged cell covers dropped. Spans are
 * clamped to the edges; a cell outside the grid, or one landing where an
 * earlier cell already is, is skipped.
 */
export function gridFromCells(cols: number, rows: number, saved: ReadonlyArray<SavedCell>): Grid {
  const g = emptyGrid(cols, rows)
  const placed: GridCell[] = []
  const covers = (o: GridCell, x: number, y: number): boolean =>
    x >= o.col && x < o.col + o.colSpan && y >= o.row && y < o.row + o.rowSpan
  for (const s of saved) {
    const col = Math.floor(Number(s.col ?? 0))
    const row = Math.floor(Number(s.row ?? 0))
    if (!(col >= 0 && col < g.cols && row >= 0 && row < g.rows)) continue
    if (!String(s.panelId ?? '').trim()) continue
    const cell: GridCell = {
      panelId: String(s.panelId),
      col,
      row,
      colSpan: Math.max(1, Math.min(Math.floor(Number(s.colSpan ?? 1)) || 1, g.cols - col)),
      rowSpan: Math.max(1, Math.min(Math.floor(Number(s.rowSpan ?? 1)) || 1, g.rows - row))
    }
    const overlaps = placed.some((o) => {
      for (let y = cell.row; y < cell.row + cell.rowSpan; y++)
        for (let x = cell.col; x < cell.col + cell.colSpan; x++) if (covers(o, x, y)) return true
      return false
    })
    if (overlaps) continue
    if (s.sticky) cell.sticky = true
    placed.push(cell)
  }
  let seen = false
  for (const c of placed) {
    if (c.sticky) {
      if (seen) delete c.sticky
      seen = true
    }
  }
  const rest = g.cells.filter((e) => !placed.some((o) => covers(o, e.col, e.row)))
  g.cells = [...placed, ...rest].sort((a, b) => a.row - b.row || a.col - b.col)
  return g
}

/** Resize in place: cells whose anchor still fits stay (spans clamped); new positions arrive empty. */
export function resizeGrid(g: Grid, cols: number, rows: number): void {
  g.cols = clampDim(cols, g.cols)
  g.rows = clampDim(rows, g.rows)
  const kept: GridCell[] = []
  for (const c of g.cells) {
    if (c.col >= g.cols || c.row >= g.rows) continue
    c.colSpan = Math.min(c.colSpan, g.cols - c.col)
    c.rowSpan = Math.min(c.rowSpan, g.rows - c.row)
    kept.push(c)
  }
  g.cells = kept
  for (let y = 0; y < g.rows; y++) {
    for (let x = 0; x < g.cols; x++) {
      if (cellAt(g, x, y) === -1) g.cells.push({ panelId: '', col: x, row: y, colSpan: 1, rowSpan: 1 })
    }
  }
}

/** The cell to the right is ONE cell with this cell's row range. */
export function canMergeRight(g: Grid, idx: number): boolean {
  const cell = g.cells[idx]
  if (!cell || cell.col + cell.colSpan >= g.cols) return false
  const rightIdx = cellAt(g, cell.col + cell.colSpan, cell.row)
  if (rightIdx < 0) return false
  const right = g.cells[rightIdx]!
  return right.col === cell.col + cell.colSpan && right.row === cell.row && right.rowSpan === cell.rowSpan
}

/** The cell below is ONE cell with this cell's column range. */
export function canMergeDown(g: Grid, idx: number): boolean {
  const cell = g.cells[idx]
  if (!cell || cell.row + cell.rowSpan >= g.rows) return false
  const belowIdx = cellAt(g, cell.col, cell.row + cell.rowSpan)
  if (belowIdx < 0) return false
  const below = g.cells[belowIdx]!
  return below.row === cell.row + cell.rowSpan && below.col === cell.col && below.colSpan === cell.colSpan
}

export const canSplit = (g: Grid, idx: number): boolean => {
  const c = g.cells[idx]
  return !!c && (c.colSpan > 1 || c.rowSpan > 1)
}

/** Merge with the right neighbour (which goes). Returns the merged cell's new index. */
export function mergeRight(g: Grid, idx: number): number {
  if (!canMergeRight(g, idx)) return idx
  const cell = g.cells[idx]!
  const rightIdx = cellAt(g, cell.col + cell.colSpan, cell.row)
  cell.colSpan += g.cells[rightIdx]!.colSpan
  g.cells.splice(rightIdx, 1)
  return g.cells.indexOf(cell)
}

/** Merge with the cell below (which goes). Returns the merged cell's new index. */
export function mergeDown(g: Grid, idx: number): number {
  if (!canMergeDown(g, idx)) return idx
  const cell = g.cells[idx]!
  const belowIdx = cellAt(g, cell.col, cell.row + cell.rowSpan)
  cell.rowSpan += g.cells[belowIdx]!.rowSpan
  g.cells.splice(belowIdx, 1)
  return g.cells.indexOf(cell)
}

/** Split a merged cell into 1x1s; its panel and pin stay on the top-left piece. */
export function splitCell(g: Grid, idx: number): void {
  const cell = g.cells[idx]
  if (!cell || (cell.colSpan === 1 && cell.rowSpan === 1)) return
  const pieces: GridCell[] = []
  for (let y = cell.row; y < cell.row + cell.rowSpan; y++) {
    for (let x = cell.col; x < cell.col + cell.colSpan; x++) {
      if (y === cell.row && x === cell.col) {
        pieces.push({ panelId: cell.panelId, col: x, row: y, colSpan: 1, rowSpan: 1, ...(cell.sticky ? { sticky: true } : {}) })
      } else pieces.push({ panelId: '', col: x, row: y, colSpan: 1, rowSpan: 1 })
    }
  }
  g.cells.splice(idx, 1, ...pieces)
}

/** Mark exactly one cell sticky, or clear it. An empty cell can't be sticky. */
export function setSticky(g: Grid, idx: number, on: boolean): void {
  const target = g.cells[idx]
  const allow = on && !!target?.panelId
  g.cells.forEach((c, i) => {
    if (allow && i === idx) c.sticky = true
    else delete c.sticky
  })
}

/** Put a panel in a cell; "" empties it (and its pin goes too). */
export function assignPanel(g: Grid, idx: number, panelId: PanelId): void {
  const cell = g.cells[idx]
  if (!cell) return
  const next = String(panelId ?? '').trim()
  cell.panelId = next
  if (!next) delete cell.sticky
}

/** Cell indices in reading order: top row left to right, then down. */
export function readingOrder(g: Grid): number[] {
  return g.cells.map((_, i) => i).sort((a, b) => g.cells[a]!.row - g.cells[b]!.row || g.cells[a]!.col - g.cells[b]!.col)
}

export type DropMode = 'before' | 'after' | 'swap'

/** Where in a cell the pointer is: the leading edge inserts before, the trailing edge after, the middle swaps. */
export function dropModeAt(fx: number, fy: number): DropMode {
  if (fx < 0.28 || fy < 0.28) return 'before'
  if (fx > 0.72 || fy > 0.72) return 'after'
  return 'swap'
}

/**
 * A drag's drop. Contents move, geometry stays: mid-cell SWAPS two cells'
 * contents; an edge INSERTS the dragged contents before or after the target
 * in reading order. A full-height single-column cell dropped on an edge moves
 * as a column, unless a merged cell straddles the boundary.
 */
export function applyDrop(g: Grid, fromIdx: number, toIdx: number, mode: DropMode): void {
  if (fromIdx === toIdx || !g.cells[fromIdx] || !g.cells[toIdx]) return
  if (mode !== 'swap') {
    const c = g.cells[fromIdx]!
    const t = g.cells[toIdx]!
    if (c.colSpan === 1 && c.rowSpan >= g.rows) {
      const from = c.col
      let to = mode === 'before' ? t.col : t.col + t.colSpan
      if (to > from) to--
      const crossesBoundary = g.cells.some((o) => {
        if (o === c) return false
        const oc = o.col > from ? o.col - 1 : o.col
        return oc < to && oc + o.colSpan > to
      })
      if (!crossesBoundary && to !== from) {
        for (const o of g.cells) if (o !== c && o.col > from) o.col--
        for (const o of g.cells) if (o !== c && o.col >= to) o.col++
        c.col = to
        return
      }
      if (to === from) return
    }
  }
  type Contents = { panelId: string; sticky?: boolean }
  const order = readingOrder(g)
  const contents: Contents[] = order.map((ci) => ({ panelId: g.cells[ci]!.panelId, sticky: g.cells[ci]!.sticky }))
  const src = order.indexOf(fromIdx)
  let dst = order.indexOf(toIdx)
  if (mode === 'swap') {
    ;[contents[src], contents[dst]] = [contents[dst]!, contents[src]!]
  } else {
    const [moved] = contents.splice(src, 1)
    if (src < dst) dst--
    contents.splice(mode === 'before' ? dst : dst + 1, 0, moved!)
  }
  order.forEach((ci, p) => {
    const cell = g.cells[ci]!
    const k = contents[p]!
    cell.panelId = k.panelId
    if (k.sticky) cell.sticky = true
    else delete cell.sticky
  })
}

/** The cells a save writes: the assigned ones, in reading order. */
export function gridCells(g: Grid): SavedCell[] {
  return readingOrder(g)
    .map((i) => g.cells[i]!)
    .filter((c) => c.panelId)
    .map((c) => ({
      panelId: c.panelId,
      col: c.col,
      row: c.row,
      colSpan: c.colSpan,
      rowSpan: c.rowSpan,
      ...(c.sticky ? { sticky: true } : {})
    }))
}

/** n equal fractions. */
export const evenFractions = (n: number): number[] =>
  Array.from({ length: Math.max(1, n) }, () => 1 / Math.max(1, n))

/** The layout's own seams when the count is unchanged, else even ones. */
export function fractionsFor(prev: ReadonlyArray<number> | null | undefined, n: number): number[] {
  return prev && prev.length === n && prev.every((v) => Number.isFinite(v) && v > 0) ? prev.slice() : evenFractions(n)
}

/** Move the seam after column (or row) i to `pos` (0..1 across the whole grid); each side keeps at least 8%. */
export function moveSeam(fractions: ReadonlyArray<number>, i: number, pos: number): number[] {
  const arr = fractions.slice()
  if (i < 0 || i >= arr.length - 1) return arr
  const total = arr.reduce((a, b) => a + b, 0)
  const pair = arr[i]! + arr[i + 1]!
  const before = arr.slice(0, i).reduce((a, b) => a + b, 0)
  const want = Math.max(0.08 * total, Math.min(pair - 0.08 * total, pos * total - before))
  arr[i] = +want.toFixed(4)
  arr[i + 1] = +(pair - want).toFixed(4)
  return arr
}

// ------------------------------------------------------- saved layouts

const cell = (panelId: PanelId, col: number, row: number, rowSpan = 1, colSpan = 1): SavedCell => ({
  panelId,
  col,
  row,
  colSpan,
  rowSpan
})

/** The layouts every install has. The first one is where the app starts. */
export const BUILTIN_LAYOUTS: ReadonlyArray<SavedLayout> = Object.freeze([
  { name: 'Chat', cols: 1, rows: 1, cells: [cell('chat', 0, 0)] },
  { name: 'Chat and browser', cols: 2, rows: 1, colWidths: [0.55, 0.45], cells: [cell('chat', 0, 0), { ...cell('browser', 1, 0), sticky: true }] },
  {
    name: 'Dev',
    cols: 3,
    rows: 2,
    colWidths: [0.22, 0.42, 0.36],
    rowHeights: [0.55, 0.45],
    cells: [cell('files', 0, 0), cell('diff', 0, 1), { ...cell('editor', 1, 0, 2), sticky: true }, cell('browser', 2, 0, 2)]
  },
  { name: 'Review', cols: 2, rows: 1, colWidths: [0.45, 0.55], cells: [cell('diff', 0, 0), { ...cell('editor', 1, 0), sticky: true }] },
  {
    name: 'Swarm',
    cols: 2,
    rows: 2,
    colWidths: [0.58, 0.42],
    cells: [cell('chat', 0, 0, 2), cell('swarm', 1, 0), { ...cell('browser', 1, 1), sticky: true }]
  }
])

/** The empty shapes a new layout can start from. */
export const SHAPES: ReadonlyArray<{ name: string; cols: number; rows: number; merge?: Array<[number, 'right' | 'down']> }> =
  Object.freeze([
    { name: 'Single', cols: 1, rows: 1 },
    { name: 'Split', cols: 2, rows: 1 },
    { name: 'Thirds', cols: 3, rows: 1 },
    { name: 'Stack', cols: 1, rows: 2 },
    { name: 'Grid 2x2', cols: 2, rows: 2 },
    { name: 'Main and two', cols: 2, rows: 2, merge: [[0, 'down']] }
  ])

const key = (name: string): string => name.trim().toLowerCase()

export const isBuiltin = (name: string): boolean => BUILTIN_LAYOUTS.some((l) => key(l.name) === key(name))

/** Every layout you can open: the built-ins, then yours. */
export function allLayouts(saved: ReadonlyArray<SavedLayout>): SavedLayout[] {
  return [...BUILTIN_LAYOUTS, ...saved.filter((l) => !isBuiltin(l.name))]
}

export function findLayout(saved: ReadonlyArray<SavedLayout>, name: string): SavedLayout | undefined {
  return allLayouts(saved).find((l) => key(l.name) === key(name))
}

/** A saved layout -> the layout on screen. */
export function openLayout(s: SavedLayout): Layout {
  const g = gridFromCells(s.cols, s.rows, s.cells)
  return { name: s.name, ...g, colWidths: fractionsFor(s.colWidths, g.cols), rowHeights: fractionsFor(s.rowHeights, g.rows) }
}

/** The layout on screen -> what a save keeps. */
export function toSaved(l: Layout, name = l.name): SavedLayout {
  return {
    name: name.trim(),
    cols: l.cols,
    rows: l.rows,
    colWidths: fractionsFor(l.colWidths, l.cols),
    rowHeights: fractionsFor(l.rowHeights, l.rows),
    cells: gridCells(l)
  }
}

/** Why a layout can't be saved under its name, or null. */
export function saveError(l: SavedLayout, replacing?: string): string | null {
  if (!l.name.trim()) return 'Give the layout a name.'
  if (!l.cells.some((c) => String(c.panelId ?? '').trim())) return 'Put at least one panel in it.'
  if (isBuiltin(l.name) && !(replacing && key(replacing) === key(l.name) && !isBuiltin(replacing)))
    return `"${l.name.trim()}" is a built-in layout. Pick another name.`
  return null
}

/**
 * Save a layout into the list: a layout with the same name (any case) is
 * replaced in place; `replacing` names the one being edited, so a rename
 * drops the old name. Throws the reason when it can't be saved.
 */
export function saveLayout(
  list: ReadonlyArray<SavedLayout>,
  l: SavedLayout,
  replacing?: string,
  now = Date.now()
): SavedLayout[] {
  const err = saveError(l, replacing)
  if (err) throw new Error(err)
  const rec: SavedLayout = {
    name: l.name.trim(),
    cols: clampDim(l.cols, 1),
    rows: clampDim(l.rows, 1),
    colWidths: fractionsFor(l.colWidths, clampDim(l.cols, 1)),
    rowHeights: fractionsFor(l.rowHeights, clampDim(l.rows, 1)),
    cells: l.cells.filter((c) => String(c.panelId ?? '').trim()).map((c) => ({ ...c })),
    updatedAt: now
  }
  const out = list.filter((x) => !(replacing && key(x.name) === key(replacing) && key(replacing) !== key(rec.name)))
  const i = out.findIndex((x) => key(x.name) === key(rec.name))
  if (i >= 0) out[i] = rec
  else out.push(rec)
  return out
}

/** Remove one of your layouts (a built-in can't be removed). */
export function removeLayout(list: ReadonlyArray<SavedLayout>, name: string): SavedLayout[] {
  return list.filter((x) => key(x.name) !== key(name))
}

/** Saved data read back from disk: anything malformed is dropped. */
export function normalizeSaved(raw: unknown): SavedLayout[] {
  if (!Array.isArray(raw)) return []
  const out: SavedLayout[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const l = r as Partial<SavedLayout>
    if (typeof l.name !== 'string' || !l.name.trim() || !Array.isArray(l.cells)) continue
    const cells = l.cells.filter((c) => c && typeof c.panelId === 'string' && c.panelId.trim())
    if (!cells.length || isBuiltin(l.name) || out.some((x) => key(x.name) === key(l.name!))) continue
    out.push({
      name: l.name.trim(),
      cols: clampDim(l.cols, 1),
      rows: clampDim(l.rows, 1),
      colWidths: fractionsFor(l.colWidths, clampDim(l.cols, 1)),
      rowHeights: fractionsFor(l.rowHeights, clampDim(l.rows, 1)),
      cells,
      ...(typeof l.updatedAt === 'number' ? { updatedAt: l.updatedAt } : {})
    })
  }
  return out
}

/** The layout on screen read back from disk, or null. */
export function normalizeCurrent(raw: unknown): Layout | null {
  if (!raw || typeof raw !== 'object') return null
  const l = raw as Partial<Layout>
  if (!Array.isArray(l.cells)) return null
  return openLayout({
    name: typeof l.name === 'string' ? l.name : 'Layout',
    cols: clampDim(l.cols, 1),
    rows: clampDim(l.rows, 1),
    colWidths: l.colWidths,
    rowHeights: l.rowHeights,
    cells: l.cells
  })
}

export const cloneLayout = (l: Layout): Layout => ({
  ...l,
  colWidths: l.colWidths.slice(),
  rowHeights: l.rowHeights.slice(),
  cells: l.cells.map((c) => ({ ...c }))
})

export type Placement = 'already' | 'empty' | 'sticky' | 'column' | 'focused'

/**
 * Where a panel opened from the command center goes in the layout on screen:
 * where it already is; else the first empty cell; else the sticky cell; else
 * a new full-height column on the right (up to MAX_GRID columns); else the
 * focused cell. Returns a new layout and the index of the panel's cell.
 */
export function placePanel(l: Layout, panelId: PanelId, focused = -1): { layout: Layout; idx: number; how: Placement } {
  const at = l.cells.findIndex((c) => c.panelId === panelId)
  if (at >= 0) return { layout: l, idx: at, how: 'already' }
  const next = cloneLayout(l)
  const empty = readingOrder(next).find((i) => !next.cells[i]!.panelId)
  if (empty !== undefined) {
    next.cells[empty]!.panelId = panelId
    return { layout: next, idx: empty, how: 'empty' }
  }
  const sticky = next.cells.findIndex((c) => c.sticky)
  if (sticky >= 0) {
    next.cells[sticky]!.panelId = panelId
    return { layout: next, idx: sticky, how: 'sticky' }
  }
  if (next.cols < MAX_GRID) {
    const share = 1 / (next.cols + 1)
    const total = next.colWidths.reduce((a, b) => a + b, 0) || 1
    next.colWidths = [...next.colWidths.map((w) => +((w / total) * (1 - share)).toFixed(4)), +share.toFixed(4)]
    const col = next.cols
    next.cols += 1
    next.cells.push({ panelId, col, row: 0, colSpan: 1, rowSpan: next.rows })
    return { layout: next, idx: next.cells.length - 1, how: 'column' }
  }
  const idx = next.cells[focused] ? focused : readingOrder(next).at(-1)!
  next.cells[idx]!.panelId = panelId
  return { layout: next, idx, how: 'focused' }
}

/** Empty one cell of the layout on screen (its panel closes). */
export function closeCell(l: Layout, idx: number): Layout {
  const next = cloneLayout(l)
  if (next.cells[idx]) {
    next.cells[idx]!.panelId = ''
    delete next.cells[idx]!.sticky
  }
  return next
}

/** A layout changed on screen (a panel opened or closed) stops being the saved one: it keeps its name until saved. */
export function sameShape(a: SavedLayout, b: SavedLayout): boolean {
  const sig = (l: SavedLayout): string =>
    `${l.cols}x${l.rows}:` +
    l.cells
      .filter((c) => c.panelId)
      .map((c) => `${c.panelId}@${c.col ?? 0},${c.row ?? 0},${c.colSpan ?? 1},${c.rowSpan ?? 1}`)
      .sort()
      .join('|')
  return sig(a) === sig(b)
}
