import { describe, expect, it } from 'vitest'
import { attachmentPath } from '../src/main/files'
import { connectorDomain, connectorLabel, iconFile } from '../src/shared/connectors'
import {
  archivedRecents,
  groupRecents,
  normalizeRecents,
  removeRecent,
  setArchivedRecent,
  setPinnedRecent,
  titleFrom,
  upsertRecent,
  type Recent
} from '../src/shared/recents'
import { changedFiles, fileKind, fileSize, toolSummary } from '../src/renderer/src/chatBits'
import { diffStat, imageSrc, inline, renderMarkdown } from '../src/renderer/src/md'

const rec = (id: string, folder: string, updatedAt: number, extra: Partial<Recent> = {}): Recent => ({
  id,
  room: 'crew',
  title: id,
  folder,
  updatedAt,
  msgs: [{ role: 'user', text: id }],
  ...extra
})

describe('recents', () => {
  const list = [rec('a', '/w/site', 1), rec('b', '/w/game', 3), rec('c', '/w/site', 2), rec('d', '/w/game', 4, { pinned: true })]

  it('groups Pinned first, then each folder, newest first', () => {
    const g = groupRecents(list)
    expect(g.map((s) => s.title)).toEqual(['Pinned', 'game', 'site'])
    expect(g[0]!.items.map((r) => r.id)).toEqual(['d'])
    expect(g[2]!.items.map((r) => r.id)).toEqual(['c', 'a'])
  })

  it('pin, archive, restore and delete', () => {
    let l = setPinnedRecent(list, 'a', true)
    expect(groupRecents(l)[0]!.items.map((r) => r.id)).toEqual(['d', 'a'])
    l = setArchivedRecent(l, 'a', true)
    expect(l.find((r) => r.id === 'a')!.pinned).toBeFalsy()
    expect(groupRecents(l).flatMap((s) => s.items).some((r) => r.id === 'a')).toBe(false)
    expect(archivedRecents(l).map((r) => r.id)).toEqual(['a'])
    l = setArchivedRecent(l, 'a', false)
    expect(archivedRecents(l)).toEqual([])
    l = removeRecent(l, 'b')
    expect(l.map((r) => r.id)).toEqual(['a', 'c', 'd'])
  })

  it('a chat saving itself keeps its pin and archive', () => {
    const l = upsertRecent(setPinnedRecent(list, 'c', true), rec('c', '/w/site', 9, { title: 'new' }))
    expect(l.find((r) => r.id === 'c')).toMatchObject({ pinned: true, title: 'new', updatedAt: 9 })
    expect(upsertRecent(list, rec('e', '', 5))).toHaveLength(5)
  })

  it('titles and normalizing', () => {
    expect(titleFrom('  Build   me a site  ')).toBe('Build me a site')
    expect(titleFrom('x'.repeat(80), 20)).toHaveLength(20)
    expect(titleFrom('')).toBe('New chat')
    const n = normalizeRecents([...list, { id: 1 }, null, rec('z', '/w', 0, { pinned: true })], 3)
    expect(n.map((r) => r.id)).toEqual(['d', 'z', 'b'])
  })
})

describe('connectors', () => {
  it('maps names and urls to the service site', () => {
    expect(connectorDomain('claude.ai Gmail')).toBe('mail.google.com')
    expect(connectorDomain('claude.ai Google Calendar')).toBe('calendar.google.com')
    expect(connectorDomain('plugin:stripe:stripe')).toBe('stripe.com')
    expect(connectorDomain('claude.ai Glyphh')).toBe('glyphh.ai')
    expect(connectorDomain('my-server', 'https://mcp.acme.io/sse')).toBe('acme.io')
    expect(connectorDomain('local', 'http://localhost:3000')).toBeNull()
    expect(connectorDomain('mystery')).toBeNull()
    expect(connectorLabel('claude.ai Slack')).toBe('Slack')
    expect(connectorLabel('plugin:glyphh:glyphh')).toBe('glyphh')
    expect(iconFile('mail.google.com')).toBe('mail.google.com.png')
  })
})

describe('attachments', () => {
  it('go to attachments/ with a free, safe name', () => {
    const taken = new Set(['attachments/shot.png', 'attachments/shot-2.png'])
    expect(attachmentPath('shot.png', (p) => taken.has(p))).toBe('attachments/shot-3.png')
    expect(attachmentPath('../../etc/pass wd', () => false)).toBe('attachments/pass wd')
    expect(attachmentPath('a<b>.txt', () => false)).toBe('attachments/a_b_.txt')
    expect(attachmentPath('', () => false)).toBe('attachments/file')
  })
})

