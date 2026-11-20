// The Browser panel, ported from the Glyphh desktop (code-workbench.ts
// renderPreviewIntoSlot): a <webview> per tab, never an iframe, so sites that
// refuse frames still load; tabs swap by visibility so each keeps its page
// and history. An address bar that searches when it isn't an address, back,
// forward, reload, open a file from disk, Preview (the workspace's
// index.html), and a page that says what went wrong instead of a blank one.
import { createElement, useEffect, useRef, useState } from 'react'
import { Icon, ICON } from '../Menu'
import { api, useStore } from '../store'
import { toUrl } from '../../../shared/url'
import { partitionOf, type WebApp } from '../../../shared/apps'

interface WebviewEl extends HTMLElement {
  src: string
  goBack(): void
  goForward(): void
  reload(): void
  getURL(): string
  getTitle(): string
  loadURL(url: string): Promise<void>
}

interface Tab {
  id: number
  url: string
  title: string
  error?: string
}

let nextId = 1

const titleOf = (t: Tab): string => {
  if (t.title) return t.title
  if (!t.url) return 'New tab'
  try {
    return new URL(t.url).hostname || t.url.split('/').pop() || t.url
  } catch {
    return t.url
  }
}

function Page({
  tab,
  show,
  partition,
  popups,
  onNav,
  onFail
}: {
  tab: Tab
  show: boolean
  partition: string
  popups: boolean
  onNav: (url: string, title?: string) => void
  onFail: (msg: string) => void
}): JSX.Element {
  const ref = useRef<WebviewEl>(null)
  // The first page only: later pages load through loadURL, so a navigation
  // never echoes back into src and reloads the page.
  const [first] = useState(tab.url)
  useEffect(() => {
    const v = ref.current
    if (!v) return
    const nav = (): void => onNav(v.getURL(), v.getTitle?.())
    const title = (e: Event): void => onNav(v.getURL(), (e as unknown as { title: string }).title)
    const fail = (e: Event): void => {
      const err = e as unknown as { errorCode: number; errorDescription: string; validatedURL: string; isMainFrame: boolean }
      // -3 is a navigation the page itself cancelled: not a failure.
      if (!err.isMainFrame || err.errorCode === -3) return
      onFail(`${err.errorDescription || 'It did not load'} (${err.errorCode}). ${err.validatedURL}`)
    }
    v.addEventListener('did-navigate', nav)
    v.addEventListener('did-navigate-in-page', nav)
    v.addEventListener('page-title-updated', title)
    v.addEventListener('did-fail-load', fail)
    return () => {
      v.removeEventListener('did-navigate', nav)
      v.removeEventListener('did-navigate-in-page', nav)
      v.removeEventListener('page-title-updated', title)
      v.removeEventListener('did-fail-load', fail)
    }
  }, [])
  return (
    <div className="webwrap" style={{ display: show ? 'flex' : 'none' }}>
      {createElement('webview', { ref, src: first, className: 'web', partition, ...(popups ? { allowpopups: 'true' } : {}), 'data-tab': tab.id })}
      {tab.error && (
        <div className="weberr">
          <b>This page did not load</b>
          <p>{tab.error}</p>
          <button className="btn" onClick={() => ref.current?.reload()}>
            Try again
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * The Browser, or one of your apps: an app's panel starts on the app's page
 * in the app's own session (persist:app-<id>, so its sign-in sticks), and the
 * main process keeps the app's own pages in it (shared/apps.ts decide).
 */
export function BrowserPanel({ app }: { app?: WebApp }): JSX.Element {
  const asked0 = useStore((s) => s.browserUrl)
  const start = app ? app.url : asked0
  const partition = app ? partitionOf(app.id) : 'persist:glyphh-bot'
  const ws = useStore((s) => s.ws)
  const [tabs, setTabs] = useState<Tab[]>(() => [{ id: nextId++, url: start, title: '' }])
  const [active, setActive] = useState(tabs[0]!.id)
  const [bar, setBar] = useState(start)
  const views = useRef<HTMLDivElement>(null)
  const tab = tabs.find((t) => t.id === active) ?? tabs[0]!

  useEffect(() => setBar(tab.url), [active])

  const patch = (id: number, p: Partial<Tab>): void => setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)))

  const view = (): WebviewEl | null => views.current?.querySelector<WebviewEl>(`webview[data-tab="${tab.id}"]`) ?? null

  const go = (raw: string): void => {
    const url = toUrl(raw)
    if (!url) return
    setBar(url)
    const v = view()
    // A tab with a page loads in place; an empty tab gets its first page.
    if (v && tab.url) {
      patch(tab.id, { error: undefined })
      void v.loadURL(url).catch(() => undefined)
    } else patch(tab.id, { url, title: '', error: undefined })
  }

  // A page asked for after the panel opened (store.browserUrl) loads in the tab on screen.
  const asked = useRef(start)
  useEffect(() => {
    if (start && start !== asked.current) go(start)
    asked.current = start
  }, [start])

  const newTab = (url = ''): void => {
    const t = { id: nextId++, url, title: '' }
    setTabs((ts) => [...ts, t])
    setActive(t.id)
  }

  const closeTab = (id: number): void => {
    const rest = tabs.filter((t) => t.id !== id)
    if (!rest.length) {
      const t = { id: nextId++, url: '', title: '' }
      setTabs([t])
      setActive(t.id)
      return
    }
    setTabs(rest)
    if (id === active) setActive(rest.at(-1)!.id)
  }

  return (
    <div className="pane browser">
      <div className="btabs">
        {tabs.map((t) => (
          <div key={t.id} className={t.id === tab.id ? 'bt on' : 'bt'} onClick={() => setActive(t.id)} title={t.url}>
            <span>{titleOf(t)}</span>
            <button
              title="Close tab"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(t.id)
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button className="ibtn" title="New tab" onClick={() => newTab()}>
          <Icon d={ICON.plus} />
        </button>
      </div>
      <div className="urlbar">
        <button className="ibtn" onClick={() => view()?.goBack()} title="Back">
          <Icon d={ICON.back} />
        </button>
        <button className="ibtn" onClick={() => view()?.goForward()} title="Forward">
          <Icon d={ICON.forward} />
        </button>
        <button className="ibtn" onClick={() => view()?.reload()} title="Reload">
          <Icon d={ICON.refresh} />
        </button>
        <input
          value={bar}
          spellCheck={false}
          placeholder="Search or type a web address"
          onChange={(e) => setBar(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && go(bar)}
        />
        <button
          className="ibtn"
          title="Open a file from disk"
          onClick={async () => {
            const p = await api.ws.pickFile()
            if (p) go('file://' + p)
          }}
        >
          <Icon d={ICON.folder} />
        </button>
        {!app && (
          <button className="btn tiny" title="Open the project's index.html" onClick={() => ws && go(`file://${ws.path}/index.html`)}>
            Preview
          </button>
        )}
      </div>
      <div className="webviews" ref={views}>
        {tabs.map((t) =>
          t.url ? (
            <Page
              key={t.id}
              tab={t}
              show={t.id === tab.id}
              partition={partition}
              popups={!!app}
              onNav={(url, title) => {
                patch(t.id, { url, ...(title ? { title } : {}), error: undefined })
                if (t.id === active && document.activeElement?.tagName !== 'INPUT') setBar(url)
              }}
              onFail={(msg) => patch(t.id, { error: msg })}
            />
          ) : null
        )}
        {!tab.url && (
          <div className="empty">
            <b>Browser</b>
            <p>Look something up, or hit Preview to see what the crew built.</p>
          </div>
        )}
      </div>
    </div>
  )
}
