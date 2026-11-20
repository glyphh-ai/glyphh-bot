// The folder the bots work in, and the git turns they take in it: one branch
// and one pull request per turn.
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, relative } from 'node:path'
import { shell } from 'electron'
import type { FileEntry, FileSearch, PR, PRFile, TreeNode, Workspace } from '../shared/types'
import { env } from './claude'
import * as files from './files'
import { inside } from './files'
import { load, update } from './store'

/** Projects live in ~/Glyphh Bot (GLYPHH_BOT_HOME moves them; the screenshot runs use a scratch folder). */
const HOME = process.env.GLYPHH_BOT_HOME || join(homedir(), 'Glyphh Bot')
const SKIP = new Set(['node_modules', '.git', 'out', 'dist', '.DS_Store', '__pycache__', '.venv'])

function sh(cmd: string, args: string[], cwd: string): Promise<string> {
  return new Promise((ok, fail) => {
    execFile(cmd, args, { cwd, env: env(), maxBuffer: 16 * 1024 * 1024 }, (err, out, errOut) => {
      if (err) fail(new Error((errOut || out || err.message).trim()))
      else ok(out.trim())
    })
  })
}

const git = (cwd: string, ...args: string[]): Promise<string> => sh('git', args, cwd)

async function ensureRepo(dir: string): Promise<void> {
  mkdirSync(dir, { recursive: true })
  if (existsSync(join(dir, '.git'))) return
  await git(dir, 'init', '-b', 'main')
  if (!existsSync(join(dir, 'README.md'))) {
    writeFileSync(join(dir, 'README.md'), `# ${basename(dir)}\n\nBuilt by the Glyphh Bot crew.\n`)
  }
  await git(dir, 'add', '-A')
  await git(
    dir,
    '-c',
    'user.name=Glyphh Bot',
    '-c',
    'user.email=bot@glyphhbot.local',
    'commit',
    '-m',
    'Start the workspace'
  )
}

export async function current(): Promise<Workspace> {
  let path = load().workspace
  if (!path || !existsSync(path)) {
    path = join(HOME, 'playground')
    await ensureRepo(path)
    update((d) => (d.workspace = path))
  }
  return { path, name: basename(path) }
}

export async function create(name: string): Promise<Workspace> {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'project'
  let path = join(HOME, slug)
  for (let i = 2; existsSync(path); i++) path = join(HOME, `${slug}-${i}`)
  await ensureRepo(path)
  update((d) => (d.workspace = path))
  return { path, name: basename(path) }
}

export async function use(path: string): Promise<Workspace> {
  await ensureRepo(path)
  update((d) => (d.workspace = path))
  return { path, name: basename(path) }
}

function walk(root: string, dir: string, depth: number, budget: { n: number }): TreeNode[] {
  if (depth > 6) return []
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  const nodes: TreeNode[] = []
  for (const name of names.sort((a, b) => a.localeCompare(b))) {
    if (SKIP.has(name) || budget.n <= 0) continue
    budget.n--
    const full = join(dir, name)
    let isDir = false
    try {
      isDir = statSync(full).isDirectory()
    } catch {
      continue
    }
    nodes.push({
      name,
      path: relative(root, full),
      dir: isDir,
      ...(isDir ? { children: walk(root, full, depth + 1, budget) } : {})
    })
  }
  return nodes.sort((a, b) => Number(b.dir) - Number(a.dir))
}

export async function tree(): Promise<TreeNode[]> {
  const { path } = await current()
  return walk(path, path, 0, { n: 1500 })
}

export async function read(p: string): Promise<string> {
  const { path } = await current()
  const full = inside(path, p)
  if (statSync(full).size > 2 * 1024 * 1024) return '// This file is too big to open here.'
  return readFileSync(full, 'utf8')
}

export async function write(p: string, content: string): Promise<void> {
  const { path } = await current()
  const full = inside(path, p)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
}

// ---------------------------------------------------- the Files panel

export async function list(dir: string): Promise<FileEntry[]> {
  return files.listDir((await current()).path, dir)
}

export async function search(q: string): Promise<FileSearch> {
  return files.searchFiles((await current()).path, q)
}

