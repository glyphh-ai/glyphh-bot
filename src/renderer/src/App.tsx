import { useEffect, useState } from 'react'
import { botPanel, frameOf, PANELS } from '../../shared/layouts'
import { archivedRecents, groupRecents, type Recent } from '../../shared/recents'
import logo from './assets/glyphh-logo-text-white.png'
import { Cat } from './Cat'
import { CommandCenter, startCommandKey } from './CommandCenter'
import { Desk, LayoutMenu } from './Desk'
import { startEvents } from './engine'
import { StatusBar } from './Hud'
import { LayoutManager } from './LayoutManager'
import { Left } from './Left'
import { Icon, ICON, Menu } from './Menu'
import { BotEditor, ConfirmModal, LoginGate, SettingsModal, startAuthEvents } from './Modals'
import { PANEL_ICON } from './panelInfo'
import * as store from './store'
import {
  api,
  archiveRecent,
  boot,
  closePanel,
  deleteRecent,
  newChat,
  openCommand,
  openPanel,
  pinRecent,
  refreshFiles,
  reopenRecent,
  set,
  toast,
  useStore,
  why
} from './store'

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

/** The top bar's panel buttons: each opens its panel (or focuses it), or closes it when it is open. */
const QUICK = ['files', 'browser', 'editor', 'diff'] as const

function PanelButtons(): JSX.Element {
  const layout = useStore((s) => s.layout)
  const bots = useStore((s) => s.bots)
  const [more, setMore] = useState<{ x: number; y: number } | null>(null)
  const isOpen = (id: string): boolean => frameOf(layout, id) >= 0
  const others = PANELS.filter((p) => p.id !== 'chat' && !(QUICK as readonly string[]).includes(p.id))
  return (
    <div className="pbtns nodrag">
      {QUICK.map((id) => (
        <button
          key={id}
          className={`icon ${isOpen(id) ? 'on' : ''}`}
          title={`${PANELS.find((p) => p.id === id)!.label}${isOpen(id) ? ' (open: click to close)' : ''}`}
          onClick={() => (isOpen(id) ? closePanel(id) : openPanel(id))}
        >
          <Icon d={PANEL_ICON[id]!} size={16} />
        </button>
      ))}
      <button
        className="icon"
        title="More panels and bots"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setMore({ x: r.left, y: r.bottom + 4 })
        }}
      >
        <Icon d="M12 5h.01M12 12h.01M12 19h.01" size={16} />
      </button>
      {more && (
        <Menu
          x={more.x}
          y={more.y}
          onClose={() => setMore(null)}
          items={[
            ...others.map((p) => ({ label: `${isOpen(p.id) ? '✓ ' : ''}${p.label}`, onPick: () => openPanel(p.id) })),
            ...bots.map((b) => ({ label: `${isOpen(botPanel(b.id)) ? '✓ ' : ''}${b.name}'s chat`, onPick: () => openPanel(botPanel(b.id)) })),
            { label: 'Open anything… (⌘K)', onPick: () => openCommand(null) }
          ]}
        />
      )}
    </div>
  )
}

const ago = (t: number): string => {
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

function RecentRow({ r, onDone }: { r: Recent; onDone: () => void }): JSX.Element {
  const bot = useStore((s) => s.bots.find((b) => b.id === r.room))
  const current = useStore((s) => s.chatId[r.room] === r.id)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  return (
    <div className={`rrow ${current ? 'on' : ''} ${menu ? 'menuopen' : ''}`}>
      <button
        className="rmain"
        onClick={() => {
          onDone()
          void reopenRecent(r)
        }}
      >
        <span className="rwho">{bot ? <Cat look={bot.look} size={18} /> : <Icon d={ICON.chat} size={14} />}</span>
        <span className="rtitle">{r.title}</span>
        <small>
          {r.room === 'crew' ? 'Crew' : (bot?.name ?? 'Bot')} · {ago(r.updatedAt)}
        </small>
      </button>
      <button
        className="rmore"
        title="Pin, archive or delete"
        onClick={(e) => {
          e.stopPropagation()
          const b = e.currentTarget.getBoundingClientRect()
          setMenu({ x: b.right - 160, y: b.bottom + 2 })
        }}
      >
        <Icon d={ICON.more} size={14} />
      </button>
      {menu && (
        <Menu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={
            r.archived
              ? [
                  { label: 'Restore', onPick: () => void archiveRecent(r.id, false) },
                  { label: 'Delete…', danger: true, onPick: () => void deleteRecent(r) }
                ]
              : [
                  { label: r.pinned ? 'Unpin' : 'Pin', onPick: () => void pinRecent(r.id, !r.pinned) },
                  { label: 'Archive', onPick: () => void archiveRecent(r.id, true) },
                  { label: 'Delete…', danger: true, onPick: () => void deleteRecent(r) }
                ]
          }
        />
      )}
    </div>
  )
}

/** Recents: past chats, Pinned first, then by folder; Archived at the bottom. */
function RecentsMenu(): JSX.Element {
  const recents = useStore((s) => s.recents)
  const open = useStore((s) => s.recentsOpen)
  const [archived, setArchived] = useState(false)
  const close = (): void => set({ recentsOpen: false })
  const sections = groupRecents(recents)
  const arch = archivedRecents(recents)
  useEffect(() => {
    if (!open) setArchived(false)
  }, [open])
  return (
    <div className="recents nodrag">
      <button className={`chip ${open ? 'on' : ''}`} title="Past chats" onClick={() => set({ recentsOpen: !open })}>
        <Icon d="M12 7v5l3 2M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" size={14} /> Recents <span className="dim">▾</span>
      </button>
      {open && (
        <>
          <div className="veil clear" onMouseDown={close} />
          <div className="rpanel">
            <div className="rhead">
              {archived ? (
                <button className="link" onClick={() => setArchived(false)}>
                  ‹ Recents
                </button>
              ) : (
                <b>Recents</b>
              )}
              <span className="spacer" />
              <button
                className="btn sm"
                onClick={() => {
                  close()
                  void newChat()
                }}
              >
                <Icon d={ICON.plus} size={12} /> New chat
              </button>
            </div>
            <div className="rlist">
              {archived ? (
                arch.length ? (
                  <div className="rsec">
                    <div className="rlabel">Archived</div>
                    {arch.map((r) => (
                      <RecentRow key={r.id} r={r} onDone={close} />
                    ))}
                  </div>
                ) : (
                  <p className="dim pad">Nothing archived.</p>
                )
              ) : sections.length ? (
                sections.map((s) => (
                  <div key={s.key} className="rsec">
                    <div className="rlabel" title={s.key === 'pinned' ? undefined : s.key}>
                      {s.key === 'pinned' && <Icon d={ICON.pin} size={11} />} {s.title}
                    </div>
                    {s.items.map((r) => (
                      <RecentRow key={r.id} r={r} onDone={close} />
                    ))}
                  </div>
                ))
              ) : (
                <p className="dim pad">No chats yet. Every chat you start shows up here.</p>
              )}
            </div>
            {!archived && (
              <button className="rarch" onClick={() => setArchived(true)}>
                Archived <span className="dim">{arch.length}</span>
              </button>
            )}
          </div>
        </>
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
        <RecentsMenu />
        <div className="spacer" />
        <button className="chip nodrag search" title="Open a panel or a bot (⌘K)" onClick={() => openCommand(null)}>
          <Icon d={ICON.open} size={14} /> Open <kbd>⌘K</kbd>
        </button>
        <PanelButtons />
        <LayoutMenu />
      </header>
      <main className="grid">
        <Left />
        <Desk />
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
