// The home screen's pages, the way iOS pages its icons: as many whole rows of
// icons as fit, then the next page; a swipe, a drag or an arrow key turns
// the page, and the dots underneath say which one is on screen.

export interface PageGrid {
  cols: number
  rows: number
}

/** How many icons fit across and down an area, each icon cell w by h with gap between. */
export function gridFor(width: number, height: number, cell = { w: 104, h: 112 }, gap = 12): PageGrid {
  const cols = Math.max(1, Math.floor((width + gap) / (cell.w + gap)))
  const rows = Math.max(1, Math.floor((height + gap) / (cell.h + gap)))
  return { cols, rows }
}

export const perPage = (g: PageGrid): number => Math.max(1, g.cols * g.rows)

export const pageCount = (n: number, per: number): number => Math.max(1, Math.ceil(n / Math.max(1, per)))

/** The items on each page, in order. */
export function paginate<T>(items: readonly T[], per: number): T[][] {
  const size = Math.max(1, per)
  const pages: T[][] = []
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size))
  return pages.length ? pages : [[]]
}

/** A page number kept on the pages there are. */
export const clampPage = (page: number, count: number): number => Math.max(0, Math.min(Math.max(1, count) - 1, page))

/** The page after a step of -1 or +1 (or none), never past the first or the last. */
export const turnPage = (page: number, count: number, step: number): number => clampPage(page + Math.sign(step), count)

/** The page an icon is on. */
export const pageOf = (index: number, per: number): number => Math.floor(Math.max(0, index) / Math.max(1, per))

/** A drag or a swipe of dx pixels: far enough left is the next page (+1), right the one before (-1). */
export const swipeStep = (dx: number, threshold = 60): number => (Math.abs(dx) < threshold ? 0 : dx < 0 ? 1 : -1)

/**
 * A trackpad's horizontal swipe arrives as many wheel events; they add up
 * until they cross the threshold, turn one page, then wait for the swipe to
 * end (a quiet gap) before another can turn it.
 */
export class WheelSwipe {
  private sum = 0
  private spent = false
  private last = 0
  constructor(
    private threshold = 50,
    private quietMs = 250
  ) {}
  /** deltaX of one wheel event at time t (ms); returns the page step it makes: -1, 0 or +1. */
  push(deltaX: number, deltaY: number, t: number): number {
    if (t - this.last > this.quietMs) {
      this.sum = 0
      this.spent = false
    }
    this.last = t
    if (Math.abs(deltaX) <= Math.abs(deltaY)) return 0
    if (this.spent) return 0
    this.sum += deltaX
    if (Math.abs(this.sum) < this.threshold) return 0
    this.spent = true
    const step = this.sum > 0 ? 1 : -1
    this.sum = 0
    return step
  }
}

/** The page step an arrow key makes (left: back, right: forward), or 0. */
export const keyStep = (key: string): number => (key === 'ArrowRight' || key === 'PageDown' ? 1 : key === 'ArrowLeft' || key === 'PageUp' ? -1 : 0)
