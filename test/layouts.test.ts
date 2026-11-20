import { describe, expect, it } from 'vitest'
import {
  BUILTIN_LAYOUTS,
  CHAT,
  closePanel,
  deskRects,
  frameOf,
  gridFromFrames,
  isPanel,
  mergeDown,
  normalizeCurrent,
  normalizeSaved,
  openLayout,
  openPanel,
  openPanels,
  sameShape,
  saveLayout,
  setPinned,
  splitFrame,
  stackSlots,
  toSaved,
  withPanels,
  type Layout,
  type Rect
} from '../src/shared/layouts'

const r3 = (r: Rect): Rect => ({ x: +r.x.toFixed(3), y: +r.y.toFixed(3), w: +r.w.toFixed(3), h: +r.h.toFixed(3) })
const fresh = (name = 'Default'): Layout => openLayout(BUILTIN_LAYOUTS.find((l) => l.name === name)!)
const open = (l: Layout, ...ids: string[]): Layout => ids.reduce((x, id) => openPanel(x, id).layout, l)
/** Each open panel's place in the panel area, as fractions of the area. */
function places(l: Layout): Record<string, Rect> {
  const r = deskRects(l)
  const a = r.area!
  return Object.fromEntries(
    r.panels.filter((p) => !p.hidden).map((p) => [p.panelId, r3({ x: (p.rect.x - a.x) / a.w, y: p.rect.y, w: p.rect.w / a.w, h: p.rect.h })])
  )
}

describe('stacking: full, under, full, under', () => {
  it('slots for 1 to 6 panels', () => {
    expect(stackSlots(1)).toEqual([{ x: 0, y: 0, w: 1, h: 1 }])
    expect(stackSlots(2)).toEqual([
      { x: 0, y: 0, w: 1, h: 0.5 },
      { x: 0, y: 0.5, w: 1, h: 0.5 }
    ])
    expect(stackSlots(3).map(r3)).toEqual([
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 1 }
    ])
    expect(stackSlots(4).map(r3)).toEqual([
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }
    ])
    expect(stackSlots(5).map(r3)[4]).toEqual({ x: 0.667, y: 0, w: 0.333, h: 1 })
    expect(stackSlots(6).map(r3)[5]).toEqual({ x: 0.667, y: 0.5, w: 0.333, h: 0.5 })
  })

  it('opening 1 to 4 panels on the desk', () => {
    let l = fresh()
    expect(deskRects(l).area).toBeNull()
    expect(deskRects(l).chat).toEqual({ x: 0, y: 0, w: 1, h: 1 })
    l = open(l, 'files')
    expect(places(l)).toEqual({ files: { x: 0, y: 0, w: 1, h: 1 } })
    l = open(l, 'browser')
    expect(places(l)).toEqual({ files: { x: 0, y: 0, w: 1, h: 0.5 }, browser: { x: 0, y: 0.5, w: 1, h: 0.5 } })
    l = open(l, 'editor')
    expect(places(l).editor).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 })
    l = open(l, 'diff')
    expect(places(l).diff).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 })
    expect(places(l).editor).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.5 })
  })

  it('closing reflows: an emptied column goes, its partner fills the height', () => {
    let l = open(fresh(), 'files', 'browser', 'editor', 'diff')
    l = closePanel(l, 'browser')
    expect(places(l)).toEqual({
      files: { x: 0, y: 0, w: 0.5, h: 0.5 },
      editor: { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      diff: { x: 0.5, y: 0, w: 0.5, h: 1 }
    })
    l = closePanel(l, 'editor')
    expect(places(l)).toEqual({ files: { x: 0, y: 0, w: 1, h: 0.5 }, diff: { x: 0, y: 0.5, w: 1, h: 0.5 } })
    l = closePanel(closePanel(l, 'files'), 'diff')
    expect(deskRects(l).area).toBeNull()
    expect(deskRects(l).chat!.w).toBe(1)
  })

  it('re-opening an open panel focuses it instead of opening it twice', () => {
    const l = open(fresh(), 'files', 'browser')
    const again = openPanel(l, 'files')
    expect(again.how).toBe('already')
    expect(openPanels(again.layout)).toEqual(['files', 'browser'])
    expect(openPanel(l, CHAT).how).toBe('chat')
  })

  it('expand fills the desk with one panel and hides the rest; toggled back it returns', () => {
    const l = open(fresh(), 'files', 'browser')
    const ex = deskRects(l, 'browser')
    expect(ex.chat).toBeNull()
    expect(ex.panels.find((p) => p.panelId === 'browser')).toMatchObject({ rect: { x: 0, y: 0, w: 1, h: 1 }, hidden: false })
    expect(ex.panels.find((p) => p.panelId === 'files')!.hidden).toBe(true)
    expect(deskRects(l, null).panels.every((p) => !p.hidden)).toBe(true)
    expect(deskRects(l, CHAT).chat).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })

  it('keeps the chat at its minimum width', () => {
    const l = open(fresh(), 'files')
    expect(deskRects(l, null, false, 0.5).chat!.w).toBe(0.5)
    expect(deskRects(l, null, false, 0.1).chat!.w).toBe(l.chatWidth)
  })
})

