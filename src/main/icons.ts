// Connector icons: each service's favicon, fetched once and kept on disk
// next to the data file, so the Connections tab shows the icons Claude shows
// and works offline after the first look.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { iconLinks } from '../shared/apps'
import { iconFile } from '../shared/connectors'
import { dataDir } from './store'

const memo = new Map<string, Promise<string | null>>()

async function fetchIcon(domain: string): Promise<Buffer | null> {
  const sources = [
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`,
    `https://${domain}/favicon.ico`
  ]
  for (const url of sources) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
      if (!res.ok) continue
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length > 100) return buf
    } catch {
      // try the next source
    }
  }
  return null
}

function mimeOf(buf: Buffer, type: string | null): string {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png'
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg'
  if (buf[0] === 0 && buf[1] === 0 && buf[2] === 1) return 'image/x-icon'
  if (buf.subarray(0, 4).toString() === 'GIF8') return 'image/gif'
  if (buf.subarray(0, 4).toString() === 'RIFF') return 'image/webp'
  if (/<svg/i.test(buf.subarray(0, 512).toString())) return 'image/svg+xml'
  return type?.split(';')[0] || 'image/png'
}

async function image(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const type = res.headers.get('content-type')
    if (type && /text\/html/i.test(type)) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 100) return null
    return `data:${mimeOf(buf, type)};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

/**
 * A web app's tile icon as a data url: the page's apple-touch-icon, then its
 * declared icon, then /apple-touch-icon.png and /favicon.ico, then Google's
 * favicon service; null means the tile shows the app's letter.
 */
export async function appIcon(pageUrl: string): Promise<string | null> {
  let origin: string
  try {
    const u = new URL(pageUrl)
    if (!/^https?:$/.test(u.protocol)) return null
    origin = u.origin
  } catch {
    return null
  }
  let links: string[] = []
  try {
    const res = await fetch(pageUrl, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130 Safari/537.36' } })
    if (res.ok) links = iconLinks(await res.text(), res.url || pageUrl)
  } catch {
    // the page did not answer: the fixed places are still worth a try
  }
  const host = new URL(origin).hostname
  const tries = [...links, `${origin}/apple-touch-icon.png`, `${origin}/favicon.ico`, `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`]
  for (const t of [...new Set(tries)]) {
    const got = await image(t)
    if (got) return got
  }
  return null
}

/** The icon for a service's site as a data url, or null for the neutral icon. */
export function connectorIcon(domain: string): Promise<string | null> {
  if (!/^[a-z0-9.-]+$/i.test(domain)) return Promise.resolve(null)
  let p = memo.get(domain)
  if (!p) {
    p = (async () => {
      const dir = join(dataDir(), 'icons')
      const file = join(dir, iconFile(domain))
      let buf: Buffer | null = existsSync(file) ? readFileSync(file) : null
      if (!buf) {
        buf = await fetchIcon(domain)
        if (buf) {
          mkdirSync(dir, { recursive: true })
          writeFileSync(file, buf)
        }
      }
      if (!buf) memo.delete(domain)
      return buf ? `data:image/png;base64,${buf.toString('base64')}` : null
    })()
    memo.set(domain, p)
  }
  return p
}
