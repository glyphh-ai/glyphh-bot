import { describe, expect, it } from 'vitest'
import {
  allLayouts,
  applyDrop,
  BUILTIN_LAYOUTS,
  canMergeDown,
  canMergeRight,
  cellAt,
  closeCell,
  dropModeAt,
  emptyGrid,
  findLayout,
  gridCells,
  gridFromCells,
  mergeDown,
  mergeRight,
  moveSeam,
  normalizeCurrent,
  normalizeSaved,
  openLayout,
  placePanel,
  removeLayout,
  resizeGrid,
  sameShape,
  saveError,
  saveLayout,
  setSticky,
  splitCell,
  toSaved,
  type Grid,
  type SavedLayout
} from '../src/shared/layouts'

/** Every position covered by exactly one cell. */
function covered(g: Grid): boolean {
  for (let y = 0; y < g.rows; y++)
    for (let x = 0; x < g.cols; x++) {
      const n = g.cells.filter((c) => x >= c.col && x < c.col + c.colSpan && y >= c.row && y < c.row + c.rowSpan).length
      if (n !== 1) return false
    }
  return true
}

const dev = (): SavedLayout => BUILTIN_LAYOUTS.find((l) => l.name === 'Dev')!

describe('grid', () => {
  it('starts as 1x1 cells and clamps its size', () => {
    const g = emptyGrid(3, 2)
    expect(g.cells).toHaveLength(6)
    expect(covered(g)).toBe(true)
    expect(emptyGrid(99, 0)).toMatchObject({ cols: 6, rows: 1 })
  })

  it('merges right and down only into one matching neighbour, and splits back', () => {
    const g = emptyGrid(2, 2)
    expect(canMergeRight(g, 0)).toBe(true)
    expect(canMergeRight(g, 1)).toBe(false)
    const i = mergeDown(g, 0)
    expect(g.cells[i]).toMatchObject({ col: 0, row: 0, rowSpan: 2 })
    expect(covered(g)).toBe(true)
    // the merged column can't merge right into a single 1x1
    expect(canMergeRight(g, i)).toBe(false)
    expect(canMergeDown(g, cellAt(g, 1, 0))).toBe(true)
    g.cells[i]!.panelId = 'chat'
    splitCell(g, i)
    expect(g.cells).toHaveLength(4)
    expect(g.cells.find((c) => c.col === 0 && c.row === 0)!.panelId).toBe('chat')
    expect(covered(g)).toBe(true)
  })

  it('resizes keeping what fits and filling new positions', () => {
    const g = emptyGrid(2, 2)
    mergeRight(g, 0)
    g.cells[0]!.panelId = 'files'
    resizeGrid(g, 1, 3)
    expect(g.cols).toBe(1)
    expect(g.cells[0]).toMatchObject({ panelId: 'files', colSpan: 1 })
    expect(covered(g)).toBe(true)
  })

  it('keeps one sticky cell at most and never an empty one', () => {
    const g = gridFromCells(2, 1, [{ panelId: 'chat', col: 0, row: 0 }, { panelId: 'browser', col: 1, row: 0 }])
    setSticky(g, 0, true)
    setSticky(g, 1, true)
    expect(g.cells.filter((c) => c.sticky)).toHaveLength(1)
    expect(g.cells[1]!.sticky).toBe(true)
    g.cells[0]!.panelId = ''
    setSticky(g, 0, true)
    expect(g.cells.some((c) => c.sticky)).toBe(false)
  })

  it('drops: the middle swaps, an edge inserts, a full-height column moves as a column', () => {
    expect(dropModeAt(0.5, 0.5)).toBe('swap')
    expect(dropModeAt(0.1, 0.5)).toBe('before')
    expect(dropModeAt(0.9, 0.5)).toBe('after')

    const g = gridFromCells(3, 1, [
      { panelId: 'a', col: 0, row: 0 },
      { panelId: 'b', col: 1, row: 0 },
      { panelId: 'c', col: 2, row: 0 }
    ])
    applyDrop(g, 0, 2, 'swap')
    expect(gridCells(g).map((c) => c.panelId)).toEqual(['c', 'b', 'a'])

    const l = openLayout(dev())
    const browser = l.cells.findIndex((c) => c.panelId === 'browser')
    const files = l.cells.findIndex((c) => c.panelId === 'files')
    // browser is a full-height column: dropping it before the files column moves the column
    applyDrop(l, browser, files, 'before')
    expect(l.cells.find((c) => c.panelId === 'browser')!.col).toBe(0)
    expect(covered(l)).toBe(true)
  })

  it('skips saved cells that overlap or fall outside', () => {
    const g = gridFromCells(2, 1, [
      { panelId: 'a', col: 0, row: 0, colSpan: 2 },
      { panelId: 'b', col: 1, row: 0 },
      { panelId: 'c', col: 5, row: 0 }
    ])
    expect(g.cells).toHaveLength(1)
    expect(g.cells[0]!.panelId).toBe('a')
  })
})

