// Your apps: web pages you add to the home screen. Each opens in its own
// Browser panel with its own session (so its sign-in sticks), and can keep
// its own pages in that panel: any navigation, redirect or new window whose
// address starts with one of the app's prefixes stays in the panel.

export interface WebApp {
  id: string
  name: string
  url: string
  /** A data: URL for the tile, or null for a letter tile. */
  icon: string | null
  /** Addresses that belong to the app, e.g. https://app.slack.com or https://*.slack.com. */
  prefixes: string[]
  /** Keep the app's own pages (by prefix) in its panel instead of opening a new tab. */
  keepInPanel: boolean
}

export interface AppInput {
  url: string
  name?: string
  prefixes?: string[] | string
  keepInPanel?: boolean
}

/** A typed address as a web address: a scheme is added when missing; '' when it isn't one. */
export function normalizeAppUrl(raw: string): string {
  let s = (raw ?? '').trim()
  if (!s) return ''
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = (/^localhost(:|\/|$)/.test(s) ? 'http://' : 'https://') + s
  try {
    const u = new URL(s)
    if (!/^https?:$/.test(u.protocol) || !u.hostname) return ''
    if (u.hostname !== 'localhost' && !u.hostname.includes('.')) return ''
    return u.href
  } catch {
    return ''
  }
}

/** The name a page gets when none is given: its site's name (app.slack.com is Slack), capitalised. */
export function nameFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname
    const parts = host.split('.')
    // example.co.uk: the name is the part before the two-letter country pair
    const tail = parts.length > 2 && parts.at(-1)!.length === 2 && parts.at(-2)!.length <= 3 ? 3 : 2
    const core = parts.length >= tail ? parts[parts.length - tail]! : host
    return core.charAt(0).toUpperCase() + core.slice(1)
  } catch {
    return 'App'
  }
}

