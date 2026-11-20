// The chat's small pure helpers (tested in test/chat.test.ts): a summary line
// for a bot's tool calls, the files it created or changed, and file sizes.

export interface ToolLike {
  name: string
  detail: string
  status: 'run' | 'ok' | 'err'
}

const WRITES = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

const plural = (n: number, one: string, many = one + 's'): string => `${n} ${n === 1 ? one : many}`

/** "Ran 2 commands, read 3 files, edited 1 file": what a turn's tool calls did, in a line. */
export function toolSummary(tools: ReadonlyArray<ToolLike>): string {
  const count = (names: string[]): number => tools.filter((t) => names.includes(t.name)).length
  const parts: string[] = []
  const ran = count(['Bash'])
  const read = count(['Read'])
  const searched = count(['Grep', 'Glob'])
  const wrote = new Set(tools.filter((t) => t.name === 'Write').map((t) => t.detail)).size
  const edited = new Set(tools.filter((t) => WRITES.has(t.name) && t.name !== 'Write').map((t) => t.detail)).size
  const web = count(['WebSearch', 'WebFetch'])
  const agents = count(['Agent', 'Task'])
  const mcp = tools.filter((t) => t.name.startsWith('mcp__')).length
  if (ran) parts.push(`ran ${plural(ran, 'command')}`)
  if (read) parts.push(`read ${plural(read, 'file')}`)
  if (searched) parts.push(`searched ${plural(searched, 'time')}`)
  if (wrote) parts.push(`wrote ${plural(wrote, 'file')}`)
  if (edited) parts.push(`edited ${plural(edited, 'file')}`)
  if (web) parts.push(`browsed ${plural(web, 'time')}`)
  if (agents) parts.push(`sent ${plural(agents, 'helper')}`)
  if (mcp) parts.push(`used ${plural(mcp, 'connector tool')}`)
  const other = tools.length - ran - read - searched - tools.filter((t) => WRITES.has(t.name)).length - web - agents - mcp
  if (other > 0) parts.push(plural(other, 'other step'))
  const s = parts.join(', ') || plural(tools.length, 'step')
  return s[0]!.toUpperCase() + s.slice(1)
}

/** A path relative to the workspace when it is inside it. */
export function relPath(p: string, root: string): string {
  if (root && p.startsWith(root.replace(/\/+$/, '') + '/')) return p.slice(root.replace(/\/+$/, '').length + 1)
  return p
}

export interface ChangedFile {
  path: string
  name: string
  /** Made new in this turn (its first touch was a Write), or changed. */
  created: boolean
}

/** The files a turn created or changed, in the order first touched (failed calls left out). */
export function changedFiles(tools: ReadonlyArray<ToolLike>, root: string): ChangedFile[] {
  const out: ChangedFile[] = []
  for (const t of tools) {
    if (!WRITES.has(t.name) || t.status === 'err' || !t.detail || t.detail.startsWith('{')) continue
    const path = relPath(t.detail, root)
    if (out.some((f) => f.path === path)) continue
    out.push({ path, name: path.split('/').pop() || path, created: t.name === 'Write' })
  }
  return out
}

export function fileSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/** A short type label for a file card. */
export function fileKind(name: string): string {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  return ext ? ext.slice(0, 4).toUpperCase() : 'FILE'
}

export const isImageName = (name: string): boolean => /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name)
