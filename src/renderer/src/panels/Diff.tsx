// The Diff panel, ported from the Glyphh desktop (code-workbench.ts
// renderDiffIntoSlot): the working tree against HEAD, untracked files
// included, one fold per file with its +/- counts, expand all, collapse all
// and refresh. It refreshes quietly when files change, keeping what is open
// and where you were scrolled.
import { useEffect, useRef, useState } from 'react'
import { parseUnifiedDiff, type DiffFile } from '../../../shared/diff'
import { Icon, ICON } from '../Menu'
import { api, openFile, toast, useStore, why } from '../store'

export function DiffPanel(): JSX.Element {
  const tick = useStore((s) => s.fsTick)
  const ws = useStore((s) => s.ws?.path)
  const [res, setRes] = useState<{ files: DiffFile[]; error?: string } | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const scroller = useRef<HTMLDivElement>(null)
  const seq = useRef(0)
  const first = useRef(true)

  const refresh = async (): Promise<void> => {
    const n = ++seq.current
    const out = await api.ws.diff().catch((e) => ({ text: '', error: why(e) }))
    if (n !== seq.current) return
    const keep = scroller.current?.scrollTop ?? 0
    const files = out.error ? [] : parseUnifiedDiff(out.text)
    // The first look opens a small change set; after that, what you opened stays as you left it.
    if (first.current && files.length) {
      first.current = false
      if (files.length <= 5) setExpanded(new Set(files.map((f) => f.path)))
    }
    setRes({ files, error: out.error })
    requestAnimationFrame(() => {
      if (scroller.current) scroller.current.scrollTop = keep
    })
  }

  useEffect(() => {
    void refresh()
  }, [tick, ws])

  const files = res?.files ?? []
  const add = files.reduce((s, f) => s + f.additions, 0)
  const del = files.reduce((s, f) => s + f.deletions, 0)
  const fresh = !!res?.error && /not a git repo/i.test(res.error)

  return (
    <div className="pane diffpane">
      <div className="ptool">
        <span className="dsum">
          {!res ? (
            'loading…'
          ) : res.error ? (
            fresh ? 'not a git repo' : 'error'
          ) : files.length ? (
            <>
              {files.length} file{files.length === 1 ? '' : 's'}
              <i className="add">+{add}</i>
              <i className="del">−{del}</i>
            </>
          ) : (
            'no changes'
          )}
        </span>
        <span className="spacer" />
        <button className="ibtn" title="Expand all" onClick={() => setExpanded(new Set(files.map((f) => f.path)))}>
          <Icon d={ICON.expand} />
        </button>
        <button className="ibtn" title="Collapse all" onClick={() => setExpanded(new Set())}>
          <Icon d={ICON.collapse} />
        </button>
        <button className="ibtn" title="Refresh" onClick={() => void refresh()}>
          <Icon d={ICON.refresh} />
        </button>
      </div>
      <div className="dfiles" ref={scroller}>
        {res?.error && (
          <p className="dim pad">
            {fresh ? 'No version history yet: this folder is not a git repo. Changes show here once it is.' : res.error}
          </p>
        )}
        {res && !res.error && !files.length && <p className="dim pad">Working tree is clean.</p>}
        {files.map((f) => {
          const isOpen = expanded.has(f.path)
          return (
            <div key={f.path} className={`dfile ${isOpen ? '' : 'collapsed'}`}>
              <div
                className="dhead"
                title="Click to fold, double-click to open in the editor"
                onClick={() =>
                  setExpanded((s) => {
                    const n = new Set(s)
                    if (n.has(f.path)) n.delete(f.path)
                    else n.add(f.path)
                    return n
                  })
                }
                onDoubleClick={() => void openFile(f.path).catch((e) => toast(why(e)))}
              >
                <span className="caret">{isOpen ? '▾' : '▸'}</span>
                <span className="dname">{f.path}</span>
                <span className="dstat">
                  <i className="add">+{f.additions}</i>
                  <i className="del">−{f.deletions}</i>
                </span>
              </div>
              {isOpen && (
                <div className="dbody">
                  {f.lines.map((l, i) => (
                    <div key={i} className={`dl ${l.kind}`}>
                      {l.text || ' '}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
