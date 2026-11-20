import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  decide,
  defaultPrefixes,
  iconLinks,
  inApp,
  letterOf,
  makeApp,
  matchesPrefix,
  nameFromUrl,
  normalizeAppUrl,
  normalizeApps,
  normalizePrefixes,
  partitionOf,
  removeApp,
  searchApps,
  upsertApp,
  type WebApp
} from '../src/shared/apps'
import {
  BUILTIN_LAYOUTS,
  appOfPanel,
  deskRects,
  freshWebPanel,
  isPanel,
  openLayout,
  openPanel,
  openPanels,
  setPinned,
  webPanel,
  type Layout
} from '../src/shared/layouts'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))

const slack = (over: Partial<WebApp> = {}): WebApp => ({ ...makeApp({ url: 'https://app.slack.com/client' }, 's1')!, ...over })

describe('apps: add, edit, remove', () => {
  it('an address gets a scheme, a name from its host, and its origin as the prefix', () => {
    expect(normalizeAppUrl('app.slack.com')).toBe('https://app.slack.com/')
    expect(normalizeAppUrl('localhost:3000')).toBe('http://localhost:3000/')
    expect(normalizeAppUrl('not an address')).toBe('')
    expect(normalizeAppUrl('ftp://x.com')).toBe('')
    expect(nameFromUrl('https://www.notion.so/x')).toBe('Notion')
    expect(nameFromUrl('https://app.slack.com/client')).toBe('Slack')
    expect(nameFromUrl('https://www.bbc.co.uk/')).toBe('Bbc')
    expect(nameFromUrl('http://localhost:3000/')).toBe('Localhost')
    const a = makeApp({ url: 'linear.app/team' }, 'a1')!
    expect(a).toEqual({ id: 'a1', url: 'https://linear.app/team', name: 'Linear', icon: null, prefixes: ['https://linear.app'], keepInPanel: true })
    expect(makeApp({ url: 'linear.app', name: '  My Linear ' }, 'a2')!.name).toBe('My Linear')
    expect(makeApp({ url: 'nope' }, 'a3')).toBeNull()
  })

  it('adds, replaces by id and removes', () => {
    const a = makeApp({ url: 'linear.app' }, 'a')!
    const b = makeApp({ url: 'figma.com' }, 'b')!
    let apps = upsertApp(upsertApp([], a), b)
    expect(apps.map((x) => x.name)).toEqual(['Linear', 'Figma'])
    apps = upsertApp(apps, { ...a, name: 'Tickets' })
    expect(apps.map((x) => x.name)).toEqual(['Tickets', 'Figma'])
    apps = removeApp(apps, 'a')
    expect(apps.map((x) => x.id)).toEqual(['b'])
  })

  it('reads back what was saved, drops what is broken, fills in what is missing', () => {
    const saved = JSON.parse(
      JSON.stringify([
        makeApp({ url: 'linear.app' }, 'a'),
        { id: 'old', url: 'https://figma.com', name: 'Figma' },
        { id: '', url: 'https://x.com' },
        { id: 'bad', url: 'not a url' },
        { id: 'a', url: 'https://dupe.com' },
        null
      ])
    )
    const apps = normalizeApps(saved)
    expect(apps.map((a) => a.id)).toEqual(['a', 'old'])
    expect(apps[1]).toMatchObject({ prefixes: ['https://figma.com'], keepInPanel: true, icon: null })
    expect(normalizeApps('junk')).toEqual([])
  })

  it('a tile with no icon shows its first letter', () => {
    expect(letterOf('slack')).toBe('S')
    expect(letterOf('  9gag')).toBe('9')
    expect(letterOf('***')).toBe('?')
  })

  it('the search finds apps by name or address', () => {
    const apps = [makeApp({ url: 'app.slack.com' }, 'a')!, makeApp({ url: 'linear.app', name: 'Tickets' }, 'b')!]
    expect(searchApps(apps, 'tick').map((a) => a.id)).toEqual(['b'])
    expect(searchApps(apps, 'linear').map((a) => a.id)).toEqual(['b'])
    expect(searchApps(apps, 'slack app').map((a) => a.id)).toEqual(['a'])
    expect(searchApps(apps, '')).toHaveLength(2)
  })

  it('each app has its own kept session', () => {
    expect(partitionOf('s1')).toBe('persist:app-s1')
  })
})

describe('apps: persisted with the other settings', () => {
  let dir = ''
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gb-apps-'))
    process.env.GLYPHH_BOT_DATA = dir
    vi.resetModules()
  })
  afterEach(() => {
    delete process.env.GLYPHH_BOT_DATA
  })

  it('an added app is in the data file and loads back after a restart; a removed one is gone', async () => {
    const store = await import('../src/main/store')
    const a = makeApp({ url: 'app.slack.com', prefixes: 'https://*.slack.com\nslack-edge.com' }, 'a')!
    store.update((d) => (d.apps = upsertApp(d.apps, a)))
    const file = JSON.parse(readFileSync(join(dir, 'glyphh-bot.json'), 'utf8'))
    expect(file.apps[0]).toMatchObject({ id: 'a', name: 'Slack', prefixes: ['https://*.slack.com', 'https://slack-edge.com'] })
    expect(file.settings).toBeTruthy()

    vi.resetModules()
    const again = await import('../src/main/store')
    expect(again.load().apps).toEqual([a])
    again.update((d) => (d.apps = removeApp(d.apps, 'a')))
    vi.resetModules()
    expect((await import('../src/main/store')).load().apps).toEqual([])
  })
})

