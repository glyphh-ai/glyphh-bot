/** What the browser's address bar text means: a url as is, a host given a scheme, anything else a search. */
export function toUrl(raw: string): string {
  const next = raw.trim()
  if (!next) return ''
  if (/^[a-z]+:\/\//i.test(next)) return next
  if (/^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?(\/|$)/.test(next)) return (next.startsWith('localhost') ? 'http://' : 'https://') + next
  return `https://duckduckgo.com/?q=${encodeURIComponent(next)}`
}
