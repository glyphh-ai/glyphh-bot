// The chat, the app's center: the crew room or one bot's direct chat. Bubbles
// render full markdown (tables, task lists, highlighted code with Copy and
// Open in editor, diffs, mermaid, math, images); a bot's tool calls fold into
// one summary line; files it made or changed show as cards; a crew turn's
// pull request is a card that opens to its files and diff. The swarm lives
// here too: the turn strip on top says who is up and how each turn's PR went.
// The composer is one line of controls, with + to attach files (also drop or
// paste them): they are copied into the folder, and images go to the bot as
// pictures.
import 'katex/dist/katex.min.css'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Attachment, Bot, PermissionMode, PR } from '../../shared/types'
import { Cat } from './Cat'
import { changedFiles, fileKind, fileSize, isImageName, toolSummary } from './chatBits'
import { answer, decidePr, send, stop, toggleMic } from './engine'
import { Reactor } from './Hud'
import { diffHtml, extFor, imageSrc, md, monacoLang } from './md'
import { Icon, ICON } from './Menu'
import { api, browse, get, openFile, openPanel, set, setSettings, toast, useStore, why, type Msg, type PendingFile, type ToolCall } from './store'
import { stopSpeaking } from './voice'

// ------------------------------------------------------------ attachments

type Pending = PendingFile
const pendingOf = (room: string): Pending[] => get().pending[room] ?? []
const setPending = (room: string, list: Pending[]): void => set((s) => ({ pending: { ...s.pending, [room]: list } }))

function base64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

async function thumbOf(file: Blob): Promise<string | undefined> {
  try {
    const bmp = await createImageBitmap(file)
    const k = Math.min(1, 240 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(bmp.width * k))
    c.height = Math.max(1, Math.round(bmp.height * k))
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.82)
  } catch {
    return undefined
  }
}

const CLAUDE_IMAGES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

/** Copy files into the folder's attachments/ and hold them for the next message. */
export async function attachFiles(room: string, files: ArrayLike<File>): Promise<void> {
  for (const f of Array.from(files)) {
    try {
      const bytes = new Uint8Array(await f.arrayBuffer())
      const name = f.name || `pasted-${Date.now().toString(36)}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`
      const path = await api.ws.attach(name, bytes)
      const mime = f.type || 'application/octet-stream'
      const isImg = CLAUDE_IMAGES.includes(mime)
      const p: Pending = {
        att: { name, path, size: bytes.length, mime, ...(isImg || mime.startsWith('image/') ? { thumb: await thumbOf(f) } : {}) },
        ...(isImg && bytes.length < 5 * 1024 * 1024 ? { image: { mediaType: mime, data: base64(bytes) } } : {})
      }
      setPending(room, [...pendingOf(room), p])
    } catch (e) {
      toast(`Could not attach ${f.name}: ${why(e)}`)
    }
  }
}

function openAttachment(a: Attachment): void {
  const base = get().ws?.path ?? ''
  if (a.mime.startsWith('image/') || a.mime === 'application/pdf') browse(imageSrc(a.path, base))
  else void openFile(a.path).catch(() => toast('That file is not in the folder any more.'))
}

function AttachmentChips({ list, onRemove }: { list: Attachment[]; onRemove?: (i: number) => void }): JSX.Element {
  const base = useStore((s) => s.ws?.path ?? '')
  return (
    <div className="atts">
      {list.map((a, i) =>
        a.mime.startsWith('image/') ? (
          <div key={a.path} className="att img" title={a.path} onClick={() => openAttachment(a)}>
            <img src={a.thumb || imageSrc(a.path, base)} alt={a.name} />
            {onRemove && (
              <button className="x" title="Remove" onClick={(e) => (e.stopPropagation(), onRemove(i))}>
                ×
              </button>
            )}
          </div>
        ) : (
          <div key={a.path} className="att" title={a.path} onClick={() => openAttachment(a)}>
            <span className="kind">{fileKind(a.name)}</span>
            <span className="an">{a.name}</span>
            <small>{fileSize(a.size)}</small>
            {onRemove && (
              <button className="x" title="Remove" onClick={(e) => (e.stopPropagation(), onRemove(i))}>
                ×
              </button>
            )}
          </div>
        )
      )}
    </div>
  )
}

// --------------------------------------------------------------- markdown