describe('markdown', () => {
  it('headings, lists, task lists and tables', () => {
    const h = renderMarkdown('# Plan\n\n- one\n- [x] done\n- [ ] todo\n  - nested\n\n1. first\n2. second\n\n| a | b |\n|---|--:|\n| 1 | 2 |')
    expect(h).toContain('<h1>Plan</h1>')
    expect(h).toContain('<li class="task"><input type="checkbox" disabled checked/> done')
    expect(h).toContain('<li class="task"><input type="checkbox" disabled/> todo')
    expect(h.match(/<ul>/g)).toHaveLength(2)
    expect(h).toContain('<ol>')
    expect(h).toContain('<th>a</th><th style="text-align:right">b</th>')
    expect(h).toContain('<td>1</td>')
    expect(renderMarkdown('| a | b |\n|-|:-:|\n| 1 | 2 |')).toContain('<th style="text-align:center">b</th>')
    expect(renderMarkdown('a | b\nnot a table')).not.toContain('<table>')
  })

  it('code blocks get a language, Copy and Open in editor; an open fence shows while streaming', () => {
    const h = renderMarkdown('```ts\nconst a = 1 < 2\n```')
    expect(h).toContain('data-lang="ts"')
    expect(h).toContain('data-act="copy"')
    expect(h).toContain('data-act="edit"')
    expect(h).toContain('const a = 1 &lt; 2')
    expect(renderMarkdown('hi\n```js\nlet x')).toContain('let x')
  })

  it('diffs fold with their counts; mermaid and math are marked for drawing', () => {
    const d = renderMarkdown('```diff\n--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-old\n+new\n+more\n```')
    expect(d).toContain('<details class="mdiff" open>')
    expect(d).toContain('x.ts')
    expect(d).toContain('+2')
    expect(d).toContain('<div class="a">+new</div>')
    expect(diffStat('+a\n-b\n+++ c\n')).toEqual({ added: 1, removed: 1 })
    expect(renderMarkdown('```mermaid\ngraph TD; A-->B\n```')).toContain('class="mermaid-src"')
    expect(renderMarkdown('$$\nx^2\n$$')).toContain('class="math block" data-tex="x^2"')
    expect(inline('area is $\\pi r^2$ here')).toContain('class="math i"')
    expect(inline('costs $5 or $10')).not.toContain('math')
  })

  it('links open in the app, images read from the folder, text is escaped', () => {
    const t = inline('see [docs](https://x.dev/a) and https://y.dev/b. **bold** *it* ~~no~~ `a<b>` <script>')
    expect(t).toContain('data-link="https://x.dev/a"')
    expect(t).toContain('data-link="https://y.dev/b"')
    expect(t).toContain('<b>bold</b>')
    expect(t).toContain('<i>it</i>')
    expect(t).toContain('<s>no</s>')
    expect(t).toContain('<code>a&lt;b&gt;</code>')
    expect(t).not.toContain('<script>')
    expect(inline('![shot](out/a.png)', { base: '/w/site' })).toContain('src="file:///w/site/out/a.png"')
    expect(imageSrc('https://x/y.png')).toBe('https://x/y.png')
    expect(inline('snake_case_name stays')).not.toContain('<i>')
  })
})

describe('chat bits', () => {
  const tools = [
    { name: 'Bash', detail: 'npm test', status: 'ok' as const },
    { name: 'Read', detail: '/w/a.ts', status: 'ok' as const },
    { name: 'Write', detail: '/w/site/index.html', status: 'ok' as const },
    { name: 'Edit', detail: '/w/site/app.js', status: 'ok' as const },
    { name: 'Edit', detail: '/w/site/app.js', status: 'ok' as const },
    { name: 'Edit', detail: '/w/site/bad.js', status: 'err' as const },
    { name: 'mcp__glyphh__whoami', detail: '', status: 'ok' as const }
  ]
  it('sums up tool calls in a line', () => {
    expect(toolSummary(tools)).toBe('Ran 1 command, read 1 file, wrote 1 file, edited 2 files, used 1 connector tool')
  })
  it('lists the files a turn made or changed', () => {
    expect(changedFiles(tools, '/w/site')).toEqual([
      { path: 'index.html', name: 'index.html', created: true },
      { path: 'app.js', name: 'app.js', created: false }
    ])
  })
  it('sizes and kinds', () => {
    expect(fileSize(512)).toBe('512 B')
    expect(fileSize(2048)).toBe('2.0 KB')
    expect(fileSize(3 * 1024 * 1024)).toBe('3.0 MB')
    expect(fileKind('a.html')).toBe('HTML')
    expect(fileKind('Makefile')).toBe('FILE')
  })
})