export async function mkdir(p: string): Promise<void> {
  await files.makeDir((await current()).path, p)
}

export async function rename(from: string, to: string): Promise<void> {
  await files.renamePath((await current()).path, from, to)
}

/** A file the person attached to a message, copied into the folder's attachments/ so every bot can read it. Returns its path. */
export async function attach(name: string, bytes: Uint8Array): Promise<string> {
  const { path } = await current()
  const rel = files.attachmentPath(name, (p) => existsSync(join(path, p)))
  const full = inside(path, rel)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, Buffer.from(bytes))
  return rel
}

/** A file's size, or null when it is not there. */
export async function stat(p: string): Promise<{ size: number; dir: boolean } | null> {
  try {
    const s = statSync(inside((await current()).path, p))
    return { size: s.size, dir: s.isDirectory() }
  } catch {
    return null
  }
}

export async function exists(p: string): Promise<boolean> {
  return existsSync(inside((await current()).path, p))
}

/** Delete moves to the Trash, never a hard unlink. */
export async function trash(p: string): Promise<void> {
  const { path } = await current()
  const full = inside(path, p)
  if (full === path) throw new Error('The workspace itself cannot be deleted here')
  await shell.trashItem(full)
}

export async function workingDiff(): Promise<{ text: string; error?: string }> {
  return files.workingDiff((await current()).path, env())
}

// ------------------------------------------------------------ git turns

function prFile(cwd: string): string {
  return join(cwd, '.git', 'glyphh-bot-prs.json')
}

function readPrs(cwd: string): PR[] {
  try {
    return JSON.parse(readFileSync(prFile(cwd), 'utf8'))
  } catch {
    return []
  }
}

function writePrs(cwd: string, prs: PR[]): void {
  writeFileSync(prFile(cwd), JSON.stringify(prs, null, 2))
}

export async function prs(): Promise<PR[]> {
  return readPrs((await current()).path)
}

export async function branch(): Promise<string> {
  const { path } = await current()
  return git(path, 'rev-parse', '--abbrev-ref', 'HEAD').catch(() => '')
}

function turnFile(cwd: string): string {
  return join(cwd, '.git', 'glyphh-bot-turn.json')
}

/**
 * A turn cut short (the app quit, a crash) leaves the folder on that turn's
 * branch. Its work is kept as a commit on the branch, and the folder goes back
 * to where the turn started.
 */
export async function recover(): Promise<void> {
  const { path } = await current()
  let turn: { branch: string; base: string }
  try {
    turn = JSON.parse(readFileSync(turnFile(path), 'utf8'))
  } catch {
    return
  }
  rmSync(turnFile(path), { force: true })
  const here = await git(path, 'rev-parse', '--abbrev-ref', 'HEAD').catch(() => '')
  if (here !== turn.branch) return
  await git(path, 'add', '-A')
  await git(
    path,
    '-c',
    'user.name=Glyphh Bot',
    '-c',
    'user.email=bot@glyphhbot.local',
    'commit',
    '-m',
    'Unfinished turn'
  ).catch(() => undefined)
  await git(path, 'checkout', turn.base)
}

/** A bot's turn starts on a fresh branch off wherever the workspace is. */
export async function beginTurn(name: string): Promise<{ base: string; baseSha: string }> {
  await recover()
  const { path } = await current()
  const base = await git(path, 'rev-parse', '--abbrev-ref', 'HEAD')
  const baseSha = await git(path, 'rev-parse', 'HEAD')
  await git(path, 'checkout', '-b', name)
  writeFileSync(turnFile(path), JSON.stringify({ branch: name, base }))
  return { base, baseSha }
}

