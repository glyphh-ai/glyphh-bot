// Recents: past chats (crew runs and single-bot chats), kept so one can be
// reopened with its history. The Recents menu shows a Pinned section first,
// then one section per folder (the workspace the chat ran in), newest first;
// archived chats leave the list and sit in an Archived view to restore.
// Pure data, tested in test/recents.test.ts; the main process stores them.

export interface Recent {
  id: string
  /** 'crew' or a bot's id. */
  room: string
  title: string
  /** The workspace folder the chat ran in. */
  folder: string
  updatedAt: number
  pinned?: boolean
  archived?: boolean
  /** The Claude session a single-bot chat resumes. */
  sessionId?: string
  /** The chat's messages, as the renderer keeps them. */
  msgs: unknown[]
}

export interface RecentSection {
  /** 'pinned', 'archived', or the folder path. */
  key: string
  title: string
  items: Recent[]
}

/** A folder's name as a section title: its last path part. */
export const folderName = (folder: string): string => folder.split(/[\\/]/).filter(Boolean).pop() || 'No folder'

const newest = (a: Recent, b: Recent): number => b.updatedAt - a.updatedAt

/** The menu's sections: Pinned, then each folder (the folder used most recently first). Archived ones are left out. */
export function groupRecents(list: ReadonlyArray<Recent>): RecentSection[] {
  const live = list.filter((r) => !r.archived)
  const out: RecentSection[] = []
  const pinned = live.filter((r) => r.pinned).sort(newest)
  if (pinned.length) out.push({ key: 'pinned', title: 'Pinned', items: pinned })
  const byFolder = new Map<string, Recent[]>()
  for (const r of live.filter((r) => !r.pinned).sort(newest)) {
    const k = r.folder || ''
    if (!byFolder.has(k)) byFolder.set(k, [])
    byFolder.get(k)!.push(r)
  }
  for (const [k, items] of byFolder) out.push({ key: k, title: folderName(k), items })
  return out
}

/** The Archived view, newest first. */
export const archivedRecents = (list: ReadonlyArray<Recent>): Recent[] => list.filter((r) => r.archived).sort(newest)

/** Add or replace one (by id). */
export function upsertRecent(list: ReadonlyArray<Recent>, r: Recent): Recent[] {
  const i = list.findIndex((x) => x.id === r.id)
  if (i < 0) return [...list, r]
  // Keep the person's pin and archive: a chat saving itself never changes them.
  const prev = list[i]!
  const next = list.slice()
  next[i] = { ...r, pinned: prev.pinned, archived: prev.archived }
  return next
}

export const setPinnedRecent = (list: ReadonlyArray<Recent>, id: string, on: boolean): Recent[] =>
  list.map((r) => (r.id === id ? { ...r, pinned: on || undefined, ...(on ? { archived: undefined } : {}) } : r))

/** Archive (it leaves the list and loses its pin) or restore. */
export const setArchivedRecent = (list: ReadonlyArray<Recent>, id: string, on: boolean): Recent[] =>
  list.map((r) => (r.id === id ? { ...r, archived: on || undefined, ...(on ? { pinned: undefined } : {}) } : r))

export const removeRecent = (list: ReadonlyArray<Recent>, id: string): Recent[] => list.filter((r) => r.id !== id)

/** A chat's title: its first message from the person, cut short. */
export function titleFrom(text: string, max = 60): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return 'New chat'
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t
}

/** Saved data read back from disk: anything malformed is dropped; at most `cap` kept (pinned ones always). */
export function normalizeRecents(raw: unknown, cap = 200): Recent[] {
  if (!Array.isArray(raw)) return []
  const ok = raw.filter(
    (r): r is Recent =>
      !!r &&
      typeof r === 'object' &&
      typeof (r as Recent).id === 'string' &&
      typeof (r as Recent).room === 'string' &&
      Array.isArray((r as Recent).msgs)
  )
  const clean = ok.map((r) => ({
    ...r,
    title: typeof r.title === 'string' && r.title ? r.title : 'New chat',
    folder: typeof r.folder === 'string' ? r.folder : '',
    updatedAt: Number(r.updatedAt) || 0
  }))
  const pinned = clean.filter((r) => r.pinned)
  const rest = clean.filter((r) => !r.pinned).sort(newest).slice(0, Math.max(0, cap - pinned.length))
  return [...pinned, ...rest]
}