describe('apps: icons', () => {
  const png = (): Response => {
    const b = Buffer.alloc(200)
    b[0] = 0x89
    b[1] = 0x50
    return new Response(b, { headers: { 'content-type': 'image/png' } })
  }
  afterEach(() => vi.unstubAllGlobals())

  it('finds the apple-touch-icon first, then declared icons', () => {
    const html = `<head><link rel="icon" href="/favicon-32.png"><link rel="apple-touch-icon" sizes="180x180" href="https://cdn.x.com/touch.png"><link rel="shortcut icon" href=fav.ico></head>`
    expect(iconLinks(html, 'https://x.com/app/')).toEqual(['https://cdn.x.com/touch.png', 'https://x.com/favicon-32.png', 'https://x.com/app/fav.ico'])
    expect(iconLinks('<p>no links</p>', 'https://x.com')).toEqual([])
  })

  it('takes the page’s apple-touch-icon', async () => {
    const asked: string[] = []
    vi.stubGlobal('fetch', async (u: string) => {
      asked.push(u)
      if (u === 'https://x.com/') return new Response('<link rel="apple-touch-icon" href="/t.png">', { headers: { 'content-type': 'text/html' } })
      if (u === 'https://x.com/t.png') return png()
      return new Response('', { status: 404 })
    })
    const { appIcon } = await import('../src/main/icons')
    expect(await appIcon('https://x.com/')).toMatch(/^data:image\/png;base64,/)
    expect(asked).toEqual(['https://x.com/', 'https://x.com/t.png'])
  })

  it('falls back to /favicon.ico when the page declares nothing', async () => {
    vi.stubGlobal('fetch', async (u: string) => {
      if (u === 'https://y.com/favicon.ico') {
        const b = Buffer.alloc(300)
        b[2] = 1
        return new Response(b)
      }
      if (u === 'https://y.com/') return new Response('<html></html>', { headers: { 'content-type': 'text/html' } })
      return new Response('', { status: 404 })
    })
    const { appIcon } = await import('../src/main/icons')
    expect(await appIcon('https://y.com/')).toMatch(/^data:image\/x-icon;base64,/)
  })

  it('gives null (the letter tile) when nothing answers or the answer is a page', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html>not found</html>', { headers: { 'content-type': 'text/html' } }))
    const { appIcon } = await import('../src/main/icons')
    expect(await appIcon('https://z.com/')).toBeNull()
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline')
    })
    expect(await appIcon('https://z.com/')).toBeNull()
    expect(await appIcon('file:///etc/passwd')).toBeNull()
  })
})

describe('apps: prefixes', () => {
  it('none given means the app address’s origin; typed ones are cleaned', () => {
    expect(defaultPrefixes('https://app.slack.com/client/T1')).toEqual(['https://app.slack.com'])
    expect(normalizePrefixes('', 'https://app.slack.com/x')).toEqual(['https://app.slack.com'])
    expect(normalizePrefixes(' https://*.slack.com , slack.com\n\nhttps://*.slack.com', 'https://app.slack.com')).toEqual(['https://*.slack.com', 'https://slack.com'])
    expect(normalizePrefixes(['', '  '], 'http://localhost:3000/')).toEqual(['http://localhost:3000'])
  })

  it('matches the scheme, the host and the port exactly', () => {
    expect(matchesPrefix('https://app.slack.com/client', 'https://app.slack.com')).toBe(true)
    expect(matchesPrefix('http://app.slack.com/', 'https://app.slack.com')).toBe(false)
    expect(matchesPrefix('https://app.slack.com.evil.com/', 'https://app.slack.com')).toBe(false)
    expect(matchesPrefix('https://evilapp.slack.com/', 'https://app.slack.com')).toBe(false)
    expect(matchesPrefix('http://localhost:3000/a', 'http://localhost:3000')).toBe(true)
    expect(matchesPrefix('http://localhost:4000/a', 'http://localhost:3000')).toBe(false)
    expect(matchesPrefix('not a url', 'https://x.com')).toBe(false)
    expect(matchesPrefix('https://x.com', 'garbage')).toBe(false)
  })

  it('a *. host takes the domain and every subdomain, never a lookalike', () => {
    const p = 'https://*.slack.com'
    expect(matchesPrefix('https://app.slack.com/client', p)).toBe(true)
    expect(matchesPrefix('https://acme.enterprise.slack.com/', p)).toBe(true)
    expect(matchesPrefix('https://slack.com/signin', p)).toBe(true)
    expect(matchesPrefix('https://notslack.com/', p)).toBe(false)
    expect(matchesPrefix('https://slack.com.evil.io/', p)).toBe(false)
    expect(matchesPrefix('https://APP.Slack.com/', p)).toBe(true)
  })

  it('a * inside a host part matches within that part only', () => {
    expect(matchesPrefix('https://eu-west.auth.x.com/', 'https://*-west.auth.x.com')).toBe(true)
    expect(matchesPrefix('https://a.b.auth.x.com/', 'https://auth*.x.com')).toBe(false)
    expect(matchesPrefix('https://auth2.x.com/', 'https://auth*.x.com')).toBe(true)
  })

  it('a path prefix matches from its start and stops at a boundary', () => {
    const p = 'https://accounts.google.com/o/oauth2'
    expect(matchesPrefix('https://accounts.google.com/o/oauth2/auth?x=1', p)).toBe(true)
    expect(matchesPrefix('https://accounts.google.com/o/oauth2', p)).toBe(true)
    expect(matchesPrefix('https://accounts.google.com/o/oauth22', p)).toBe(false)
    expect(matchesPrefix('https://accounts.google.com/signin', p)).toBe(false)
    expect(matchesPrefix('https://x.com/apple', 'https://x.com/app/')).toBe(false)
    expect(matchesPrefix('https://x.com/app/1', 'https://x.com/app/')).toBe(true)
  })
})

