// A unified git diff split into files and lines, the way the Glyphh desktop's
// Diff panel reads it (glyphh/app code-workbench.ts parseUnifiedDiff).

export type DiffLineKind = 'add' | 'del' | 'hunk' | 'context'

export interface DiffFile {
  path: string
  additions: number
  deletions: number
  lines: { kind: DiffLineKind; text: string }[]
}

const META = /^(\+\+\+|---|index |new file|deleted file|similarity |rename |Binary |\\ No newline|old mode|new mode)/

export function parseUnifiedDiff(text: string): DiffFile[] {
  const files: DiffFile[] = []
  let current: DiffFile | null = null
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git')) {
      const m = line.match(/diff --git a\/(.+?) b\/(.+)$/)
      current = { path: m ? m[2]! : '(unknown)', additions: 0, deletions: 0, lines: [] }
      files.push(current)
      continue
    }
    if (!current) continue
    if (line.startsWith('@@')) current.lines.push({ kind: 'hunk', text: line })
    else if (META.test(line)) continue
    else if (line.startsWith('+')) {
      current.lines.push({ kind: 'add', text: line })
      current.additions++
    } else if (line.startsWith('-')) {
      current.lines.push({ kind: 'del', text: line })
      current.deletions++
    } else if (line !== '' || current.lines.length) current.lines.push({ kind: 'context', text: line })
  }
  // A trailing blank line from the split is not part of any hunk.
  for (const f of files) while (f.lines.at(-1)?.kind === 'context' && f.lines.at(-1)!.text === '') f.lines.pop()
  return files
}
