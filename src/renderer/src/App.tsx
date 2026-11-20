import { useEffect, useState } from 'react'
import { Center } from './Center'
import { startEvents } from './engine'
import { StatusBar } from './Hud'
import { Left } from './Left'
import { BotEditor, LoginGate, SettingsModal, startAuthEvents } from './Modals'
import { Right } from './Right'
import { api, boot, refreshFiles, set, toast, useStore } from './store'

function WorkspaceMenu(): JSX.Element {
  const ws = useStore((s) => s.ws)
  const branch = useStore((s) => s.branch)
  const [open, setOpen] = useState(false)
  const swap = async (fn: () => Promise<unknown>): Promise<void> => {
    setOpen(false)
    try {
      const next = await fn()
      if (next) {
        set({ ws: await api.ws.current(), openFiles: [], activeFile: '' })
        await refreshFiles()
      }
    } catch (e) {
      toast((e as Error).message)
    }
  }
  return (
    <div className="wsmenu nodrag">
      <button className="chip" onClick={() => setOpen(!open)}>
        <span className="dot" /> {ws?.name ?? '…'}
        {branch && <span className="branch">⎇ {branch}</span>}
      </button>
      {open && (
        <div className="menu" onMouseLeave={() => setOpen(false)}>
          <input
            placeholder="New project name, then Enter"
            onKeyDown={(e) => {
              const name = e.currentTarget.value.trim()
              if (e.key === 'Enter' && name) void swap(() => api.ws.create(name))
            }}
          />
          <button onClick={() => void swap(() => api.ws.open())}>Open a folder…</button>
          <button
            onClick={() => {
              setOpen(false)
              void api.ws.reveal()
            }}
          >
            Show in Finder
          </button>
        </div>
      )}
    </div>
  )
}

export function App(): JSX.Element {
  const ready = useStore((s) => s.ready)
  const auth = useStore((s) => s.auth)
  const modal = useStore((s) => s.modal)
  const toastText = useStore((s) => s.toast)
  const rightOpen = useStore((s) => s.rightOpen)

  useEffect(() => {
    void boot()
    const offAgent = startEvents()
    const offAuth = startAuthEvents()
    return () => {
      offAgent()
      offAuth()
    }
  }, [])

  return (
    <div className="app">
      <div className="aurora">
        <i />
        <i />
        <i />
      </div>
      <header className="top">
        <div className="brand">
          OLIVER<span>bot os 0.1</span>
        </div>
        <WorkspaceMenu />
        <div className="spacer" />
        {auth.loggedIn && (
          <button className="chip nodrag" onClick={() => set({ leftTab: 'connections' })}>
            <span className="dot ok" /> {auth.email}
            {auth.subscriptionType && <span className="plan">{auth.subscriptionType}</span>}
          </button>
        )}
        <button className="icon nodrag" title="Settings" onClick={() => set({ modal: { kind: 'settings' } })}>
          ⚙
        </button>
        <button className="icon nodrag" title="Work panel" onClick={() => set({ rightOpen: !rightOpen })}>
          {rightOpen ? '⇥' : '⇤'}
        </button>
      </header>
      <main className={rightOpen ? 'grid' : 'grid noright'}>
        <Left />
        <Center />
        {rightOpen && <Right />}
      </main>
      <StatusBar />
      <div className="scan" />
      {ready && !auth.loggedIn && <LoginGate />}
      {modal?.kind === 'settings' && <SettingsModal />}
      {modal?.kind === 'bot' && <BotEditor bot={modal.bot} />}
      {toastText && (
        <div className="toast" onClick={() => set({ toast: '' })}>
          {toastText}
        </div>
      )}
    </div>
  )
}