describe('apps: what a panel does with a page', () => {
  const app = slack({ prefixes: ['https://*.slack.com', 'https://accounts.google.com/o/oauth2'] })

  it('keeps the app’s own pages, redirects and new windows in its panel', () => {
    expect(decide(app, 'https://acme.slack.com/ssb/redirect', 'redirect')).toBe('stay')
    expect(decide(app, 'https://app.slack.com/client/T1', 'window')).toBe('stay')
    expect(decide(app, 'https://slack.com/signin', 'navigate')).toBe('stay')
    expect(decide(app, 'https://accounts.google.com/o/oauth2/v2/auth', 'window')).toBe('stay')
  })

  it('leaves pages outside the prefixes to the current behaviour', () => {
    expect(decide(app, 'https://example.com/', 'window')).toBe('default')
    expect(decide(app, 'https://example.com/', 'navigate')).toBe('default')
    expect(decide(app, 'https://accounts.google.com/signin', 'redirect')).toBe('default')
  })

  it('stops a hand-off to the desktop app (slack://) so the panel keeps it', () => {
    expect(decide(app, 'slack://open?team=T1', 'redirect')).toBe('block')
    expect(decide(app, 'slack://open', 'navigate')).toBe('block')
    expect(decide(app, 'about:blank', 'navigate')).toBe('default')
  })

  it('with the switch off, or for the plain Browser, nothing changes', () => {
    const off = { ...app, keepInPanel: false }
    expect(decide(off, 'https://app.slack.com/', 'window')).toBe('default')
    expect(decide(off, 'slack://open', 'redirect')).toBe('default')
    expect(decide(null, 'https://app.slack.com/', 'window')).toBe('default')
    expect(inApp(app, 'https://app.slack.com/')).toBe(true)
  })
})

describe('apps and the terminal stack in like every panel', () => {
  const fresh = (name = 'Default'): Layout => openLayout(BUILTIN_LAYOUTS.find((l) => l.name === name)!)

  it('the terminal is a panel and stacks full, then under', () => {
    expect(isPanel('terminal')).toBe(true)
    let l = fresh()
    let o = openPanel(l, 'terminal')
    expect(o.how).toBe('empty')
    l = o.layout
    o = openPanel(l, 'files')
    expect(o.how).toBe('stack')
    l = o.layout
    expect(openPanels(l)).toEqual(['terminal', 'files'])
    const r = deskRects(l)
    const t = r.panels.find((p) => p.panelId === 'terminal')!.rect
    const f = r.panels.find((p) => p.panelId === 'files')!.rect
    expect(t.y).toBe(0)
    expect(f.y).toBeCloseTo(0.5)
    expect(t.x).toBeCloseTo(f.x)
  })

  it('each click on an app opens a new panel of its own', () => {
    let l = fresh()
    const a = freshWebPanel(l, 'slack')
    expect(a).toBe('web:slack:1')
    expect(isPanel(a)).toBe(true)
    expect(appOfPanel(a)).toBe('slack')
    l = openPanel(l, a).layout
    const b = freshWebPanel(l, 'slack')
    expect(b).toBe('web:slack:2')
    l = openPanel(l, b).layout
    expect(openPanels(l)).toEqual([a, b])
    expect(appOfPanel('web:x')).toBeNull()
    expect(webPanel('z', 3)).toBe('web:z:3')
  })

  it('a pinned frame takes the app panel', () => {
    const l = fresh('Side by side')
    setPinned(l, 1, true)
    const o = openPanel(openPanel(l, 'terminal').layout, freshWebPanel(l, 'slack'))
    expect(o.how).toBe('pinned')
    expect(o.layout.frames[1]!.stack).toContain('web:slack:1')
  })
})
