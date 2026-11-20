import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inside, listDir, makeDir, renamePath, searchFiles, workingDiff } from '../src/main/files'
import { ACCESSORIES, EXTRAS, EYES, HEADS, POSES, TAILS, normalizeLook } from '../src/shared/types'
import { parseUnifiedDiff } from '../src/shared/diff'
import { toUrl } from '../src/shared/url'
import { catMarkup, coloursIn, INK, PART_NAMES, WHITE } from '../src/renderer/src/catArt'

let root = ''
const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
const git = (...args: string[]): string => execFileSync('git', args, { cwd: root, env }).toString()

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'glyphh-bot-test-'))
  mkdirSync(join(root, 'src/deep'), { recursive: true })
  mkdirSync(join(root, 'node_modules/x'), { recursive: true })
  writeFileSync(join(root, 'index.html'), '<h1>hi</h1>\n')
  writeFileSync(join(root, 'src/app.js'), 'one\ntwo\n')
  writeFileSync(join(root, 'src/deep/app.test.js'), 'x\n')
  writeFileSync(join(root, 'node_modules/x/app.js'), 'skip\n')
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('files', () => {
  it('lists a folder, folders first, without node_modules', async () => {
    const top = await listDir(root, '')
    expect(top.map((e) => e.name)).toEqual(['src', 'index.html'])
    expect(top[0]).toMatchObject({ dir: true, path: 'src' })
    expect((await listDir(root, 'src')).map((e) => e.path)).toEqual([join('src', 'deep'), join('src', 'app.js')])
  })

  it('stays inside the workspace', async () => {
    expect(() => inside(root, '../etc')).toThrow(/Outside/)
    await expect(listDir(root, '../')).rejects.toThrow(/Outside/)
  })

  it('searches the whole folder by name, shallow first, skipping heavy folders', async () => {
    const hits = await searchFiles(root, 'APP')
    expect(hits.entries.map((e) => e.path)).toEqual([join('src', 'app.js'), join('src', 'deep', 'app.test.js')])
    expect(hits.truncated).toBe(false)
    expect((await searchFiles(root, 'app', 1)).truncated).toBe(true)
    expect((await searchFiles(root, '  ')).entries).toEqual([])
  })

  it('makes folders and renames without overwriting', async () => {
    await makeDir(root, 'notes')
    await expect(makeDir(root, 'notes')).rejects.toThrow(/exists/)
    await renamePath(root, 'notes', 'docs')
    expect((await listDir(root, '')).map((e) => e.name)).toContain('docs')
    await expect(renamePath(root, 'docs', 'index.html')).rejects.toThrow(/exists/)
    await expect(renamePath(root, '', 'x')).rejects.toThrow(/cannot be renamed/)
  })

  it('diffs the working tree, untracked files included, before and after the first commit', async () => {
    expect((await workingDiff(root, env)).error).toBe('not a git repo')
    git('init', '-q', '-b', 'main')
    writeFileSync(join(root, '.gitignore'), 'node_modules\n')
    const before = parseUnifiedDiff((await workingDiff(root, env)).text)
    expect(before.map((f) => f.path).sort()).toEqual(['.gitignore', 'index.html', 'src/app.js', 'src/deep/app.test.js'])
    git('add', '-A')
    git('commit', '-q', '-m', 'first')
    expect((await workingDiff(root, env)).text).toBe('')
    writeFileSync(join(root, 'src/app.js'), 'one\nTWO\nthree\n')
    writeFileSync(join(root, 'new.md'), '# new\n')
    const after = parseUnifiedDiff((await workingDiff(root, env)).text)
    const app = after.find((f) => f.path === 'src/app.js')!
    expect(app).toMatchObject({ additions: 2, deletions: 1 })
    expect(after.find((f) => f.path === 'new.md')).toMatchObject({ additions: 1, deletions: 0 })
  })
})

describe('diff parsing', () => {
  it('splits files, counts lines and skips metadata', () => {
    const text = [
      'diff --git a/a.txt b/a.txt',
      'index 1..2 100644',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1,2 +1,2 @@',
      ' keep',
      '-old',
      '+new',
      'diff --git a/b.txt b/b.txt',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/b.txt',
      '@@ -0,0 +1 @@',
      '+hello',
      '\\ No newline at end of file',
      ''
    ].join('\n')
    const files = parseUnifiedDiff(text)
    expect(files.map((f) => [f.path, f.additions, f.deletions])).toEqual([
      ['a.txt', 1, 1],
      ['b.txt', 1, 0]
    ])
    expect(files[0]!.lines.map((l) => l.kind)).toEqual(['hunk', 'context', 'del', 'add'])
    expect(parseUnifiedDiff('')).toEqual([])
  })
})

describe('browser address bar', () => {
  it('keeps urls, adds a scheme to hosts and searches the rest', () => {
    expect(toUrl('https://glyphh.ai')).toBe('https://glyphh.ai')
    expect(toUrl('file:///tmp/index.html')).toBe('file:///tmp/index.html')
    expect(toUrl('glyphh.ai/games')).toBe('https://glyphh.ai/games')
    expect(toUrl('localhost:5173')).toBe('http://localhost:5173')
    expect(toUrl('black cats')).toBe('https://duckduckgo.com/?q=black%20cats')
    expect(toUrl('  ')).toBe('')
  })
})

describe('the cat', () => {
  it('is black and white in every part, accessory and pose', () => {
    const allowed = new Set([WHITE, INK, 'none'])
    for (const head of HEADS)
      for (const tail of TAILS)
        for (const eye of EYES)
          for (const extra of EXTRAS)
            for (const accessory of ACCESSORIES)
              for (const pose of POSES) {
                const colours = coloursIn(catMarkup({ head, tail, eye, extra, accessory, pose }))
                for (const c of colours) expect(allowed.has(c), `${c} in ${head}/${tail}/${eye}/${extra}/${accessory}/${pose}`).toBe(true)
              }
  })

  it('names every part for the editor', () => {
    for (const h of HEADS) expect(PART_NAMES.head[h]).toBeTruthy()
    for (const a of ACCESSORIES) expect(PART_NAMES.accessory[a]).toBeTruthy()
    for (const p of POSES) expect(PART_NAMES.pose[p]).toBeTruthy()
  })

  it('fills in a bad saved look', () => {
    const l = normalizeLook({ coat: '#fff', style: 'long', accessory: 'crown', pose: 'fly' })
    expect(l.accessory).toBe('crown')
    expect(HEADS).toContain(l.head)
    expect(POSES).toContain(l.pose)
  })
})
