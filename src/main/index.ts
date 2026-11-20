import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BrowserWindow,
  app,
  dialog,
  ipcMain,
  session,
  shell,
  systemPreferences
} from 'electron'
import { normalizeCurrent, removeLayout, saveLayout, type Layout, type SavedLayout } from '../shared/layouts'
import { normalizeLook, type Bot, type PermissionDecision, type RunParams, type Settings, type SettingsView, type Voice } from '../shared/types'
import { normalizeRecents, removeRecent, setArchivedRecent, setPinnedRecent, upsertRecent, type Recent } from '../shared/recents'
import { decide, makeApp, partitionOf, removeApp, upsertApp, type AppInput, type WebApp } from '../shared/apps'
import * as claude from './claude'
import { appIcon, connectorIcon } from './icons'
import * as terminal from './terminal'
import { load, update } from './store'
import * as voice from './voice'
import * as ws from './workspace'

let win: BrowserWindow | null = null

function settingsView(): SettingsView {
  return {
    ...load().settings,
    elevenKeySource: voice.keySource(),
    claudeFound: claude.findClaude()
  }
}

function createWindow(): void {
  const shot = process.env.GLYPHH_BOT_SHOT
  win = new BrowserWindow({
    width: 1560,
    height: 980,
    minWidth: 1100,
    minHeight: 700,
    show: !shot,
    title: 'Glyphh Bot',
    backgroundColor: '#000000',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Links a bot or a page opens go to the real browser, never a new app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  const query = shot ? { shot: '1' } : undefined
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL + (shot ? '?shot=1' : ''))
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { query })

  // GLYPHH_BOT_SHOT=<file.png> saves a picture of the window and quits (used to check the UI).
  // GLYPHH_BOT_SHOT_JS runs in the page first (window.__shot sets the scene).
  if (shot) {
    win.webContents.once('did-finish-load', async () => {
      const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
      await wait(Number(process.env.GLYPHH_BOT_SHOT_WAIT ?? 2500))
      if (process.env.GLYPHH_BOT_SHOT_JS) {
        await win!.webContents.executeJavaScript(process.env.GLYPHH_BOT_SHOT_JS).catch(console.error)
        await wait(Number(process.env.GLYPHH_BOT_SHOT_AFTER ?? 1500))
      }
      const img = await win!.webContents.capturePage()
      writeFileSync(shot, img.toPNG())
      app.quit()
    })
  }
}

function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>): void {
  ipcMain.handle(channel, (_e, ...args) => fn(...(args as A)))
}

app.setName('Glyphh Bot')
// Screenshot runs draw at 1x so the pictures are the window's real size.
if (process.env.GLYPHH_BOT_SHOT) app.commandLine.appendSwitch('force-device-scale-factor', '1')