describe('seams', () => {
  it('moves a seam and keeps 8% on each side', () => {
    expect(moveSeam([0.5, 0.5], 0, 0.3)).toEqual([0.3, 0.7])
    expect(moveSeam([0.5, 0.5], 0, 0)).toEqual([0.08, 0.92])
    expect(moveSeam([0.25, 0.25, 0.5], 1, 0.9)).toEqual([0.25, 0.65, 0.1])
    expect(moveSeam([0.25, 0.25, 0.5], 1, 0.99)).toEqual([0.25, 0.67, 0.08])
    expect(moveSeam([0.5, 0.5], 1, 0.3)).toEqual([0.5, 0.5])
  })
})

describe('saved layouts', () => {
  it('opens a built-in and saves it back to the same shape', () => {
    const l = openLayout(dev())
    expect(l.cells.map((c) => c.panelId).filter(Boolean).sort()).toEqual(['browser', 'diff', 'editor', 'files'])
    expect(l.colWidths).toEqual([0.22, 0.42, 0.36])
    expect(sameShape(toSaved(l), dev())).toBe(true)
    expect(sameShape(toSaved(closeCell(l, 0)), dev())).toBe(false)
  })

  it('refuses no name, no panels and built-in names', () => {
    const base = toSaved(openLayout(dev()), 'Mine')
    expect(saveError({ ...base, name: '  ' })).toMatch(/name/)
    expect(saveError({ ...base, cells: [] })).toMatch(/panel/)
    expect(saveError({ ...base, name: 'dev' })).toMatch(/built-in/)
    expect(saveError(base)).toBeNull()
    expect(() => saveLayout([], { ...base, name: 'Chat' })).toThrow(/built-in/)
  })

  it('saves, replaces by name in any case, renames and removes', () => {
    const base = toSaved(openLayout(dev()), 'Mine')
    let list = saveLayout([], base, undefined, 1)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ name: 'Mine', updatedAt: 1 })

    list = saveLayout(list, { ...base, name: 'MINE', cols: 2 }, undefined, 2)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ name: 'MINE', cols: 2, updatedAt: 2 })

    list = saveLayout(list, { ...base, name: 'Work' }, 'MINE', 3)
    expect(list.map((l) => l.name)).toEqual(['Work'])

    list = saveLayout(list, { ...base, name: 'Other' }, undefined, 4)
    expect(allLayouts(list).map((l) => l.name)).toEqual([...BUILTIN_LAYOUTS.map((l) => l.name), 'Work', 'Other'])
    expect(findLayout(list, 'work')!.name).toBe('Work')
    expect(removeLayout(list, 'WORK').map((l) => l.name)).toEqual(['Other'])
  })

  it('round-trips through JSON on disk and drops what is malformed', () => {
    const base = toSaved(openLayout(dev()), 'Mine')
    const list = saveLayout([], base, undefined, 5)
    const back = normalizeSaved(JSON.parse(JSON.stringify([...list, null, { name: 'x' }, { name: 'Dev', cells: [{ panelId: 'chat' }] }, { ...list[0], name: 'mine' }])))
    expect(back).toEqual(list)
    expect(sameShape(back[0]!, dev())).toBe(true)
    expect(normalizeSaved('nope')).toEqual([])

    const onScreen = openLayout(back[0]!)
    expect(normalizeCurrent(JSON.parse(JSON.stringify(onScreen)))).toEqual(onScreen)
    expect(normalizeCurrent(null)).toBeNull()
  })
})

describe('placing a panel', () => {
  it('finds it, then an empty cell, then the sticky cell, then a new column, then the focused cell', () => {
    const chat = openLayout(BUILTIN_LAYOUTS[0]!)
    expect(placePanel(chat, 'chat').how).toBe('already')

    const col = placePanel(chat, 'browser')
    expect(col.how).toBe('column')
    expect(col.layout.cols).toBe(2)
    expect(col.layout.cells[col.idx]).toMatchObject({ panelId: 'browser', col: 1, rowSpan: 1 })
    expect(col.layout.colWidths.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3)
    expect(chat.cols).toBe(1) // the original is untouched

    const withHole = closeCell(openLayout(dev()), 0)
    expect(placePanel(withHole, 'swarm')).toMatchObject({ how: 'empty', idx: 0 })

    const full = openLayout(dev())
    const sticky = placePanel(full, 'bot:juno')
    expect(sticky.how).toBe('sticky')
    expect(sticky.layout.cells[sticky.idx]!.panelId).toBe('bot:juno')

    const wide = openLayout({ name: 'Wide', cols: 6, rows: 1, cells: ['a', 'b', 'c', 'd', 'e', 'f'].map((p, i) => ({ panelId: p, col: i, row: 0 })) })
    expect(placePanel(wide, 'chat', 2)).toMatchObject({ how: 'focused', idx: 2 })
  })
})
