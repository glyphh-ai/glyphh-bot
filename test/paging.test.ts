import { describe, expect, it } from 'vitest'
import { clampPage, gridFor, keyStep, pageCount, pageOf, paginate, perPage, swipeStep, turnPage, WheelSwipe } from '../src/shared/paging'

describe('home screen pages', () => {
  it('fits whole rows and columns of icons', () => {
    // 104x112 icons with 12px gaps
    expect(gridFor(800, 600)).toEqual({ cols: 7, rows: 4 })
    expect(gridFor(800, 620)).toEqual({ cols: 7, rows: 5 })
    expect(gridFor(500, 360)).toEqual({ cols: 4, rows: 3 })
    expect(gridFor(50, 50)).toEqual({ cols: 1, rows: 1 })
    expect(perPage({ cols: 4, rows: 3 })).toBe(12)
  })

  it('counts and fills the pages', () => {
    expect(pageCount(0, 12)).toBe(1)
    expect(pageCount(12, 12)).toBe(1)
    expect(pageCount(13, 12)).toBe(2)
    expect(pageCount(30, 12)).toBe(3)
    const items = Array.from({ length: 27 }, (_, i) => i)
    const pages = paginate(items, 12)
    expect(pages.map((p) => p.length)).toEqual([12, 12, 3])
    expect(pages[1]![0]).toBe(12)
    expect(paginate([], 12)).toEqual([[]])
    expect(pageOf(11, 12)).toBe(0)
    expect(pageOf(12, 12)).toBe(1)
  })

  it('turns one page at a time and never past the ends', () => {
    expect(turnPage(0, 3, 1)).toBe(1)
    expect(turnPage(2, 3, 1)).toBe(2)
    expect(turnPage(0, 3, -1)).toBe(0)
    expect(turnPage(1, 3, -5)).toBe(0)
    expect(clampPage(5, 2)).toBe(1)
    expect(clampPage(-1, 2)).toBe(0)
  })

  it('arrow keys turn the page', () => {
    expect(keyStep('ArrowRight')).toBe(1)
    expect(keyStep('ArrowLeft')).toBe(-1)
    expect(keyStep('PageDown')).toBe(1)
    expect(keyStep('ArrowDown')).toBe(0)
    expect(keyStep('a')).toBe(0)
  })

  it('a drag far enough left goes forward, right goes back', () => {
    expect(swipeStep(-120)).toBe(1)
    expect(swipeStep(90)).toBe(-1)
    expect(swipeStep(30)).toBe(0)
  })

  it('a trackpad swipe turns exactly one page, then waits for the swipe to end', () => {
    const w = new WheelSwipe(50, 250)
    let t = 0
    const steps: number[] = []
    // one swipe: many small deltaX events, 16ms apart
    for (let i = 0; i < 20; i++) steps.push(w.push(12, 1, (t += 16)))
    expect(steps.filter((s) => s !== 0)).toEqual([1])
    // a quiet gap, then a swipe the other way
    t += 400
    const back: number[] = []
    for (let i = 0; i < 10; i++) back.push(w.push(-15, 0, (t += 16)))
    expect(back.filter((s) => s !== 0)).toEqual([-1])
    // vertical scrolling never turns the page
    t += 400
    expect([w.push(5, 80, (t += 16)), w.push(5, 80, (t += 16)), w.push(50, 90, (t += 16))]).toEqual([0, 0, 0])
  })
})