/** The letter on a tile with no icon. */
export const letterOf = (name: string): string => (name.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase()

/** The prefixes an app has when none are given: its address's origin. */
export function defaultPrefixes(url: string): string[] {
  try {
    return [new URL(url).origin]
  } catch {
    return []
  }
}

/** Prefixes as typed (one per line or comma-separated), cleaned; none means the app's origin. */
export function normalizePrefixes(raw: string[] | string | undefined, url: string): string[] {
  const list = (Array.isArray(raw) ? raw : (raw ?? '').split(/[\n,]+/)).map((p) => p.trim()).filter(Boolean)
  const out: string[] = []
  for (const p of list) {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(p) ? p : 'https://' + p
    if (!/^https?:\/\/[^/\s]+/i.test(withScheme)) continue
    if (!out.includes(withScheme)) out.push(withScheme)
  }
  return out.length ? out : defaultPrefixes(url)
}

/**
 * Whether an address starts with a prefix. The host may hold `*` for any
 * run of name parts (`https://*.slack.com` matches app.slack.com, a.b.slack.com
 * and slack.com itself); the path, when given, must match from its start and
 * end at a boundary, so https://x.com/app does not take https://x.com/apple.
 */
export function matchesPrefix(url: string, prefix: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)(.*)$/i.exec(prefix.trim())
  if (!m) return false
  const [, scheme, hostPart, rest] = m as unknown as [string, string, string, string]
  if (u.protocol !== scheme.toLowerCase() + ':') return false
  const [hostPat, portPat] = hostPart.toLowerCase().split(/:(?=\d+$)/) as [string, string | undefined]
  if ((portPat ?? '') !== u.port) return false
  const host = u.hostname.toLowerCase()
  if (hostPat.startsWith('*.')) {
    const base = hostPat.slice(2)
    if (base.includes('*')) return false
    if (host !== base && !host.endsWith('.' + base)) return false
  } else if (hostPat.includes('*')) {
    const re = new RegExp('^' + hostPat.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^.]*') + '$')
    if (!re.test(host)) return false
  } else if (host !== hostPat) return false
  const path = rest.replace(/[?#].*$/, '')
  if (!path || path === '/') return true
  const have = u.pathname
  if (!have.startsWith(path)) return false
  return path.endsWith('/') || have.length === path.length || have[path.length] === '/'
}

export const inApp = (app: Pick<WebApp, 'prefixes'>, url: string): boolean => app.prefixes.some((p) => matchesPrefix(url, p))

export type OpenKind = 'navigate' | 'redirect' | 'window'

/**
 * What an app's panel does with a page it is asked to go to.
 * 'stay': load it in the app's own panel (a new window navigates in place).
 * 'block': with the switch on, a page-to-app hand-off (slack://, zoommtg://)
 * from a navigation or redirect is stopped so the panel keeps the app.
 * 'default': what any Browser page does (a navigation or redirect goes ahead
 * in place, a new window opens in the Browser panel).
 */
export function decide(app: Pick<WebApp, 'prefixes' | 'keepInPanel'> | null | undefined, url: string, kind: OpenKind): 'stay' | 'block' | 'default' {
  if (!app || !app.keepInPanel) return 'default'
  if (!/^https?:/i.test(url)) return kind === 'window' || /^(about|data|blob|file):/i.test(url) ? 'default' : 'block'
  return inApp(app, url) ? 'stay' : 'default'
}

/** The session an app's panel uses, kept on disk so its sign-in sticks. */
export const partitionOf = (id: string): string => `persist:app-${id}`

export function makeApp(input: AppInput, id: string, icon: string | null = null): WebApp | null {
  const url = normalizeAppUrl(input.url)
  if (!url) return null
  return {
    id,
    url,
    name: input.name?.trim() || nameFromUrl(url),
    icon,
    prefixes: normalizePrefixes(input.prefixes, url),
    keepInPanel: input.keepInPanel ?? true
  }
}

/** Adds an app, or replaces the one with the same id. */
export function upsertApp(apps: WebApp[], app: WebApp): WebApp[] {
  const i = apps.findIndex((a) => a.id === app.id)
  if (i < 0) return [...apps, app]
  const next = apps.slice()
  next[i] = app
  return next
}

export const removeApp = (apps: WebApp[], id: string): WebApp[] => apps.filter((a) => a.id !== id)

/** Apps as read back from disk: anything broken is dropped, missing fields filled in. */
export function normalizeApps(raw: unknown): WebApp[] {
  if (!Array.isArray(raw)) return []
  const out: WebApp[] = []
  for (const r of raw as Partial<WebApp>[]) {
    if (!r || typeof r.id !== 'string' || !r.id || typeof r.url !== 'string') continue
    const app = makeApp({ url: r.url, name: r.name, prefixes: r.prefixes, keepInPanel: r.keepInPanel }, r.id, typeof r.icon === 'string' ? r.icon : null)
    if (app && !out.some((a) => a.id === app.id)) out.push(app)
  }
  return out
}

/** The apps a home-screen search keeps: the words found in the name or the address. */
export function searchApps(apps: WebApp[], q: string): WebApp[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return apps
  return apps.filter((a) => words.every((w) => a.name.toLowerCase().includes(w) || a.url.toLowerCase().includes(w)))
}

/** Pulls the icon links out of a page, best first: apple-touch-icon, then icon / shortcut icon. */
export function iconLinks(html: string, base: string): string[] {
  const touch: string[] = []
  const plain: string[] = []
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = /\brel\s*=\s*["']?([^"'>]+)/i.exec(tag)?.[1]?.toLowerCase() ?? ''
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? /\bhref\s*=\s*([^\s>]+)/i.exec(tag)?.[1]
    if (!href) continue
    let abs: string
    try {
      abs = new URL(href, base).href
    } catch {
      continue
    }
    if (/apple-touch-icon/.test(rel)) touch.push(abs)
    else if (/(^|\s)icon(\s|$)/.test(rel)) plain.push(abs)
  }
  return [...touch, ...plain]
}
