import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface MenuItem {
  label: string
  onPick: () => void
  danger?: boolean
}

/** A right-click menu at a point; closes on a pick, a click elsewhere or Escape. */
export function Menu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setPos({
      left: Math.max(6, Math.min(x, window.innerWidth - el.offsetWidth - 6)),
      top: Math.max(6, Math.min(y, window.innerHeight - el.offsetHeight - 6))
    })
  }, [x, y])
  useEffect(() => {
    const away = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', away, true)
    document.addEventListener('keydown', key, true)
    return () => {
      document.removeEventListener('mousedown', away, true)
      document.removeEventListener('keydown', key, true)
    }
  }, [onClose])
  return (
    <div className="ctxmenu" ref={ref} style={pos}>
      {items.map((it) => (
        <button
          key={it.label}
          className={it.danger ? 'danger' : ''}
          onClick={() => {
            onClose()
            it.onPick()
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

/** Line icons, one set (the desktop's). */
export const ICON = {
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z',
  newFile: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 12v6M9 15h6',
  newFolder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM12 10v6M9 13h6',
  refresh: 'M23 4v6h-6M20.49 15a9 9 0 1 1-2.12-9.36L23 10',
  expand: 'M6 9l6 6 6-6',
  collapse: 'M18 15l-6-6-6 6',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  code: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
  plus: 'M12 5v14M5 12h14',
  back: 'M15 18l-6-6 6-6',
  forward: 'M9 18l6-6-6-6',
  editor: 'M8.5 8 4.5 12l4 4M15.5 8l4 4-4 4M13.5 5.5l-3 13',
  diff: 'M12 3v6M9 6h6M9 17h6M5 21h14a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1z',
  browser:
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.5 12h17M12 3c2.6 2.6 3.6 6 3.6 9s-1 6.4-3.6 9M12 3C9.4 5.6 8.4 9 8.4 12s1 6.4 3.6 9',
  files: 'M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z',
  swarm:
    'M5 6.5a2 2 0 1 0 4 0 2 2 0 0 0-4 0zM15 6.5a2 2 0 1 0 4 0 2 2 0 0 0-4 0zM10 16.5a2 2 0 1 0 4 0 2 2 0 0 0-4 0zM8.5 8l2.5 6.6M15.5 8 13 14.6M9 6.5h6',
  chat: 'M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z',
  layout: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  open: 'M14 3h7v7M10 14L21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5',
  grow: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  shrink: 'M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7',
  pin: 'M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z',
  attach: 'M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM19 11a7 7 0 0 1-14 0M12 18v3',
  speaker: 'M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14',
  mute: 'M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6',
  more: 'M5 12h.01M12 12h.01M19 12h.01'
} as const

export function Icon({ d, size = 16 }: { d: string; size?: number }): JSX.Element {
  return (
    <svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  )
}
