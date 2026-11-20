import { useEffect, useState } from 'react'
import logo from './assets/glyphh-logo-text-white.png'
import { CommandCenter, startCommandKey } from './CommandCenter'
import { Desk } from './Desk'
import { startEvents } from './engine'
import { StatusBar } from './Hud'
import { LayoutManager } from './LayoutManager'
import { Left } from './Left'
import { Icon, ICON } from './Menu'
import { BotEditor, ConfirmModal, LoginGate, SettingsModal, startAuthEvents } from './Modals'
import { Right } from './Right'
import * as store from './store'
import { api, boot, openCommand, refreshFiles, set, toast, useStore, why } from './store'

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
      toast(why(e))
    }
  }
  return (
    <div className="wsmenu nodrag">
      <button className="chip" onClick={() => setOpen(!open)}>
        <Icon d={ICON.folder} size={14} /> {ws?.name ?? '…'}
        {branch && <span className="branch">{branch}</span>}
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

declare global {
  interface Window {
    /** Screenshot runs only (GLYPHH_BOT_SHOT): lets GLYPHH_BOT_SHOT_JS set up a scene. */
    __shot?: typeof store
  }
}

export function App(): JSX.Element {
  const ready = useStore((s) => s.ready)
  const auth = useStore((s) => s.auth)
  const modal = useStore((s) => s.modal)
  const toastText = useStore((s) => s.toast)
  const rightOpen = useStore((s) => s.rightOpen)
  const commandOpen = useStore((s) => s.commandOpen)

  useEffect(() => {
    if (api.shot) window.__shot = store
    void boot()
    const offAgent = startEvents()
    const offAuth = startAuthEvents()
    const offKey = startCommandKey()
    return () => {
      offAgent()
      offAuth()
      offKey()
    }
  }, [])

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <img src={logo} alt="Glyphh" />
          <span>Bot</span>
        </div>
        <WorkspaceMenu />
        <div className="spacer" />
        <button className="chip nodrag search" title="Open a panel or a bot (⌘K)" onClick={() => openCommand(null)}>
          <Icon d={ICON.open} size={14} /> Open anything <kbd>⌘K</kbd>
        </button>
        {auth.loggedIn && (
          <button className="chip nodrag" onClick={() => set({ leftTab: 'connections' })}>
            <span className="dot ok" /> {auth.email}
            {auth.subscriptionType && <span className="plan">{auth.subscriptionType}</span>}
          </button>
        )}
        <button className="icon nodrag" title="Layouts" onClick={() => set({ modal: { kind: 'layouts' } })}>
          <Icon d={ICON.layout} size={16} />
        </button>
        <button className="icon nodrag" title="Settings" onClick={() => set({ modal: { kind: 'settings' } })}>
          <Icon d={ICON.settings} size={16} />
        </button>
        <button className="icon nodrag" title={rightOpen ? 'Hide the work panel' : 'Show the work panel'} onClick={() => set({ rightOpen: !rightOpen })}>
          <Icon d={rightOpen ? ICON.forward : ICON.back} size={16} />
        </button>
      </header>
      <main className={rightOpen ? 'grid' : 'grid noright'}>
        <Left />
        <Desk />
        {rightOpen && <Right />}
      </main>
      <StatusBar />
      {ready && !auth.loggedIn && <LoginGate />}
      {modal?.kind === 'settings' && <SettingsModal />}
      {modal?.kind === 'bot' && <BotEditor bot={modal.bot} />}
      {modal?.kind === 'layouts' && <LayoutManager edit={modal.edit} fromScreen={modal.fromScreen} />}
      {commandOpen && <CommandCenter />}
      <ConfirmModal />
      {toastText && (
        <div className="toast" onClick={() => set({ toast: '' })}>
          {toastText}
        </div>
      )}
    </div>
  )
}
