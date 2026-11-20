// The Files panel, ported from the Glyphh desktop (code-workbench.ts
// renderFilesIntoSlot): a real search over the whole folder, new file and new
// folder, a lazy tree that keeps what is open across refreshes, and a
// right-click menu with New file, New folder, Rename and Delete (to the Trash).
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FileEntry } from '../../../shared/types'
import { Icon, ICON, Menu, type MenuItem } from '../Menu'
import { api, confirmAsk, get, openFile, set, toast, useStore, why } from '../store'

const parentOf = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
const join = (dir: string, name: string): string => (dir ? `${dir}/${name}` : name)

type Pending = { dir: string; kind: 'file' | 'dir'; after: string | null } | null

export function FilesPanel(): JSX.Element {
  const ws = useStore((s) => s.ws)
  const tick = useStore((s) => s.fsTick)
  const active = useStore((s) => s.activeFile)
  const [kids, setKids] = useState<Record<string, FileEntry[]>>({})
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<{ entries: FileEntry[]; truncated?: boolean } | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [renaming, setRenamingPath] = useState('')
  // A fresh object per rename, so its Enter and blur count once.
  const [renameKey, setRenameKey] = useState<object>({})
  const setRenaming = (p: string): void => {
    setRenamingPath(p)
    if (p) setRenameKey({})
  }
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const seq = useRef(0)

  /** Re-read the listed folders from disk, keeping every open subtree. */
  const reload = useCallback(async (dirs: string[]) => {
    const read = await Promise.all(dirs.map(async (d) => [d, await api.ws.list(d).catch(() => null)] as const))
    setKids((k) => {
      const next = { ...k }
      for (const [d, list] of read) {
        if (list) next[d] = list
        else delete next[d]
      }
      return next
    })
  }, [])

  useEffect(() => {
    setKids({})
    setOpen(new Set())
    void reload([''])
  }, [ws?.path])

  useEffect(() => {
    void reload(['', ...open].filter((d, i, a) => a.indexOf(d) === i))
    if (query.trim()) void runSearch(query)
  }, [tick])

  const runSearch = async (q: string): Promise<void> => {
    const n = ++seq.current
    if (!q.trim()) {
      setHits(null)
      return
    }
    const res = await api.ws.search(q).catch(() => null)
    if (n === seq.current && res) setHits(res)
  }

  const toggle = async (n: FileEntry): Promise<void> => {
    if (!n.dir) {
      void openFile(n.path).catch((e) => toast(why(e)))
      return
    }
    const next = new Set(open)
    if (next.has(n.path)) next.delete(n.path)
    else {
      next.add(n.path)
      if (!kids[n.path]) await reload([n.path])
    }
    setOpen(next)
  }

  const create = async (dir: string, kind: 'file' | 'dir', name: string): Promise<void> => {
    setPending(null)
    name = name.trim()
    if (!name || /[\\/]/.test(name)) return
    const path = join(dir, name)
    try {
      // A new file never truncates one that is there.
      if (await api.ws.exists(path)) {
        toast(`${name} already exists. Pick another name.`)
        return
      }
      if (kind === 'file') await api.ws.write(path, '')
      else await api.ws.mkdir(path)
      if (dir) setOpen((o) => new Set(o).add(dir))
      await reload([dir])
      if (kind === 'file') await openFile(path)
    } catch (e) {
      toast(`Could not create ${name}: ${why(e)}`)
    }
  }

  const rename = async (n: FileEntry, name: string): Promise<void> => {
    setRenaming('')
    name = name.trim()
    if (!name || name === n.name || /[\\/]/.test(name)) return
    const to = join(parentOf(n.path), name)
    try {
      await api.ws.rename(n.path, to)
      // Open editor tabs follow the file.
      set((s) => ({
        openFiles: s.openFiles.map((f) =>
          f.path === n.path || f.path.startsWith(n.path + '/') ? { ...f, path: to + f.path.slice(n.path.length) } : f
        ),
        activeFile:
          s.activeFile === n.path || s.activeFile.startsWith(n.path + '/') ? to + s.activeFile.slice(n.path.length) : s.activeFile
      }))
      await reload([parentOf(n.path)])
    } catch (e) {
      toast(`Could not rename ${n.name}: ${why(e)}`)
    }
  }

  const remove = async (n: FileEntry): Promise<void> => {
    const ok = await confirmAsk({
      title: `Delete ${n.name}?`,
      body: n.dir ? 'The folder and everything in it move to the Trash.' : 'The file moves to the Trash.',
      yes: 'Delete',
      danger: true
    })
    if (!ok) return
    try {
      await api.ws.trash(n.path)
      const gone = (p: string): boolean => p === n.path || p.startsWith(n.path + '/')
      const rest = get().openFiles.filter((f) => !gone(f.path))
      set({ openFiles: rest, activeFile: gone(get().activeFile) ? (rest.at(-1)?.path ?? '') : get().activeFile })
      await reload([parentOf(n.path)])
    } catch (e) {
      toast(`Could not delete ${n.name}: ${why(e)}`)
    }
  }

  const rowMenu = (e: React.MouseEvent, n: FileEntry): void => {
    e.preventDefault()
    e.stopPropagation()
    const items: MenuItem[] = []
    if (n.dir) {
      const start = async (kind: 'file' | 'dir'): Promise<void> => {
        if (!kids[n.path]) await reload([n.path])
        setOpen((o) => new Set(o).add(n.path))
        setPending({ dir: n.path, kind, after: n.path })
      }
      items.push({ label: 'New file', onPick: () => void start('file') })
      items.push({ label: 'New folder', onPick: () => void start('dir') })
    }
    items.push({ label: 'Rename', onPick: () => setRenaming(n.path) })
    items.push({ label: 'Delete', danger: true, onPick: () => void remove(n) })
    setMenu({ x: e.clientX, y: e.clientY, items })
  }

  // Enter and the blur that follows it are one commit, not two.
  const handled = useRef<unknown>(null)
  const once = (key: unknown, fn: () => void): void => {
    if (handled.current === key) return
    handled.current = key
    fn()
  }

  const newRow = (depth: number): JSX.Element => {
    const p = pending!
    return (
      <div className="frow" style={{ paddingLeft: 8 + depth * 12 }}>
        <input
          className="finput"
          autoFocus
          spellCheck={false}
          placeholder={p.kind === 'file' ? 'new-file.ts' : 'folder name'}
          onKeyDown={(e) => {
            const v = e.currentTarget.value
            if (e.key === 'Enter') once(p, () => void create(p.dir, p.kind, v))
            if (e.key === 'Escape') once(p, () => setPending(null))
          }}
          onBlur={(e) => {
            const v = e.currentTarget.value
            once(p, () => void create(p.dir, p.kind, v))
          }}
        />
      </div>
    )
  }

  const row = (n: FileEntry, depth: number, label = n.name): JSX.Element => (
    <div
      key={n.path}
      className={`frow ${active === n.path ? 'on' : ''}`}
      style={{ paddingLeft: 8 + depth * 12 }}
      title={n.path}
      onClick={() => void toggle(n)}
      onContextMenu={(e) => rowMenu(e, n)}
    >
      <span className={`caret ${n.dir ? (open.has(n.path) ? 'open' : '') : 'leaf'}`}>▸</span>
      <Icon d={n.dir ? ICON.folder : ICON.file} size={14} />
      {renaming === n.path ? (
        <input
          className="finput"
          autoFocus
          defaultValue={n.name}
          spellCheck={false}
          onClick={(e) => e.stopPropagation()}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            const v = e.currentTarget.value
            if (e.key === 'Enter') once(renameKey, () => void rename(n, v))
            if (e.key === 'Escape') once(renameKey, () => setRenaming(''))
          }}
          onBlur={(e) => {
            const v = e.currentTarget.value
            once(renameKey, () => void rename(n, v))
          }}
        />
      ) : (
        <span className={n.dir ? 'fname dir' : 'fname'}>{label}</span>
      )}
    </div>
  )

  const walk = (dir: string, depth: number): JSX.Element[] => {
    const out: JSX.Element[] = []
    if (pending && pending.dir === dir) out.push(<div key="__new">{newRow(depth)}</div>)
    for (const n of kids[dir] ?? []) {
      out.push(row(n, depth))
      if (n.dir && open.has(n.path)) out.push(...walk(n.path, depth + 1))
    }
    return out
  }

  return (
    <div className="pane files">
      <div className="ptool">
        <input
          className="psearch"
          value={query}
          placeholder="Search files"
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value)
            void runSearch(e.target.value)
          }}
        />
        <button className="ibtn" title="New file" disabled={!ws} onClick={() => setPending({ dir: '', kind: 'file', after: null })}>
          <Icon d={ICON.newFile} />
        </button>
        <button className="ibtn" title="New folder" disabled={!ws} onClick={() => setPending({ dir: '', kind: 'dir', after: null })}>
          <Icon d={ICON.newFolder} />
        </button>
        <button className="ibtn" title="Refresh" onClick={() => void reload(['', ...open])}>
          <Icon d={ICON.refresh} />
        </button>
      </div>
      <div className="ftree">
        {hits ? (
          hits.entries.length ? (
            <>
              {hits.entries.map((n) => row(n, 0, n.path))}
              {hits.truncated && <p className="dim pad">More matches exist. Narrow the search.</p>}
            </>
          ) : (
            <p className="dim pad">No files match "{query}".</p>
          )
        ) : (
          <>
            {walk('', 0)}
            {!kids['']?.length && !pending && <p className="dim pad">Nothing here yet. The crew will fill it.</p>}
          </>
        )}
      </div>
      {menu && <Menu {...menu} onClose={() => setMenu(null)} />}
    </div>
  )
}
