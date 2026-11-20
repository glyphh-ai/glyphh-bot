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
import type { Bot, PermissionDecision, RunParams, Settings, SettingsView, Voice } from '../shared/types'
import * as claude from './claude'
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
  const shot = process.env.OLIVER_SHOT
  win = new BrowserWindow({
    width: 1560,
    height: 980,
    minWidth: 1100,
    minHeight: 700,
    show: !shot,
    backgroundColor: '#07040f',
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

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))

  // OLIVER_SHOT=<file.png> saves a picture of the window and quits (used to check the UI).
  if (shot) {
    win.webContents.once('did-finish-load', async () => {
      const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
      await wait(Number(process.env.OLIVER_SHOT_WAIT ?? 2500))
      if (process.env.OLIVER_SHOT_JS) {
        await win!.webContents.executeJavaScript(process.env.OLIVER_SHOT_JS).catch(console.error)
        await wait(Number(process.env.OLIVER_SHOT_AFTER ?? 1500))
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

  handle('agent:run', (p: RunParams) => claude.run(win!.webContents, p))
  handle('agent:stop', (runId: string) => claude.stop(runId))
  handle('agent:permission', (id: string, d: PermissionDecision) => claude.answerPermission(id, d))

  handle('bots:list', () => load().bots)
  handle('bots:save', (bot: Bot) => {
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

  handle('git:beginTurn', (branch: string) => ws.beginTurn(branch))
  handle('git:endTurn', (p: Parameters<typeof ws.endTurn>[0]) => ws.endTurn(p))
  handle('git:merge', (id: number) => ws.merge(id))
  handle('git:reject', (id: number) => ws.reject(id))
  handle('git:prs', () => ws.prs())
  handle('git:diff', (id: number) => ws.diff(id))
  handle('git:branch', () => ws.branch())

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
  } else {
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) void contents.loadURL(url)
      return { action: 'deny' }
    })
  }
})

app.on('before-quit', () => claude.stopAll())
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
