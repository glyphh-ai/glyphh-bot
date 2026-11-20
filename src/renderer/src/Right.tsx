// The work panel on the right: Swarm, Files, Editor, Diff and
// Browser as tabs. The same panels open as cells of a layout.
import { BrowserPanel } from './panels/Browser'
import { DiffPanel } from './panels/Diff'
import { EditorPanel } from './panels/Editor'
import { FilesPanel } from './panels/Files'
import { SwarmPanel } from './panels/Swarm'
import { set, useStore, type RightTab } from './store'

const TABS: { id: RightTab; label: string }[] = [
  { id: 'swarm', label: 'Swarm' },
  { id: 'files', label: 'Files' },
  { id: 'editor', label: 'Editor' },
  { id: 'diff', label: 'Diff' },
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
      {tab === 'swarm' && <SwarmPanel />}
      {tab === 'files' && <FilesPanel />}
      {tab === 'diff' && <DiffPanel />}
      {/* The editor and the browser stay mounted so they keep their state. */}
      <div className="keep" style={{ display: tab === 'editor' ? 'contents' : 'none' }}>
        <EditorPanel />
      </div>
      <div className="keep" style={{ display: tab === 'browser' ? 'contents' : 'none' }}>
        <BrowserPanel />
      </div>
    </aside>
  )
}