/** A bot's turn ends as a commit and a pull request, or as nothing when it changed nothing. */
export async function endTurn(p: {
  branch: string
  base: string
  baseSha: string
  botId: string
  botName: string
  title: string
  body: string
}): Promise<PR | null> {
  const { path } = await current()
  const { settings } = load()
  rmSync(turnFile(path), { force: true })
  // The bot may have wandered to another branch; its turn is the branch it was given.
  const here = await git(path, 'rev-parse', '--abbrev-ref', 'HEAD')
  if (here !== p.branch) await git(path, 'checkout', p.branch).catch(() => undefined)

  await git(path, 'add', '-A')
  const dirty = await git(path, 'diff', '--cached', '--quiet').then(
    () => false,
    () => true
  )
  if (dirty) {
    await git(
      path,
      '-c',
      `user.name=${p.botName}`,
      '-c',
      `user.email=${p.botId}@glyphhbot.local`,
      'commit',
      '-m',
      p.title
    )
  }
  const ahead = Number(await git(path, 'rev-list', '--count', `${p.baseSha}..HEAD`))
  if (!ahead) {
    await git(path, 'checkout', p.base)
    await git(path, 'branch', '-D', p.branch).catch(() => undefined)
    return null
  }
  const headSha = await git(path, 'rev-parse', 'HEAD')
  const stat = await git(path, 'diff', '--numstat', p.baseSha, headSha)
  const files: PRFile[] = stat
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [a, r, f] = l.split('\t')
      return { path: f, added: Number(a) || 0, removed: Number(r) || 0 }
    })
  const all = readPrs(path)
  const pr: PR = {
    id: (all.at(-1)?.id ?? 0) + 1,
    branch: p.branch,
    base: p.base,
    baseSha: p.baseSha,
    headSha,
    title: p.title,
    body: p.body,
    botId: p.botId,
    botName: p.botName,
    status: 'open',
    files,
    createdAt: Date.now()
  }
  if (settings.pushPRs) {
    try {
      await git(path, 'remote', 'get-url', 'origin')
      await git(path, 'push', '-u', 'origin', p.branch)
      pr.url = await sh(
        'gh',
        ['pr', 'create', '--base', p.base, '--head', p.branch, '--title', p.title, '--body', p.body],
        path
      )
    } catch (e) {
      pr.body += `\n\n(Not pushed to GitHub: ${(e as Error).message.split('\n')[0]})`
    }
  }
  await git(path, 'checkout', p.base)
  writePrs(path, [...all, pr])
  return settings.autoMergePRs ? merge(pr.id) : pr
}

function setStatus(cwd: string, id: number, status: PR['status']): PR {
  const all = readPrs(cwd)
  const pr = all.find((x) => x.id === id)
  if (!pr) throw new Error(`No pull request #${id}`)
  pr.status = status
  writePrs(cwd, all)
  return pr
}

export async function merge(id: number): Promise<PR> {
  const { path } = await current()
  const pr = readPrs(path).find((x) => x.id === id)
  if (!pr) throw new Error(`No pull request #${id}`)
  await git(path, 'checkout', pr.base)
  try {
    if (pr.url) {
      await sh('gh', ['pr', 'merge', pr.url, '--merge'], path)
      await git(path, 'pull', '--ff-only')
    } else {
      await git(
        path,
        '-c',
        'user.name=Glyphh Bot',
        '-c',
        'user.email=bot@glyphhbot.local',
        'merge',
        '--no-ff',
        pr.branch,
        '-m',
        `Merge PR #${pr.id}: ${pr.title}`
      )
    }
  } catch {
    await git(path, 'merge', '--abort').catch(() => undefined)
    return setStatus(path, id, 'conflict')
  }
  await git(path, 'branch', '-D', pr.branch).catch(() => undefined)
  return setStatus(path, id, 'merged')
}

export async function reject(id: number): Promise<PR> {
  const { path } = await current()
  const pr = readPrs(path).find((x) => x.id === id)
  if (!pr) throw new Error(`No pull request #${id}`)
  if (pr.url) await sh('gh', ['pr', 'close', pr.url], path).catch(() => undefined)
  await git(path, 'checkout', pr.base).catch(() => undefined)
  await git(path, 'branch', '-D', pr.branch).catch(() => undefined)
  return setStatus(path, id, 'rejected')
}

export async function diff(id: number): Promise<string> {
  const { path } = await current()
  const pr = readPrs(path).find((x) => x.id === id)
  if (!pr) return ''
  return git(path, 'diff', pr.baseSha, pr.headSha)
}
