import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

self.MonacoEnvironment = {
  getWorker(_id: string, label: string): Worker {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  }
}

monaco.editor.defineTheme('oliver', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '8b7fb8', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'e879f9' },
    { token: 'string', foreground: 'a3e635' },
    { token: 'number', foreground: 'fbbf24' },
    { token: 'type', foreground: '22d3ee' },
    { token: 'tag', foreground: 'f472b6' },
    { token: 'attribute.name', foreground: 'c4b5fd' },
    { token: 'delimiter', foreground: 'b3a8d6' }
  ],
  colors: {
    'editor.background': '#0b0618',
    'editor.foreground': '#efeaff',
    'editor.lineHighlightBackground': '#1a0f33',
    'editorLineNumber.foreground': '#5b4b8a',
    'editorLineNumber.activeForeground': '#c4b5fd',
    'editorCursor.foreground': '#e879f9',
    'editor.selectionBackground': '#7c3aed66',
    'editor.inactiveSelectionBackground': '#7c3aed33',
    'editorIndentGuide.background1': '#1f1440',
    'editorWidget.background': '#130a26',
    'editorWidget.border': '#3b2a6b',
    'scrollbarSlider.background': '#7c3aed44',
    'scrollbarSlider.hoverBackground': '#a855f766',
    'minimap.background': '#0b0618'
  }
})

export { monaco }