describe('layouts and pins', () => {
  it('a layout with empty frames draws only the panels that are open', () => {
    const side = fresh('Side by side')
    expect(deskRects(side).area).toBeNull()
    const one = open(side, 'browser')
    const r = deskRects(one)
    expect(r.frames).toHaveLength(1)
    expect(places(one)).toEqual({ browser: { x: 0, y: 0, w: 1, h: 1 } })
    // The second panel stacks under the first, not into the empty frame.
    expect(places(open(one, 'files')).files).toEqual({ x: 0, y: 0.5, w: 1, h: 0.5 })
  })

  it('a pinned frame takes every new panel', () => {
    const l = fresh('Side by side')
    setPinned(l, 1, true)
    const o = openPanel(l, 'files')
    expect(o.how).toBe('pinned')
    expect(o.how !== 'chat' && o.frame).toBe(1)
    const two = open(o.layout, 'diff')
    expect(frameOf(two, 'diff')).toBe(1)
    expect(places(two)).toEqual({ files: { x: 0, y: 0, w: 1, h: 0.5 }, diff: { x: 0, y: 0.5, w: 1, h: 0.5 } })
    // Into a frame by hand: both frames show, side by side.
    const both = openPanel(two, 'browser', 0).layout
    expect(places(both).browser).toEqual({ x: 0, y: 0, w: 0.5, h: 1 })
    expect(deskRects(both).exact).toBe(true)
  })

  it('pins are saved with the layout and come back', () => {
    const l = fresh('Side by side')
    setPinned(l, 1, true)
    const saved = saveLayout([], toSaved(l, 'Mine'))
    expect(saved[0]!.frames[1]!.pinned).toBe(true)
    const back = openLayout(normalizeSaved(JSON.parse(JSON.stringify(saved)))[0]!)
    expect(back.frames[1]!.pinned).toBe(true)
    expect(sameShape(toSaved(back), saved[0]!)).toBe(true)
    setPinned(back, 1, false)
    expect(sameShape(toSaved(back), saved[0]!)).toBe(false)
  })

  it('the Dev layout opens with its panels in its frames', () => {
    const dev = fresh('Dev')
    expect(openPanels(dev).sort()).toEqual(['browser', 'diff', 'editor', 'files'])
    expect(deskRects(dev).exact).toBe(true)
    // Closing the diff leaves a hole under Files: it collapses (Files fills the column).
    const r = deskRects(closePanel(dev, 'diff'))
    expect(r.panels.find((p) => p.panelId === 'files')!.rect.h).toBeCloseTo(1)
  })

  it('switching layouts keeps the panels you had open', () => {
    const l = open(fresh(), 'files', 'browser')
    const next = withPanels(fresh('Side by side'), openPanels(l))
    expect(openPanels(next)).toEqual(['files', 'browser'])
  })

  it('merge and split keep stacks', () => {
    const g = gridFromFrames(1, 2, [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1, stack: ['files'] },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1, stack: ['diff'] }
    ])
    mergeDown(g, 0)
    expect(g.frames).toHaveLength(1)
    expect(g.frames[0]!.stack).toEqual(['files', 'diff'])
    splitFrame(g, 0)
    expect(g.frames).toHaveLength(2)
  })

  it('old saved data: cells become frames, the gone Swarm panel is dropped', () => {
    expect(isPanel('swarm')).toBe(false)
    expect(isPanel('bot:abc')).toBe(true)
    const cur = normalizeCurrent({
      name: 'Old',
      cols: 2,
      rows: 1,
      cells: [
        { col: 0, row: 0, colSpan: 1, rowSpan: 1, panelId: 'swarm', sticky: true },
        { col: 1, row: 0, colSpan: 1, rowSpan: 1, panelId: 'browser' }
      ]
    })!
    expect(openPanels(cur)).toEqual(['browser'])
    expect(cur.frames[0]!.pinned).toBe(true)
    expect(BUILTIN_LAYOUTS.some((l) => l.name === 'Swarm')).toBe(false)
  })
})