let mermaidReady: Promise<typeof import('mermaid').default> | null = null
function mermaid(): Promise<typeof import('mermaid').default> {
  mermaidReady ??= import('mermaid').then((m) => {
    m.default.initialize({
      startOnLoad: false,
      theme: 'base',
      securityLevel: 'strict',
      themeVariables: {
        background: '#000000',
        primaryColor: '#111111',
        primaryTextColor: '#eaeaea',
        primaryBorderColor: '#999999',
        lineColor: '#c8c8c8',
        secondaryColor: '#1a1a1a',
        tertiaryColor: '#0d0d0d',
        fontFamily: 'Inter, system-ui, sans-serif'
      }
    })
    return m.default
  })
  return mermaidReady
}
let mermaidN = 0

let snippetN = 0
/** A code block opened in the Editor as a new unsaved file (saving writes it into the folder). */
function openSnippet(lang: string, code: string): void {
  const path = `snippet-${++snippetN}.${extFor(lang)}`
  set((s) => ({ openFiles: [...s.openFiles, { path, content: code, saved: '' }], activeFile: path }))
  openPanel('editor')
}

/** A bubble's markdown, lit up after it renders: colour, diagrams, math and the buttons. */
function Markdown({ text, live }: { text: string; live?: boolean }): JSX.Element {
  const base = useStore((s) => s.ws?.path ?? '')
  const ref = useRef<HTMLDivElement>(null)
  const html = useMemo(() => md(text, { base }), [text, base])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (el.innerHTML !== html) el.innerHTML = html
    let cancelled = false
    // Math is cheap: always.
    const maths = el.querySelectorAll<HTMLElement>('.math[data-tex]')
    if (maths.length)
      void import('katex').then(({ default: katex }) => {
        if (cancelled) return
        maths.forEach((m) => {
          try {
            katex.render(m.dataset.tex ?? '', m, { throwOnError: false, displayMode: m.classList.contains('block') })
            m.removeAttribute('data-tex')
          } catch {
            /* left as text */
          }
        })
      })
    if (live) return () => void (cancelled = true)
    // Code colour and diagrams once the text has settled.
    const codes = el.querySelectorAll<HTMLElement>('.code[data-lang] code')
    if (codes.length)
      void import('./monaco').then(({ monaco }) => {
        monaco.editor.setTheme('glyphh')
        codes.forEach((c) => {
          const lang = monacoLang((c.closest('.code') as HTMLElement).dataset.lang ?? '')
          if (!lang || c.dataset.lit) return
          const src = c.textContent ?? ''
          void monaco.editor.colorize(src, lang, { tabSize: 2 }).then((h) => {
            if (cancelled) return
            c.innerHTML = h
            c.dataset.lit = '1'
          })
        })
      })
    const diagrams = el.querySelectorAll<HTMLElement>('.mermaid-src[data-src]')
    if (diagrams.length)
      void mermaid().then((m) =>
        diagrams.forEach((d) => {
          const src = d.dataset.src ?? ''
          void m
            .render(`mmd${++mermaidN}`, src)
            .then(({ svg }) => {
              if (cancelled) return
              d.innerHTML = svg
              d.classList.add('drawn')
              d.removeAttribute('data-src')
            })
            .catch(() => d.classList.add('bad'))
        })
      )
    return () => void (cancelled = true)
  }, [html, live])

  const onClick = (e: React.MouseEvent): void => {
    const t = e.target as HTMLElement
    const link = t.closest<HTMLElement>('[data-link]')
    if (link) {
      e.preventDefault()
      const href = link.dataset.link!
      if (/^https?:|^file:/.test(href)) browse(href)
      else void openFile(href.replace(/^\.\//, '')).catch(() => browse(imageSrc(href, get().ws?.path ?? '')))
      return
    }
    const img = t.closest<HTMLImageElement>('img.mdimg')
    if (img) {
      browse(img.src)
      return
    }
    const btn = t.closest<HTMLElement>('[data-act]')
    if (!btn) return
    const block = btn.closest<HTMLElement>('.code')!
    const code = block.querySelector('code')?.textContent ?? ''
    if (btn.dataset.act === 'copy') {
      void navigator.clipboard.writeText(code).then(() => {
        btn.textContent = 'Copied'
        setTimeout(() => (btn.textContent = 'Copy'), 1200)
      })
    } else if (btn.dataset.act === 'edit') openSnippet(block.dataset.lang ?? '', code)
  }

  return <div className="bubble md" ref={ref} onClick={onClick} />
}

// ------------------------------------------------------------ tool calls

const TOOL_ICON: Record<string, string> = {
  Bash: '›_',
  Read: '◎',
  Edit: '✎',
  Write: '✎',
  MultiEdit: '✎',
  Grep: '⌕',
  Glob: '⌕',
  WebSearch: '◍',
  WebFetch: '◍',
  Agent: '❖'
}
const toolName = (n: string): string => (n.startsWith('mcp__') ? n.split('__').slice(1).join(' › ') : n)

function ToolGroup({ tools, live }: { tools: ToolCall[]; live?: boolean }): JSX.Element {
  const [open, setOpen] = useState(false)
  const running = tools.filter((t) => t.status === 'run').at(-1)
  const errs = tools.filter((t) => t.status === 'err').length
  return (
    <div className={`tgroup ${open ? 'open' : ''}`}>
      <button className="tsum" onClick={() => setOpen(!open)}>
        <Icon d={open ? ICON.collapse : ICON.expand} size={12} />
        {live && running ? (
          <span className="trun">
            <b>{toolName(running.name)}</b> {running.detail}
          </span>
        ) : (
          <span>{toolSummary(tools)}</span>
        )}
        {errs > 0 && <span className="terr">{errs} failed</span>}
      </button>
      {open && (
        <div className="tools">
          {tools.map((t) => (
            <div key={t.id} className={`tool ${t.status}`} title={t.detail}>
              <span className="ti">{TOOL_ICON[t.name] ?? (t.name.startsWith('mcp__') ? '⚡' : '•')}</span>
              <b>{toolName(t.name)}</b>
              <span className="td">{t.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FileCards({ tools }: { tools: ToolCall[] }): JSX.Element | null {
  const root = useStore((s) => s.ws?.path ?? '')
  const tick = useStore((s) => s.fsTick)
  const files = useMemo(() => changedFiles(tools, root), [tools, root])
  const [sizes, setSizes] = useState<Record<string, number | null>>({})
  useEffect(() => {
    let off = false
    void Promise.all(files.map(async (f) => [f.path, (await api.ws.stat(f.path).catch(() => null))?.size ?? null] as const)).then((r) => {
      if (!off) setSizes(Object.fromEntries(r))
    })
    return () => void (off = true)
  }, [files, tick])
  if (!files.length) return null
  return (
    <div className="fcards">
      {files.map((f) => (
        <div
          key={f.path}
          className={`fcard ${sizes[f.path] === null ? 'gone' : ''}`}
          title={`Open ${f.path} in the Editor`}
          onClick={() => void openFile(f.path).catch(() => toast('That file is not in the folder any more.'))}
        >
          <span className="kind">{fileKind(f.name)}</span>
          <span className="fmain">
            <b>{f.name}</b>
            <small>{f.path}</small>
          </span>
          <span className="fmeta">
            <small>{f.created ? 'created' : 'changed'}</small>
            <small>{sizes[f.path] != null ? fileSize(sizes[f.path]!) : sizes[f.path] === null ? 'removed' : ''}</small>
          </span>
          <button
            className="ibtn"
            title="See the changes in the Diff panel"
            onClick={(e) => {
              e.stopPropagation()
              openPanel('diff')
            }}
          >
            <Icon d={ICON.diff} size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------- pull requests

function PrCard({ pr }: { pr: PR }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [diff, setDiff] = useState('')
  useEffect(() => {
    if (!open || diff) return
    api.git
      .diff(pr.id)
      .then((d) => setDiff(d || 'No changes.'))
      .catch(() => setDiff('The diff is gone (the commits were removed).'))
  }, [open, pr.id, diff])
  const added = pr.files.reduce((n, f) => n + f.added, 0)
  const removed = pr.files.reduce((n, f) => n + f.removed, 0)
  return (
    <div className={`prcard ${pr.status} ${open ? 'open' : ''}`}>
      <div className="prrow" onClick={() => setOpen(!open)} title={open ? 'Fold' : 'Show the files and the diff'}>
        <Icon d={open ? ICON.collapse : ICON.expand} size={12} />
        <span className="prnum">PR #{pr.id}</span>
        <span className="prtitle">{pr.title}</span>
        <span className="prstat">
          {pr.files.length} file{pr.files.length === 1 ? '' : 's'}
          <i className="add">+{added}</i>
          <i className="del">−{removed}</i>
        </span>
        {pr.status === 'open' ? (
          <span className="row" onClick={(e) => e.stopPropagation()}>
            <button className="btn primary sm" onClick={() => void decidePr(pr, true)}>
              Merge
            </button>
            <button className="btn danger sm" onClick={() => void decidePr(pr, false)}>
              Reject
            </button>
          </span>
        ) : (
          <span className={`badge ${pr.status}`}>{pr.status}</span>
        )}
      </div>
      {open && (
        <div className="prbody">
          <small className="dim">
            {pr.branch} → {pr.base}
          </small>
          <div className="pr-files">
            {pr.files.map((f) => (
              <button key={f.path} onClick={() => void openFile(f.path).catch(() => toast('That file is not in the folder right now.'))}>
                {f.path}
                <i className="add">+{f.added}</i>
                <i className="del">−{f.removed}</i>
              </button>
            ))}
          </div>
          {pr.url && (
            <button className="link" onClick={() => browse(pr.url!)}>
              {pr.url}
            </button>
          )}
          <pre className="diff" dangerouslySetInnerHTML={{ __html: diff ? diffHtml(diff) : '…' }} />
        </div>
      )}
    </div>
  )
}

// ----------------------------------------------------------------- bubble

function Bubble({ m, room, bot }: { m: Msg; room: string; bot?: Bot }): JSX.Element {
  const status = useStore((s) => (bot ? s.status[bot.id] : undefined))
  if (m.role === 'note') return <div className="note">{m.text}</div>
  if (m.role === 'user') {
    return (
      <div className="msg me">
        {m.attachments?.length ? <AttachmentChips list={m.attachments} /> : null}
        {m.text && <div className="bubble">{m.text.replace(/\n\nAttached files, copied into the working folder:\n(- .*\n?)+$/, '')}</div>}
      </div>
    )
  }
  const speaking = status === 'speaking'
  return (
    <div className={`msg bot-msg ${m.streaming ? 'live' : ''}`}>
      <div className={`face ${speaking ? 'speaking' : ''}`}>
        {bot && <Cat look={bot.look} size={42} speaking={speaking && !m.streaming} busy={m.streaming} />}
      </div>
      <div className="body">
        <div className="who">
          {bot?.name ?? 'Bot'}
          {m.turn ? <span className="turn">turn {m.turn}</span> : null}
          {m.streaming && (
            <span className="typing">
              <i />
              <i />
              <i />
            </span>
          )}
        </div>
        {m.tools.length > 0 && <ToolGroup tools={m.tools} live={m.streaming} />}
        {m.text && <Markdown text={m.text} live={m.streaming} />}
        {!m.streaming && <FileCards tools={m.tools} />}
        {m.asks.map((a) => (
          <div key={a.id} className={`ask ${a.answer ?? 'open'}`}>
            <div className="ask-head">
              {bot?.name ?? 'The bot'} wants to use <b>{a.tool.replace(/^mcp__/, '').replace(/__/g, ' › ')}</b>
            </div>
            {a.detail && <pre>{a.detail}</pre>}
            {a.reason && <small>{a.reason}</small>}
            {a.answer ? (
              <div className="ask-done">{a.answer === 'deny' ? 'You said no' : a.answer === 'always' ? 'Always allowed' : 'Allowed'}</div>
            ) : (
              <div className="row">
                <button className="btn primary" onClick={() => answer(room, m.id, a.id, 'allow')}>
                  Allow
                </button>
                {a.canAlways && (
                  <button className="btn" onClick={() => answer(room, m.id, a.id, 'always')}>
                    Always allow
                  </button>
                )}
                <button className="btn danger" onClick={() => answer(room, m.id, a.id, 'deny')}>
                  No
                </button>
              </div>
            )}
          </div>
        ))}
        {m.pr && <PrCard pr={m.pr} />}
        {m.error && <div className="err">{m.error}</div>}
      </div>
    </div>
  )
}

// ------------------------------------------------------------ turn strip

/** Who is up, who is waiting, and how each turn's pull request went. */
function Stage(): JSX.Element | null {
  const swarm = useStore((s) => s.swarm)
  const bots = useStore((s) => s.bots)
  const status = useStore((s) => s.status)
  const msgs = useStore((s) => s.msgs.crew)
  const crew = swarm?.running ? swarm.order.map((id) => bots.find((b) => b.id === id)!).filter(Boolean) : bots.filter((b) => b.inCrew)
  if (!crew.length) return null
  const turns = swarm ? (msgs ?? []).slice(swarm.from).filter((m) => m.role === 'bot' && m.turn) : []
  return (
    <div className="stage">
      <div className="queue">
        {crew.map((b, i) => {
          const st = status[b.id] ?? 'idle'
          const up = swarm?.running && swarm.order[swarm.current] === b.id
          return (
            <div key={b.id} className={`seat ${st} ${up ? 'up' : ''}`} title={`${b.name}: ${st}`}>
              <Cat look={b.look} size={26} speaking={st === 'speaking'} busy={st === 'thinking'} />
              <span>{b.name}</span>
              {i < crew.length - 1 && <em>→</em>}
            </div>
          )
        })}
        {swarm?.running && (
          <span className="stage-info">
            {swarm.git ? 'Swarm' : 'Round-table'} · round {swarm.round}/{swarm.rounds} · turn {swarm.turn}
          </span>
        )}
      </div>
      {turns.length > 0 && (
        <div className="turnstrip">
          {turns.map((m) => {
            const b = bots.find((x) => x.id === m.botId)
            const st = m.streaming ? 'working' : m.pr ? m.pr.status : swarm?.git ? 'no changes' : 'said'
            return (
              <button
                key={m.id}
                className={`tchip ${st.replace(' ', '-')}`}
                title={m.pr ? `PR #${m.pr.id}: ${m.pr.title}` : undefined}
                onClick={() => document.getElementById(`msg-${m.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              >
                <b>{m.turn}</b> {b?.name ?? 'Bot'} <small>{m.pr ? `#${m.pr.id} ${st}` : st}</small>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// --------------------------------------------------------------- composer

const MODES: { value: PermissionMode; label: string; hint: string }[] = [
  { value: 'default', label: 'Ask me', hint: 'Bots ask before they change or run anything' },
  { value: 'acceptEdits', label: 'Edit freely', hint: 'Bots edit files freely and ask before running commands' },
  { value: 'auto', label: 'Auto', hint: 'Claude decides what is safe and asks when unsure' },
  { value: 'plan', label: 'Plan only', hint: 'Bots plan and change nothing' },
  { value: 'bypassPermissions', label: 'Never ask', hint: 'Bots never ask. Only for folders you can afford to lose.' }
]

/** A model's label cut to fit a chip: "Default (recommended)" → "Default". */
export const shortModel = (label: string): string => label.replace(/\s*\(.*\)\s*$/, '').replace(/^Claude\s+/i, '').trim() || label

/** A chip with a native select laid over it, so it stays small. */
function SelectChip<T extends string | number>({
  icon,
  value,
  options,
  onPick,
  title,
  warn
}: {
  icon?: string
  value: T
  options: { value: T; label: string }[]
  onPick: (v: T) => void
  title: string
  warn?: boolean
}): JSX.Element {
  const cur = options.find((o) => o.value === value) ?? options[0]
  return (
    <label className={`ctl sel ${warn ? 'warn' : ''}`} title={title}>
      {icon && <Icon d={icon} size={12} />}
      <span>{cur?.label ?? String(value)}</span>
      <span className="dim">▾</span>
      <select value={value} onChange={(e) => onPick((typeof value === 'number' ? Number(e.target.value) : e.target.value) as T)}>
        {options.map((o) => (
          <option key={String(o.value)} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function Composer({ hero, room }: { hero: boolean; room: string }): JSX.Element {
  const bots = useStore((s) => s.bots)
  const busy = useStore((s) => !!s.busy[room])
  const anySpeaking = useStore((s) => Object.values(s.status).includes('speaking'))
  const settings = useStore((s) => s.settings)
  const models = useStore((s) => s.probe?.models)
  const listening = useStore((s) => s.listening)
  const hearing = useStore((s) => s.hearing)
  const pending = useStore((s) => s.pending[room]) ?? []
  const [text, setText] = useState('')
  const [narrow, setNarrow] = useState(false)
  const [more, setMore] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const bot = bots.find((b) => b.id === room)

  useEffect(() => {
    ref.current?.focus()
  }, [room])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth < (room === 'crew' ? 460 : 380)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [room])

  // The textarea grows with what is typed, up to a few lines.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  const go = (): void => {
    if (!text.trim() && !pending.length) return
    send(text, room, pending.length ? { attachments: pending.map((p) => p.att), images: pending.flatMap((p) => (p.image ? [p.image] : [])) } : undefined)
    setText('')
    setPending(room, [])
  }

  const placeholder = hearing
    ? 'Got it, writing that down…'
    : listening
      ? 'Listening… just talk'
      : room === 'crew'
        ? settings.swarm
          ? 'Give the crew a task…'
          : 'Ask the crew anything…'
        : `Talk to ${bot?.name ?? 'your bot'}…`

  const modelOpts = (models ?? [{ value: '', label: 'Default' }]).map((m) => ({ value: m.value, label: shortModel(m.label) }))
  const modelChip = (
    <SelectChip title="The model bots use unless a bot has its own" value={settings.defaultModel} options={modelOpts} onPick={(v) => void setSettings({ defaultModel: v })} />
  )
  const permChip = (
    <SelectChip
      title={MODES.find((m) => m.value === settings.permissionMode)?.hint ?? 'Permissions'}
      warn={settings.permissionMode === 'bypassPermissions'}
      value={settings.permissionMode}
      options={MODES}
      onPick={(v) => void setSettings({ permissionMode: v })}
    />
  )
  const roundsChip =
    room === 'crew' && settings.swarm ? (
      <SelectChip
        title="How many times around the crew"
        value={settings.rounds}
        options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n} round${n === 1 ? '' : 's'}` }))}
        onPick={(v) => void setSettings({ rounds: v })}
      />
    ) : null

  return (
    <div className={hero ? 'composer hero' : 'composer'} ref={box}>
      {pending.length > 0 && <AttachmentChips list={pending.map((p) => p.att)} onRemove={(i) => setPending(room, pending.filter((_, k) => k !== i))} />}
      <div className={`inputbar ${listening ? 'listening' : ''}`}>
        <button className="attach" title="Attach files (or drop them on the chat, or paste)" onClick={() => picker.current?.click()}>
          <Icon d={ICON.plus} size={18} />
        </button>
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) void attachFiles(room, e.target.files)
            e.target.value = ''
          }}
        />
        <textarea
          ref={ref}
          rows={1}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files)
            if (files.length) {
              e.preventDefault()
              void attachFiles(room, files)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              go()
            }
          }}
        />
        <button className={`orb ${listening ? 'on' : ''} ${hearing ? 'hearing' : ''}`} title={listening ? 'Stop listening' : 'Talk'} onClick={() => toggleMic(room)}>
          <span className="orb-core" />
          <Reactor size={44} />
          <Icon d={ICON.mic} size={17} />
        </button>
        {busy || anySpeaking ? (
          <button
            className="send stop"
            title="Stop"
            onClick={() => {
              if (busy) stop()
              else stopSpeaking()
            }}
          >
            ■
          </button>
        ) : (
          <button className="send" title="Send" onClick={go} disabled={!text.trim() && !pending.length}>
            ↑
          </button>
        )}
      </div>

      <div className="controls">
        <button
          className={settings.autoVoice ? 'ctl ic on' : 'ctl ic'}
          title={settings.autoVoice ? 'Hands-free is on: the mic opens again after every answer' : 'Hands-free: the mic opens again after every answer'}
          onClick={() => {
            const on = !settings.autoVoice
            void setSettings({ autoVoice: on })
            if (on && !get().listening) toggleMic(room)
          }}
        >
          <Icon d={ICON.mic} size={13} />
          <i className="led" />
        </button>
        <button
          className={settings.muted ? 'ctl ic' : 'ctl ic on'}
          title={settings.muted ? 'Voices are off' : 'Bots talk out loud'}
          onClick={() => {
            if (!settings.muted) stopSpeaking()
            void setSettings({ muted: !settings.muted })
          }}
        >
          <Icon d={settings.muted ? ICON.mute : ICON.speaker} size={13} />
        </button>
        {room === 'crew' && (
          <button
            className={settings.swarm ? 'ctl on hot' : 'ctl'}
            title="Swarm: the crew builds it in turns, one git branch and pull request per turn. Off: they just talk it over."
            onClick={() => void setSettings({ swarm: !settings.swarm })}
          >
            <i className="led" /> Swarm
          </button>
        )}
        {narrow ? (
          <div className="ctlmore">
            <button className={`ctl ic ${more ? 'on' : ''}`} title="Model, permissions and rounds" onClick={() => setMore(!more)}>
              <Icon d={ICON.more} size={14} />
            </button>
            {more && (
              <div className="menu up" onMouseLeave={() => setMore(false)}>
                {roundsChip}
                {modelChip}
                {permChip}
              </div>
            )}
          </div>
        ) : (
          <>
            {roundsChip}
            {modelChip}
            {permChip}
          </>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------- chat

const IDEAS = ['Build a one-page site for a product launch', 'Make a tiny browser game with a high score', 'Plan and write a study guide for my next test']

/** One chat. `room` is fixed for a bot's own panel; the main chat follows the store's room. */
export function Chat({ room: fixed }: { room?: string }): JSX.Element {
  const storeRoom = useStore((s) => s.room)
  const room = fixed ?? storeRoom
  const bots = useStore((s) => s.bots)
  const msgs = useStore((s) => s.msgs[room]) ?? []
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [dropping, setDropping] = useState(false)
  const bot = bots.find((b) => b.id === room)
  const hero = msgs.length === 0

  // Follow the reply as it streams, unless the person scrolled up to read.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [msgs])
  useEffect(() => {
    stick.current = true
  }, [room])

  if (room !== 'crew' && !bot) {
    return (
      <section className="center">
        <div className="empty">
          <b>Bot gone</b>
          <p>This bot was deleted. Close the panel or pick another one.</p>
        </div>
      </section>
    )
  }

  const drop = {
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return
      e.preventDefault()
      if (!dropping) setDropping(true)
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false)
    },
    onDrop: (e: React.DragEvent) => {
      setDropping(false)
      if (!e.dataTransfer.files.length) return
      e.preventDefault()
      void attachFiles(room, e.dataTransfer.files)
    }
  }

  return (
    <section className={`center ${dropping ? 'dropping' : ''}`} {...drop}>
      {dropping && <div className="dropnote">Drop to attach</div>}
      <div className="room-head">
        {room === 'crew' ? (
          <Stage />
        ) : (
          bot && (
            <div className="solo">
              <b>{bot.name}</b>
              <span>{bot.pronouns}</span>
              <small>{bot.task}</small>
            </div>
          )
        )}
      </div>

      {hero ? (
        <div className="hero-wrap">
          <Reactor size={600} className="backdrop" />
          {room === 'crew' ? (
            <div className="hero-crew">
              {bots
                .filter((b) => b.inCrew)
                .map((b, i) => (
                  <span key={b.id} style={{ animationDelay: `${i * 0.25}s` }}>
                    <Cat look={b.look} size={104} mode="full" />
                  </span>
                ))}
            </div>
          ) : (
            bot && (
              <div className="hero-crew solo-hero">
                <span>
                  <Cat look={bot.look} size={140} mode="full" />
                </span>
              </div>
            )
          )}
          <div className="floor" />
          <h1 className="headline">{room === 'crew' ? 'What are we making?' : `This is ${bot?.name}.`}</h1>
          <p className="sub">{room === 'crew' ? 'Say it or type it. The crew takes turns, out loud.' : bot?.tagline}</p>
          {room === 'crew' && (
            <div className="ideas">
              {IDEAS.map((t) => (
                <button key={t} onClick={() => send(t, 'crew')}>
                  {t}
                </button>
              ))}
            </div>
          )}
          <Composer hero room={room} />
        </div>
      ) : (
        <>
          <div
            className="chat"
            ref={scroller}
            onScroll={(e) => {
              const el = e.currentTarget
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
            }}
          >
            {msgs.map((m) => (
              <div key={m.id} id={`msg-${m.id}`}>
                <Bubble m={m} room={room} bot={bots.find((b) => b.id === m.botId)} />
              </div>
            ))}
          </div>
          <Composer hero={false} room={room} />
        </>
      )}
    </section>
  )
}
