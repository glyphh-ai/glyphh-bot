// The Editor panel: Monaco with tabs, ported from the Glyphh desktop
// (code-workbench.ts renderMonacoIntoSlot): a dot on unsaved tabs, Save and
// ⌘S, a right-click menu on a tab (Save, Close, Close all, Save all) and on
// the strip (Save all, Close all), a question before unsaved work is closed,
// and markdown shown rendered or as source. Bots' changes reload into tabs
// that have no unsaved edits (store.refreshFiles).
import { useEffect, useRef, useState } from 'react'
import { Icon, ICON, Menu, type MenuItem } from '../Menu'
import { mdDoc } from '../md'
import { api, confirmAsk, get, set, toast, useStore, why } from '../store'

type Monaco = (typeof import('../monaco'))['monaco']
type Editor = ReturnType<Monaco['editor']['create']>

const isMarkdown = (p: string): boolean => /\.(md|mdx|markdown)$/i.test(p)

async function saveFile(path: string): Promise<boolean> {
  const f = get().openFiles.find((x) => x.path === path)
  if (!f || f.content === f.saved) return true
  try {
    await api.ws.write(f.path, f.content)
    set((s) => ({ openFiles: s.openFiles.map((x) => (x.path === f.path ? { ...x, saved: f.content } : x)) }))
    return true
  } catch (e) {
    toast(`Could not save ${f.path}: ${why(e)}`)
    return false
  }
}

async function saveAll(): Promise<void> {
  for (const f of get().openFiles) await saveFile(f.path)
}

async function closeFiles(paths: string[]): Promise<void> {
  const dirty = get().openFiles.filter((f) => paths.includes(f.path) && f.content !== f.saved)
  if (dirty.length) {
    const ok = await confirmAsk({
      title: paths.length === 1 ? `Close ${paths[0]!.split('/').pop()}?` : 'Close all tabs?',
      body: dirty.length === 1 ? 'It has unsaved changes.' : `${dirty.length} files have unsaved changes.`,
      yes: 'Close without saving',
      danger: true
    })
    if (!ok) return
  }
  const rest = get().openFiles.filter((f) => !paths.includes(f.path))
  const active = get().activeFile
  set({ openFiles: rest, activeFile: paths.includes(active) ? (rest.at(-1)?.path ?? '') : active })
}

export function EditorPanel(): JSX.Element {
  const files = useStore((s) => s.openFiles)
  const active = useStore((s) => s.activeFile)
  const host = useRef<HTMLDivElement>(null)
  const ed = useRef<Editor | null>(null)
  const [m, setM] = useState<Monaco | null>(null)
  const [rendered, setRendered] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const file = files.find((f) => f.path === active)
  const preview = !!file && isMarkdown(file.path) && rendered[file.path] !== false

  const save = async (): Promise<void> => {
    const path = get().activeFile
    const f = get().openFiles.find((x) => x.path === path)
    if (!f || f.content === f.saved) return
    if (await saveFile(path)) {
      setSaved(true)
      setTimeout(() => setSaved(false), 900)
    }
  }

  useEffect(() => {
    let dead = false
    void import('../monaco').then(({ monaco }) => {
      if (dead || !host.current) return
      const e = monaco.editor.create(host.current, {
        theme: 'glyphh',
        automaticLayout: true,
        fontSize: 13,
        fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
        minimap: { enabled: false },
        padding: { top: 12 },
        smoothScrolling: true,
        cursorBlinking: 'phase',
        scrollBeyondLastLine: false,
        model: null
      })
      e.onDidChangeModelContent(() => {
        const uri = e.getModel()?.uri.path.slice(1)
        const value = e.getValue()
        set((s) => ({ openFiles: s.openFiles.map((x) => (x.path === uri && x.content !== value ? { ...x, content: value } : x)) }))
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

  // A closed file's model goes, so a reopen reads the disk afresh.
  useEffect(() => {
    if (!m) return
    for (const model of m.editor.getModels()) {
      if (model.uri.scheme === 'file' && !files.some((f) => '/' + f.path === model.uri.path)) model.dispose()
    }
  }, [m, files.length])

  const tabMenu = (e: React.MouseEvent, path: string): void => {
    e.preventDefault()
    e.stopPropagation()
    const f = files.find((x) => x.path === path)
    const items: MenuItem[] = []
    if (f && f.content !== f.saved) items.push({ label: 'Save', onPick: () => void saveFile(path) })
    items.push({ label: 'Close', onPick: () => void closeFiles([path]) })
    items.push({ label: 'Close all', onPick: () => void closeFiles(get().openFiles.map((x) => x.path)) })
    items.push({ label: 'Save all', onPick: () => void saveAll() })
    setMenu({ x: e.clientX, y: e.clientY, items })
  }

  const stripMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Save all', onPick: () => void saveAll() },
        { label: 'Close all', onPick: () => void closeFiles(get().openFiles.map((x) => x.path)) }
      ]
    })
  }

  const dirty = !!file && file.content !== file.saved

  return (
    <div className="pane editor">
      <div className="filetabs" onContextMenu={stripMenu}>
        {!files.length && <span className="dim tabs-empty">No file open</span>}
        {files.map((f) => (
          <div
            key={f.path}
            className={f.path === active ? 'ft on' : 'ft'}
            onClick={() => set({ activeFile: f.path })}
            onContextMenu={(e) => tabMenu(e, f.path)}
            title={f.path}
          >
            {f.content !== f.saved && <i className="unsaved" />}
            {f.path.split('/').pop()}
            <button
              title="Close"
              onClick={(e) => {
                e.stopPropagation()
                void closeFiles([f.path])
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {file && (
        <div className="pathbar">
          <span className="ptext">{file.path}</span>
          <span className="spacer" />
          {isMarkdown(file.path) && (
            <>
              <button className={`ibtn ${preview ? 'on' : ''}`} title="Rendered" onClick={() => setRendered((r) => ({ ...r, [file.path]: true }))}>
                <Icon d={ICON.eye} />
              </button>
              <button className={`ibtn ${!preview ? 'on' : ''}`} title="Source" onClick={() => setRendered((r) => ({ ...r, [file.path]: false }))}>
                <Icon d={ICON.code} />
              </button>
            </>
          )}
          {(dirty || saved) && (
            <button className="btn tiny" onClick={() => void save()}>
              {saved ? 'Saved' : 'Save ⌘S'}
            </button>
          )}
        </div>
      )}
      <div className="monaco" ref={host} style={{ visibility: file && !preview ? 'visible' : 'hidden' }} />
      {file && preview && <div className="mddoc" dangerouslySetInnerHTML={{ __html: mdDoc(file.content) }} />}
      {!file && (
        <div className="empty over">
          <b>No file open</b>
          <p>Pick one in Files, or click a file in a pull request.</p>
        </div>
      )}
      {menu && <Menu {...menu} onClose={() => setMenu(null)} />}
    </div>
  )
}