app.whenReady().then(() => {
  // The only permission the app's own pages need is the microphone.
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    cb(wc === win?.webContents && permission === 'media')
  })

  handle('auth:status', () => claude.authStatus())
  handle('auth:login', () => claude.login(win!.webContents))
  handle('auth:loginInput', (text: string) => claude.loginInput(text))
  handle('auth:logout', () => claude.logout())

  handle('claude:probe', async (force?: boolean) =>
    claude.probe((await ws.current()).path, !!force)
  )
  handle('claude:icon', (domain: string) => connectorIcon(domain))

  handle('agent:run', (p: RunParams) => claude.run(win!.webContents, p))
  handle('agent:stop', (runId: string) => claude.stop(runId))
  handle('agent:permission', (id: string, d: PermissionDecision) => claude.answerPermission(id, d))

  handle('bots:list', () => load().bots)
  handle('bots:save', (raw: Bot) => {
    const bot = { ...raw, look: normalizeLook(raw.look) }
    return update((d) => {
      const i = d.bots.findIndex((b) => b.id === bot.id)
      if (i >= 0) d.bots[i] = bot
      else d.bots.push(bot)
    }).bots
  })
  handle('bots:remove', (id: string) => update((d) => (d.bots = d.bots.filter((b) => b.id !== id))).bots)
  handle('bots:generate', (prompt: string, voices: Voice[]) => claude.generateBot(prompt, voices))

  handle('settings:get', () => settingsView())
  handle('settings:set', (patch: Partial<Settings>) => {
    update((d) => (d.settings = { ...d.settings, ...patch }))
    return settingsView()
  })
  handle('settings:setElevenKey', (key: string) => {
    update((d) => (d.elevenKey = key.trim()))
    return settingsView()
  })

  handle('voice:tts', (text: string, voiceId: string) => voice.tts(text, voiceId))
  handle('voice:stt', async (audio: Uint8Array, mime: string) => {
    if (process.platform === 'darwin') await systemPreferences.askForMediaAccess('microphone')
    return voice.stt(audio, mime)
  })
  handle('voice:voices', () => voice.voices())

  handle('ws:current', () => ws.current())
  handle('ws:create', (name: string) => ws.create(name))
  handle('ws:open', async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Open a folder for the crew to work in',
      properties: ['openDirectory', 'createDirectory']
    })
    return r.canceled || !r.filePaths[0] ? null : ws.use(r.filePaths[0])
  })
  handle('ws:tree', () => ws.tree())
  handle('ws:read', (p: string) => ws.read(p))
  handle('ws:write', (p: string, content: string) => ws.write(p, content))
  handle('ws:reveal', async () => shell.showItemInFolder((await ws.current()).path))
  handle('ws:list', (dir: string) => ws.list(dir))
  handle('ws:search', (q: string) => ws.search(q))
  handle('ws:mkdir', (p: string) => ws.mkdir(p))
  handle('ws:rename', (from: string, to: string) => ws.rename(from, to))
  handle('ws:trash', (p: string) => ws.trash(p))
  handle('ws:exists', (p: string) => ws.exists(p))
  handle('ws:diff', () => ws.workingDiff())
  handle('ws:pickFile', async () => {
    const r = await dialog.showOpenDialog(win!, { title: 'Open a file in the browser', properties: ['openFile'] })
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0]
  })

  handle('ws:attach', (name: string, bytes: Uint8Array) => ws.attach(name, bytes))
  handle('ws:stat', (p: string) => ws.stat(p))

  handle('recents:list', () => load().recents)
  handle('recents:save', (r: Recent) => update((d) => (d.recents = normalizeRecents(upsertRecent(d.recents, r)))).recents)
  handle('recents:pin', (id: string, on: boolean) => update((d) => (d.recents = setPinnedRecent(d.recents, id, on))).recents)
  handle('recents:archive', (id: string, on: boolean) => update((d) => (d.recents = setArchivedRecent(d.recents, id, on))).recents)
  handle('recents:remove', (id: string) => update((d) => (d.recents = removeRecent(d.recents, id))).recents)

  handle('layouts:list', () => load().layouts)
  handle('layouts:save', (l: SavedLayout, replacing?: string) => {
    const next = saveLayout(load().layouts, l, replacing)
    return update((d) => (d.layouts = next)).layouts
  })
  handle('layouts:remove', (name: string) => update((d) => (d.layouts = removeLayout(d.layouts, name))).layouts)
  handle('layouts:current', () => load().layout)
  handle('layouts:setCurrent', (l: Layout) => {
    update((d) => (d.layout = normalizeCurrent(l)))
  })

  handle('git:beginTurn', (branch: string) => ws.beginTurn(branch))
  handle('git:endTurn', (p: Parameters<typeof ws.endTurn>[0]) => ws.endTurn(p))
  handle('git:merge', (id: number) => ws.merge(id))
  handle('git:reject', (id: number) => ws.reject(id))
  handle('git:prs', () => ws.prs())
  handle('git:diff', (id: number) => ws.diff(id))
  handle('git:branch', () => ws.branch())

  handle('apps:list', () => load().apps)
  // Saving an app with a new address (or no icon yet) fetches its icon first.
  handle('apps:save', async (input: AppInput & { id?: string }) => {
    const id = input.id || Math.random().toString(36).slice(2, 10)
    const old = load().apps.find((a) => a.id === id)
    const draft = makeApp(input, id, old?.icon ?? null)
    if (!draft) throw new Error('That is not a web address.')
    if (!old || old.url !== draft.url || !old.icon) draft.icon = await appIcon(draft.url)
    return update((d) => (d.apps = upsertApp(d.apps, draft))).apps
  })
  handle('apps:remove', (id: string) => update((d) => (d.apps = removeApp(d.apps, id))).apps)

  ipcMain.handle('term:spawn', async (e, id: string, cols: number, rows: number) => terminal.spawn(e.sender, id, (await ws.current()).path, cols, rows))
  ipcMain.on('term:write', (_e, id: string, data: string) => terminal.write(id, data))
  ipcMain.on('term:resize', (_e, id: string, cols: number, rows: number) => terminal.resize(id, cols, rows))
  ipcMain.on('term:kill', (_e, id: string) => terminal.kill(id))

  handle('openExternal', (url: string) => {
    if (/^https?:\/\//.test(url)) return shell.openExternal(url)
  })

  void ws.recover().catch(() => undefined)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Pages in the Browser tab get no preload and no Node, and the app's own window
// never navigates away from the app.
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (_ev, prefs) => {
    delete prefs.preload
    prefs.nodeIntegration = false
    prefs.contextIsolation = true
  })
  if (contents.getType() === 'window') {
    contents.on('will-navigate', (ev, url) => {
      if (url !== contents.getURL()) ev.preventDefault()
    })
  } else if (contents.getType() === 'webview') {
    // An app's panel (its own persist:app-<id> session) keeps the app's own
    // pages: a new window inside its prefixes loads in place; one outside
    // them opens in the Browser panel. Plain Browser pages load new windows
    // in place, as before.
    contents.setWindowOpenHandler(({ url }) => {
      if (!/^https?:/.test(url)) return { action: 'deny' }
      const owner = appOf(contents)
      if (!owner || decide(owner, url, 'window') === 'stay') void contents.loadURL(url)
      else contents.hostWebContents?.send('browser:open', url)
      return { action: 'deny' }
    })
    // Navigations and redirects inside the prefixes go ahead in the panel, as
    // do ones outside them (the current behaviour); a redirect that hands the
    // page to a desktop app (slack://...) is stopped so the panel keeps it.
    const keep = (kind: 'navigate' | 'redirect') => (ev: Electron.Event, url: string) => {
      if (decide(appOf(contents), url, kind) === 'block') ev.preventDefault()
    }
    contents.on('will-navigate', keep('navigate'))
    contents.on('will-redirect', keep('redirect'))
  }
})

/** The app whose panel a webview is, by its session; null for the plain Browser. */
function appOf(contents: Electron.WebContents): WebApp | null {
  const path = contents.session.storagePath
  for (const a of load().apps) {
    const s = session.fromPartition(partitionOf(a.id))
    if (s === contents.session || (path && s.storagePath === path)) return a
  }
  return null
}

app.on('before-quit', () => {
  claude.stopAll()
  terminal.killAll()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
