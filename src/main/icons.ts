// Connector icons: each service's favicon, fetched once and kept on disk
// next to the data file, so the Connections tab shows the icons Claude shows
// and works offline after the first look.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
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
