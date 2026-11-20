// The Terminal panel's shells, ported from the Glyphh desktop
// (glyphh/app src/main/wb-terminal.ts and pty-helper.ts): one login shell per
// terminal id in a pty, in the workspace folder, its output streamed to the
// renderer as term:data:<id>.
import { chmodSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir, platform } from 'node:os'
import { dirname, join } from 'node:path'
import type { WebContents } from 'electron'
import type * as Pty from 'node-pty'

const req = createRequire(__filename)
const shells = new Map<string, { proc: Pty.IPty; wc: WebContents }>()
let ready = false

/** node-pty 1.1.0 ships spawn-helper without its execute bit; every spawn fails until it has it. */
function ensurePtyReady(): void {
  if (ready) return
  ready = true
  try {
    const dir = dirname(req.resolve('node-pty/package.json'))
    for (const f of [join(dir, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'), join(dir, 'build', 'Release', 'spawn-helper')]) {
      try {
        const mode = statSync(f).mode
        if ((mode & 0o111) !== 0o111) chmodSync(f, mode | 0o755)
      } catch {
        /* not on this platform */
      }
    }
  } catch (e) {
    console.warn('[term] could not check spawn-helper', (e as Error).message)
  }
}

export function spawn(wc: WebContents, id: string, cwd: string, cols: number, rows: number): void {
  if (!id || shells.has(id)) return
  ensurePtyReady()
  const pty = req('node-pty') as typeof Pty
  const shell = process.env.SHELL || (platform() === 'win32' ? 'powershell.exe' : '/bin/zsh')
  let dir = cwd || homedir()
  try {
    if (!statSync(dir).isDirectory()) dir = homedir()
  } catch {
    dir = homedir()
  }
  let proc: Pty.IPty
  try {
    proc = pty.spawn(shell, platform() === 'win32' ? [] : ['-il'], {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: dir,
      env: { ...(process.env as Record<string, string>), COLORFGBG: '15;0' }
    })
  } catch (e) {
    if (!wc.isDestroyed()) wc.send(`term:data:${id}`, `\r\n\x1b[1mThe terminal could not start: ${(e as Error).message}\x1b[0m\r\n`)
    return
  }
  shells.set(id, { proc, wc })
  proc.onData((d) => {
    if (!wc.isDestroyed()) wc.send(`term:data:${id}`, d)
  })
  proc.onExit(({ exitCode }) => {
    shells.delete(id)
    if (!wc.isDestroyed()) wc.send(`term:exit:${id}`, exitCode)
  })
}

export const write = (id: string, data: string): void => shells.get(id)?.proc.write(data)

export function resize(id: string, cols: number, rows: number): void {
  try {
    if (cols > 0 && rows > 0) shells.get(id)?.proc.resize(cols, rows)
  } catch {
    /* xterm can report 0 while it is hidden */
  }
}

export function kill(id: string): void {
  const s = shells.get(id)
  shells.delete(id)
  try {
    s?.proc.kill()
  } catch {
    /* already gone */
  }
}

export const killAll = (): void => [...shells.keys()].forEach(kill)
