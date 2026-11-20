// The Files and Diff panels' disk side, ported from the Glyphh desktop
// (glyphh/app src/main/working-directory.ts: listWorkdirDir,
// searchWorkdirFiles, renameWorkdirPath, gitDiffWorkdir). Every path the
// renderer sends is relative to the workspace and checked to stay inside it.
// No Electron here, so the tests can run it on a scratch folder.
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readdir, rename } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import type { FileEntry, FileSearch } from '../shared/types'

/** A path inside the workspace, or an error: the panels stay in the folder. */
export function inside(root: string, p: string): string {
  const full = resolve(root, p || '.')
  if (full !== root && !full.startsWith(root + sep)) throw new Error('Outside the workspace')
  return full
}

/** One folder's children, folders first. Dotfiles show; .git and node_modules don't. */
export async function listDir(root: string, dir: string): Promise<FileEntry[]> {
  const full = inside(root, dir)
  const items = await readdir(full, { withFileTypes: true })
  return items
    .filter((d) => d.name !== '.git' && d.name !== 'node_modules' && d.name !== '.DS_Store')
    .map((d) => ({ name: d.name, path: relative(root, join(full, d.name)), dir: d.isDirectory() }))
    .sort((a, b) => (a.dir !== b.dir ? (a.dir ? -1 : 1) : a.name.localeCompare(b.name)))
}

const SKIP = new Set(['.git', 'node_modules', 'dist', 'build', 'out', '.next', 'coverage', 'vendor', '__pycache__', '.venv', 'target'])

/**
 * Search the whole folder by name, not just the rows on screen: a
 * case-insensitive substring of the entry's name, heavy folders skipped,
 * capped so a giant repo can't stall the panel. Shallow matches first.
 */
export async function searchFiles(root: string, query: string, maxResults = 200, maxDirs = 4000): Promise<FileSearch> {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return { entries: [] }
  const entries: FileEntry[] = []
  const stack = [root]
  let visited = 0
  while (stack.length && entries.length < maxResults && visited < maxDirs) {
    const dir = stack.pop()!
    visited++
    let items: { name: string; isDirectory(): boolean }[] = []
    try {
      items = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const d of items) {
      if (SKIP.has(d.name)) continue
      const abs = join(dir, d.name)
      const isDir = d.isDirectory()
      if (d.name.toLowerCase().includes(q)) {
        entries.push({ name: d.name, path: relative(root, abs), dir: isDir })
        if (entries.length >= maxResults) break
      }
      if (isDir) stack.push(abs)
    }
  }
  entries.sort((a, b) => {
    const da = a.path.split(sep).length
    const db = b.path.split(sep).length
    return da !== db ? da - db : a.path.localeCompare(b.path)
  })
  return { entries, truncated: entries.length >= maxResults }
}

export async function makeDir(root: string, p: string): Promise<void> {
  const full = inside(root, p)
  if (existsSync(full)) throw new Error(`${p} already exists`)
  await mkdir(full, { recursive: true })
}

/** Rename or move inside the folder; never over something that is there. */
export async function renamePath(root: string, from: string, to: string): Promise<void> {
  const a = inside(root, from)
  const b = inside(root, to)
  if (a === root) throw new Error('The workspace itself cannot be renamed here')
  if (existsSync(b)) throw new Error(`${to} already exists`)
  await rename(a, b)
}

function git(cwd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<{ out: string; code: number; err: string }> {
  return new Promise((ok) => {
    execFile('git', args, { cwd, env, maxBuffer: 16 * 1024 * 1024 }, (e, out, errOut) => {
      ok({ out, err: errOut, code: e ? ((e as { code?: number }).code ?? 1) : 0 })
    })
  })
}

/**
 * The working tree against HEAD: staged, unstaged and untracked (git diff
 * never shows untracked files, which is what bots make all day, so each one is
 * diffed against /dev/null). A folder without commits shows its changes too.
 */
export async function workingDiff(root: string, env?: NodeJS.ProcessEnv): Promise<{ text: string; error?: string }> {
  const probe = await git(root, ['rev-parse', '--is-inside-work-tree'], env)
  if (probe.code !== 0 || probe.out.trim() !== 'true') return { text: '', error: 'not a git repo' }
  let tracked = await git(root, ['diff', 'HEAD'], env)
  if (tracked.code !== 0) {
    if (!/unknown revision|ambiguous argument 'HEAD'|bad revision/i.test(tracked.err)) {
      return { text: '', error: tracked.err.split('\n')[0] || 'git error' }
    }
    tracked = await git(root, ['diff'], env)
  }
  const list = await git(root, ['ls-files', '--others', '--exclude-standard'], env)
  let untracked = ''
  for (const f of list.out.split('\n').filter(Boolean).slice(0, 200)) {
    const d = await git(root, ['diff', '--no-index', '--', '/dev/null', f], env)
    untracked += d.out
  }
  return { text: tracked.out + untracked }
}
