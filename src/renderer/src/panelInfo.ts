import { botOfPanel, PANELS } from '../../shared/layouts'
import { ICON } from './Menu'
import { get } from './store'

export const PANEL_ICON: Record<string, string> = {
  chat: ICON.chat,
  swarm: ICON.swarm,
  files: ICON.files,
  editor: ICON.editor,
  diff: ICON.diff,
  browser: ICON.browser
}

/** A panel's name: a bot's name for its chat, the room for the main Chat. */
export function panelTitle(panelId: string): string {
  const bot = botOfPanel(panelId)
  if (bot) return get().bots.find((b) => b.id === bot)?.name ?? 'Bot'
  if (panelId === 'chat') return get().room === 'crew' ? 'The Crew' : (get().bots.find((b) => b.id === get().room)?.name ?? 'Chat')
  return PANELS.find((p) => p.id === panelId)?.label ?? panelId
}
