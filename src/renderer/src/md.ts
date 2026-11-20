export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Just enough markdown for chat: code, bold, links, headings and line breaks. */
export function md(text: string): string {
  return text
    .split(/```/)
    .map((part, i) => {
      if (i % 2) return `<pre>${esc(part.replace(/^[a-z0-9+#-]*\n/i, ''))}</pre>`
      return esc(part)
        .replace(/`([^`\n]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank">$1</a>')
        .replace(/^#{1,4} (.+)$/gm, '<b>$1</b>')
        .replace(/^\s*DONE\.?\s*$/gm, '<span class="done">DONE</span>')
        .replace(/\n/g, '<br/>')
    })
    .join('')
}

/** A markdown file rendered for reading (the Editor's preview): headings, lists, code, quotes, links. */
export function mdDoc(text: string): string {
  const out: string[] = []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let list: 'ul' | 'ol' | null = null
  let code: string[] | null = null
  const inline = (s: string): string =>
    esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank">$1</a>')
  const endList = (): void => {
    if (list) out.push(`</${list}>`)
    list = null
  }
  for (const line of lines) {
    if (code) {
      if (/^```/.test(line)) {
        out.push(`<pre>${esc(code.join('\n'))}</pre>`)
        code = null
      } else code.push(line)
      continue
    }
    if (/^```/.test(line)) {
      endList()
      code = []
      continue
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      endList()
      out.push(`<h${h[1]!.length}>${inline(h[2]!)}</h${h[1]!.length}>`)
      continue
    }
    const li = line.match(/^\s*([-*+]|\d+\.)\s+(.*)$/)
    if (li) {
      const kind = /\d/.test(li[1]!) ? 'ol' : 'ul'
      if (list !== kind) {
        endList()
        out.push(`<${kind}>`)
        list = kind
      }
      out.push(`<li>${inline(li[2]!)}</li>`)
      continue
    }
    endList()
    if (/^>\s?/.test(line)) out.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`)
    else if (/^(-{3,}|\*{3,})\s*$/.test(line)) out.push('<hr/>')
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`)
  }
  if (code) out.push(`<pre>${esc(code.join('\n'))}</pre>`)
  endList()
  return out.join('\n')
}
