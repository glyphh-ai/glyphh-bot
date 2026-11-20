// The Terminal panel, ported from the Glyphh desktop (code-workbench.ts's
// terminal section and wb-terminal.ts): xterm on a login shell in a pty, in
// the project folder. It fits its frame as the desk reflows, spawns only
// once it has a real size, and its shell ends when the panel closes.
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef } from 'react'
import { api } from '../store'

let seq = 0

const THEME = {
  background: '#000000',
  foreground: '#e8e8e8',
  cursor: '#ffffff',
  cursorAccent: '#000000',
  selectionBackground: 'rgba(255,255,255,0.22)',
  black: '#000000',
  red: '#ff6b6b',
  green: '#7ee2a8',
  yellow: '#f5d97a',
  blue: '#8ab4ff',
  magenta: '#d7a6ff',
  cyan: '#7fdbea',
  white: '#d0d0d0',
  brightBlack: '#999999',
  brightRed: '#ff8f8f',
  brightGreen: '#a4f0c4',
  brightYellow: '#fbe7a6',
  brightBlue: '#b1ccff',
  brightMagenta: '#e6c6ff',
  brightCyan: '#a9eaf4',
  brightWhite: '#ffffff'
}

export function TerminalPanel(): JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = host.current
    if (!el) return
    const id = `t${Date.now().toString(36)}${seq++}`
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, monospace",
      fontSize: 12,
      theme: THEME,
      scrollback: 10_000,
      allowProposedApi: true
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    let started = false
    let gone = false
    const offData = api.term.onData(id, (d) => term.write(d))
    const offExit = api.term.onExit(id, () => {
      term.write('\r\n\x1b[2m[the shell ended]\x1b[0m\r\n')
    })
    const sub = term.onData((d) => api.term.write(id, d))
    const size = (): void => {
      if (gone || !el.clientWidth || !el.clientHeight) return
      try {
        fit.fit()
      } catch {
        return
      }
      if (!started) {
        started = true
        void api.term.spawn(id, term.cols, term.rows)
      } else api.term.resize(id, term.cols, term.rows)
    }
    const ro = new ResizeObserver(() => requestAnimationFrame(size))
    ro.observe(el)
    requestAnimationFrame(size)
    return () => {
      gone = true
      ro.disconnect()
      sub.dispose()
      offData()
      offExit()
      api.term.kill(id)
      term.dispose()
    }
  }, [])
  return (
    <div className="pane term" onMouseDown={() => host.current?.querySelector('textarea')?.focus()}>
      <div className="termhost" ref={host} />
    </div>
  )
}
