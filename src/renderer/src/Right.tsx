import { createElement, useEffect, useRef, useState } from 'react'
import type { PR, TreeNode } from '../../shared/types'
import { decidePr } from './engine'
import { Horse } from './Horse'
import { api, get, openFile, refreshFiles, set, toast, useStore, type RightTab } from './store'

// ------------------------------------------------------------------ swarm

function Diff({ pr }: { pr: PR }): JSX.Element {
  const [text, setText] = useState('…')
  useEffect(() => {
    api.git
      .diff(pr.id)
      .then(setText)
      .catch(() => setText('The diff is gone (the commits were removed).'))
  }, [pr.id])
  return (
    <pre className="diff">
      {text.split('\n').map((l, i) => (
        <div
          key={i}
          className={
            l.startsWith('+++') || l.startsWith('---') || l.startsWith('diff ')
              ? 'h'
              : l.startsWith('@@')
                ? 'at'
                : l.startsWith('+')
                  ? 'a'
                  : l.startsWith('-')
                    ? 'd'
                    : ''
          }
        >
          {l || ' '}
        </div>
      ))}
    </pre>
  )
}

function SwarmTab(): JSX.Element {
  const swarm = useStore((s) => s.swarm)
  const prs = useStore((s) => s.prs)
  const bots = useStore((s) => s.bots)
  const status = useStore((s) => s.status)
  const [open, setOpen] = useState<number | null>(null)
  const order = swarm ? swarm.order.map((id) => bots.find((b) => b.id === id)).filter(Boolean) : []

  return (
    <div className="pane scroll">
      {swarm ? (
        <div className="card task">
          <div className="rail-label">
            {swarm.git ? 'Swarm task' : 'Round-table'}
            <span className={swarm.running ? 'badge open' : 'badge merged'}>
              {swarm.running ? `round ${swarm.round}/${swarm.rounds}` : 'finished'}
            </span>
          </div>
          <p>{swarm.task}</p>
          <div className="turns">
            {order.map((b, i) => {
              const st = status[b!.id] ?? 'idle'
              return (
                <div key={b!.id} className={`turnrow ${st}`} style={{ ['--accent' as string]: b!.look.accent }}>
                  <Horse look={b!.look} size={30} />
                  <b>{b!.name}</b>
                  <small>
                    {st === 'thinking'
                      ? 'working on a branch'
                      : st === 'speaking'
                        ? 'talking'
                        : st === 'waiting'
                          ? i === swarm.current
                            ? 'waiting on review'
                            : 'waiting for a turn'
                          : ''}
                  </small>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="empty">
          <b>No swarm yet</b>
          <p>Give the crew a task in the main chat with Swarm on. Each bot takes a turn on its own git branch and opens a pull request you can read here.</p>
        </div>
      )}

      {prs.length > 0 && <div className="rail-label">Pull requests</div>}
      {[...prs].reverse().map((pr) => {
        const bot = bots.find((b) => b.id === pr.botId)
        return (
          <div key={pr.id} className={`pr ${pr.status}`}>
            <div className="pr-head" onClick={() => setOpen(open === pr.id ? null : pr.id)}>
              {bot && <Horse look={bot.look} size={28} />}
              <div className="pr-main">
                <b>
                  #{pr.id} {pr.title}
                </b>
                <small>
                  {pr.branch} → {pr.base}
                </small>
              </div>
              <span className={`badge ${pr.status}`}>{pr.status}</span>
            </div>
            <div className="pr-files">
              {pr.files.map((f) => (
                <button key={f.path} onClick={() => void openFile(f.path).catch(() => toast('That file is not in the folder right now.'))}>
                  {f.path}
                  <i className="add">+{f.added}</i>
                  <i className="del">-{f.removed}</i>
                </button>
              ))}
            </div>
            {pr.status === 'open' && (
              <div className="row pad">
                <button className="btn" onClick={() => void decidePr(pr, true)}>
                  Merge
                </button>
                <button className="btn ghost danger" onClick={() => void decidePr(pr, false)}>
                  Reject
                </button>
              </div>
            )}
            {pr.url && (
              <button className="link pad" onClick={() => void api.openExternal(pr.url!)}>
                {pr.url}
              </button>
            )}
            {open === pr.id && (
              <>
                <p className="pr-body">{pr.body}</p>
                <Diff pr={pr} />
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------------------ files

function Node({ n, depth }: { n: TreeNode; depth: number }): JSX.Element {
  const [open, setOpen] = useState(depth < 1)
  const active = useStore((s) => s.activeFile === n.path)
  return (
    <>
      <button
        className={`node ${active ? 'on' : ''}`}
        style={{ paddingLeft: 12 + depth * 14 }}
        onClick={() => (n.dir ? setOpen(!open) : void openFile(n.path))}
      >
        <span className="tw">{n.dir ? (open ? '▾' : '▸') : ''}</span>
        <span className={n.dir ? 'dir' : 'file'}>{n.name}</span>
      </button>
      {n.dir && open && n.children?.map((c) => <Node key={c.path} n={c} depth={depth + 1} />)}
    </>
  )
}

function FilesTab(): JSX.Element {
  const tree = useStore((s) => s.tree)
  const ws = useStore((s) => s.ws)
  return (
    <div className="pane scroll">
      <div className="rail-label">
        {ws?.name}
        <button className="link" onClick={() => void refreshFiles()}>
          refresh
        </button>
      </div>
      {tree.length === 0 && <p className="dim pad">Nothing here yet. The crew will fill it.</p>}
      {tree.map((n) => (
        <Node key={n.path} n={n} depth={0} />
      ))}
    </div>
  )
}

// ----------------------------------------------------------------- editor

type Monaco = typeof import('./monaco')['monaco']

function EditorTab(): JSX.Element {
  const files = useStore((s) => s.openFiles)
  const active = useStore((s) => s.activeFile)
  const host = useRef<HTMLDivElement>(null)
  const ed = useRef<ReturnType<Monaco['editor']['create']> | null>(null)
  const [m, setM] = useState<Monaco | null>(null)
  const file = files.find((f) => f.path === active)

  const save = async (): Promise<void> => {
    const f = get().openFiles.find((x) => x.path === get().activeFile)
    if (!f) return
    await api.ws.write(f.path, f.content)
    set((s) => ({ openFiles: s.openFiles.map((x) => (x.path === f.path ? { ...x, saved: f.content } : x)) }))
  }

  useEffect(() => {
    let dead = false
    void import('./monaco').then(({ monaco }) => {
      if (dead || !host.current) return
      const e = monaco.editor.create(host.current, {
        theme: 'oliver',
        automaticLayout: true,
        fontSize: 13,
        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
        fontLigatures: true,
        minimap: { enabled: false },
        padding: { top: 12 },
        smoothScrolling: true,
        cursorBlinking: 'phase',
        scrollBeyondLastLine: false,
        model: null
      })
      e.onDidChangeModelContent(() => {
        const path = get().activeFile
        const value = e.getValue()
        set((s) => ({ openFiles: s.openFiles.map((x) => (x.path === path && x.content !== value ? { ...x, content: value } : x)) }))
      })
      e.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void save())
      ed.current = e
      setM(monaco)
    })
    return () => {
      dead = true
      ed.current?.dispose()
      ed.current = null
    }
  }, [])

  useEffect(() => {
    if (!m || !ed.current) return
    if (!file) {
      ed.current.setModel(null)
      return
    }
    const uri = m.Uri.file('/' + file.path)
    const model = m.editor.getModel(uri) ?? m.editor.createModel(file.content, undefined, uri)
    if (model.getValue() !== file.content) model.setValue(file.content)
    if (ed.current.getModel() !== model) ed.current.setModel(model)
  }, [m, file?.path, file?.content])

  const close = (path: string): void => {
    const rest = files.filter((f) => f.path !== path)
    m?.editor.getModel(m.Uri.file('/' + path))?.dispose()
    set({ openFiles: rest, activeFile: active === path ? (rest.at(-1)?.path ?? '') : active })
  }

  return (
    <div className="pane editor">
      <div className="filetabs">
        {files.map((f) => (
          <div key={f.path} className={f.path === active ? 'ft on' : 'ft'} onClick={() => set({ activeFile: f.path })} title={f.path}>
            {f.content !== f.saved && <i className="unsaved" />}
            {f.path.split('/').pop()}
            <button
              onClick={(e) => {
                e.stopPropagation()
                close(f.path)
              }}
            >
              ×
            </button>
          </div>
        ))}
        {file && file.content !== file.saved && (
          <button className="btn tiny" onClick={() => void save()}>
            Save ⌘S
          </button>
        )}
      </div>
      <div className="monaco" ref={host} style={{ visibility: file ? 'visible' : 'hidden' }} />
      {!file && (
        <div className="empty over">
          <b>No file open</b>
          <p>Pick one in Files, or click a file in a pull request.</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- browser

interface WebviewEl extends HTMLElement {
  src: string
  goBack(): void
  goForward(): void
  reload(): void
  getURL(): string
}

function BrowserTab(): JSX.Element {
  const url = useStore((s) => s.browserUrl)
  const ws = useStore((s) => s.ws)
  const [bar, setBar] = useState(url)
  const view = useRef<WebviewEl>(null)

  useEffect(() => {
    const v = view.current
    if (!v) return
    const nav = (): void => setBar(v.getURL())
    v.addEventListener('did-navigate', nav)
    v.addEventListener('did-navigate-in-page', nav)
    return () => {
      v.removeEventListener('did-navigate', nav)
      v.removeEventListener('did-navigate-in-page', nav)
    }
  }, [url])

  const go = (raw: string): void => {
    let next = raw.trim()
    if (!next) return
    if (!/^[a-z]+:\/\//i.test(next)) {
      next = /^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?(\/|$)/.test(next)
        ? (next.startsWith('localhost') ? 'http://' : 'https://') + next
        : `https://duckduckgo.com/?q=${encodeURIComponent(next)}`
    }
    setBar(next)
    set({ browserUrl: next })
  }

  return (
    <div className="pane browser">
      <div className="urlbar">
        <button className="icon" onClick={() => view.current?.goBack()} title="Back">
          ‹
        </button>
        <button className="icon" onClick={() => view.current?.goForward()} title="Forward">
          ›
        </button>
        <button className="icon" onClick={() => view.current?.reload()} title="Reload">
          ↻
        </button>
        <input
          value={bar}
          placeholder="Search or type a web address"
          onChange={(e) => setBar(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && go(bar)}
        />
        <button className="btn tiny" title="Open the project's index.html" onClick={() => ws && go(`file://${ws.path}/index.html`)}>
          Preview
        </button>
      </div>
      {url ? (
        createElement('webview', { ref: view, src: url, className: 'web', allowpopups: 'false' })
      ) : (
        <div className="empty">
          <b>Browser</b>
          <p>Look something up, or hit Preview to see what the crew built.</p>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ panel

const TABS: { id: RightTab; label: string }[] = [
  { id: 'swarm', label: 'Swarm' },
  { id: 'files', label: 'Files' },
  { id: 'editor', label: 'Editor' },
  { id: 'browser', label: 'Browser' }
]

export function Right(): JSX.Element {
  const tab = useStore((s) => s.rightTab)
  const open = useStore((s) => s.prs.filter((p) => p.status === 'open').length)
  return (
    <aside className="rail right">
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => set({ rightTab: t.id })}>
            {t.label}
            {t.id === 'swarm' && open > 0 && <i className="count">{open}</i>}
          </button>
        ))}
      </div>
      {tab === 'swarm' && <SwarmTab />}
      {tab === 'files' && <FilesTab />}
      {/* The editor and the browser stay mounted so they keep their state. */}
      <div style={{ display: tab === 'editor' ? 'contents' : 'none' }}>
        <EditorTab />
      </div>
      <div style={{ display: tab === 'browser' ? 'contents' : 'none' }}>
        <BrowserTab />
      </div>
    </aside>
  )
}
