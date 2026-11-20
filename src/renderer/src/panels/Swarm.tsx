// The Swarm panel: the task, whose turn
// it is, and every bot's pull request with its files and its diff.
import { useEffect, useState } from 'react'
import type { PR } from '../../../shared/types'
import { Cat } from '../Cat'
import { decidePr } from '../engine'
import { api, openFile, toast, useStore } from '../store'

function PrDiff({ pr }: { pr: PR }): JSX.Element {
  const [text, setText] = useState('…')
  useEffect(() => {
    api.git
      .diff(pr.id)
      .then(setText)
      .catch(() => setText('The diff is gone (the commits were removed).'))
  }, [pr.id])
  return (
    <pre className="diff">
      {text.split('\n').map((l, i) => (
        <div
          key={i}
          className={
            l.startsWith('+++') || l.startsWith('---') || l.startsWith('diff ')
              ? 'h'
              : l.startsWith('@@')
                ? 'at'
                : l.startsWith('+')
                  ? 'a'
                  : l.startsWith('-')
                    ? 'd'
                    : ''
          }
        >
          {l || ' '}
        </div>
      ))}
    </pre>
  )
}

export function SwarmPanel(): JSX.Element {
  const swarm = useStore((s) => s.swarm)
  const prs = useStore((s) => s.prs)
  const bots = useStore((s) => s.bots)
  const status = useStore((s) => s.status)
  const [open, setOpen] = useState<number | null>(null)
  const order = swarm ? swarm.order.map((id) => bots.find((b) => b.id === id)).filter(Boolean) : []

  return (
    <div className="pane scroll">
      {swarm ? (
        <div className="card task">
          <div className="rail-label">
            {swarm.git ? 'Swarm task' : 'Round-table'}
            <span className={swarm.running ? 'badge open' : 'badge merged'}>
              {swarm.running ? `round ${swarm.round}/${swarm.rounds}` : 'finished'}
            </span>
          </div>
          <p>{swarm.task}</p>
          <div className="turns">
            {order.map((b, i) => {
              const st = status[b!.id] ?? 'idle'
              return (
                <div key={b!.id} className={`turnrow ${st}`}>
                  <span className="ava sm">
                    <Cat look={b!.look} size={28} busy={st === 'thinking'} speaking={st === 'speaking'} />
                  </span>
                  <b>{b!.name}</b>
                  <small>
                    {st === 'thinking'
                      ? 'working on a branch'
                      : st === 'speaking'
                        ? 'talking'
                        : st === 'waiting'
                          ? i === swarm.current
                            ? 'waiting on review'
                            : 'waiting for a turn'
                          : ''}
                  </small>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="empty">
          <b>No swarm yet</b>
          <p>Give the crew a task in the chat with Swarm on. Each bot takes a turn on its own git branch and opens a pull request you can read here.</p>
        </div>
      )}

      {prs.length > 0 && <div className="rail-label">Pull requests</div>}
      {[...prs].reverse().map((pr) => {
        const bot = bots.find((b) => b.id === pr.botId)
        return (
          <div key={pr.id} className={`pr ${pr.status}`}>
            <div className="pr-head" onClick={() => setOpen(open === pr.id ? null : pr.id)}>
              {bot && (
                <span className="ava sm">
                  <Cat look={bot.look} size={26} />
                </span>
              )}
              <div className="pr-main">
                <b>
                  #{pr.id} {pr.title}
                </b>
                <small>
                  {pr.branch} → {pr.base}
                </small>
              </div>
              <span className={`badge ${pr.status}`}>{pr.status}</span>
            </div>
            <div className="pr-files">
              {pr.files.map((f) => (
                <button key={f.path} onClick={() => void openFile(f.path).catch(() => toast('That file is not in the folder right now.'))}>
                  {f.path}
                  <i className="add">+{f.added}</i>
                  <i className="del">−{f.removed}</i>
                </button>
              ))}
            </div>
            {pr.status === 'open' && (
              <div className="row pad">
                <button className="btn primary" onClick={() => void decidePr(pr, true)}>
                  Merge
                </button>
                <button className="btn danger" onClick={() => void decidePr(pr, false)}>
                  Reject
                </button>
              </div>
            )}
            {pr.url && (
              <button className="link pad" onClick={() => void api.openExternal(pr.url!)}>
                {pr.url}
              </button>
            )}
            {open === pr.id && (
              <>
                <p className="pr-body">{pr.body}</p>
                <PrDiff pr={pr} />
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
