# Glyphh Bot

A desktop app for a crew of Claude bots. Each bot is Spike, the Glyphh cat, in its own look, voice, personality and job. They talk out loud, take turns and build things in a folder on your Mac. The chat is the center; panels (files, editor, diff, browser, terminal, your web apps, a bot's own chat) open beside it only when you open them.

![The crew room](docs/1-main.png)

**Rich chat.** Full markdown with tables and task lists, highlighted code with Copy and Open in editor, inline images, diagrams, math and folding diffs. A bot's tool calls fold into one line, the files it made or changed show as cards that open in the Editor, and each crew turn's pull request is a card you merge or reject right there. Attach files with +, by dropping them on the chat or by pasting: they are copied into the folder, and images go to the bot as pictures.

![A crew turn in the chat](docs/2-rich-chat.png)

![Diagrams, math and a diff](docs/2b-rich-chat.png)

**Panels stack the way Claude's do.** The first opens full height beside the chat, the second under it, the third as a new column, the fourth under that. Close one and the rest reflow; close the last and the chat has the whole width. Each panel can be expanded over the desk and closed from its header; opening one that is already open just focuses it.

![Four panels](docs/3-panels-4.png)

![One closed: the rest reflow](docs/3b-panels-closed.png)

**Layouts and pins.** A layout sets the frames and their sizes; a pinned frame takes every new panel. Empty frames are never drawn. Pick a layout from its icon on the home screen; make, edit, rename, pin and delete them in Settings → Layouts.

![A layout with a pinned frame](docs/4-layout-pinned.png)

![The Dev layout](docs/4b-dev-layout.png)

**Terminal.** A login shell in the project folder (xterm and node-pty, ported from the Glyphh desktop), stacked in like any panel. Its shell ends when the panel closes. Below it, GitHub opened from its home-screen icon in a Browser panel of its own.

![A terminal and an app](docs/4c-terminal-app.png)

**Recents.** Past chats, pinned ones first and the rest by folder. Each row pins, archives or deletes; archived chats wait in the Archived view.

![Recents](docs/5-recents.png)

**Connections.** Your Claude account and its connectors, with each service's own icon. Add opens Claude's connector settings in the app's browser.

![Connections](docs/6-connections.png)

**Account.** The button at the foot of the left rail opens upward: the account, Settings, Switch account and Log out.

![The account menu](docs/6b-account.png)

**Home (the grid icon in the top bar, or ⌘K).** Takes the chat's place like a phone's home screen: a search over everything, then pages of icons (panels, your apps, bots and layouts) with dots underneath. Swipe with two fingers, drag, or use the arrow keys to turn the page; Esc, the icon again or the Chat icon go back to the chat.

![Home](docs/7-home.png)

![Home, page 1 of 2](docs/7b-home-page-1.png)

![Home, page 2](docs/7c-home-page-2.png)

**Your apps.** Add app takes a web address and an optional name, and fetches the site's icon (its apple-touch-icon, then its favicon, else a letter tile). Each app has its own kept session, so its sign-in sticks, and opens in a new Browser panel each time. Its addresses (one or more prefixes, `*` for any part of a host, its own site by default) and "Keep redirects in the panel" decide what stays in that panel: pages, redirects, `window.open` and new windows at those addresses navigate in place (Slack's sign-in and workspace hops, or a sign-in host you add), a hand-off to the desktop app (`slack://`) is stopped, and anything else does what the Browser always does. Hover an app to edit or remove it.

![Edit an app](docs/7d-app-editor.png)

![Settings: layouts](docs/8-settings-layouts.png)

![The bot editor](docs/9-bot-editor.png)

## Run it

```bash
npm install
npm start
```

- **Claude**: the app uses your own Claude Code login (`claude auth login`). It asks you to connect if you are not signed in, and the Connections tab shows the account and its connectors.
- **Voice**: bots speak and listen through ElevenLabs. Put your key in Settings (on Chris's Mac it falls back to the key in `glyphh/server/.env`).
- **Bots**: left rail. Click one to talk to it in the chat, or open its own chat as a panel from the top bar's ⋮ menu or ⌘K.
- **The Crew**: the main chat. With Swarm on, each bot takes a turn on its own git branch and opens a pull request; the strip on top shows whose turn it is and how each turn's PR went. With it off they just talk it over.
- **Top bar**: Recents, Home (⌘K), the Files, Browser, Terminal, Editor and Diff buttons (click again to close), and ⋮ for the other panels and the bots.
- Projects live in `~/Glyphh Bot/`. Bots, layouts, recent chats, settings and your key are stored in `~/Library/Application Support/Glyphh Bot/glyphh-bot.json`, never in this repo. Attached files go into the project's `attachments/`.

## Check it

```bash
npm run typecheck
npm test
npm run build
GLYPHH_BOT_SHOT=/tmp/main.png npx electron .
```

`GLYPHH_BOT_SHOT` saves a picture of the window and quits. `GLYPHH_BOT_SHOT_JS` runs in the page first, with the store on `window.__shot` to set up a scene (for example `window.__shot.openPanel('files')`); `GLYPHH_BOT_SHOT_WAIT` and `GLYPHH_BOT_SHOT_AFTER` are the waits in milliseconds. `GLYPHH_BOT_DATA` and `GLYPHH_BOT_HOME` point the data file and the projects folder somewhere else, so a screenshot run never touches your own.

## Code

- `src/main`: Claude, voice, git, the workspace and its files (`files.ts`), connector and app icons (`icons.ts`), the terminal's shells (`terminal.ts`), the data file; `index.ts` keeps each app's pages in its panel.
- `src/shared/layouts.ts`: frames, the panel stack and the desk's geometry. `apps.ts`: your apps, their prefixes and what a panel does with a page. `paging.ts`: the home screen's pages. `recents.ts`: past chats. `connectors.ts`: which service a connector is. Pure data, tested in `test/`.
- `src/renderer/src`: the UI. `Chat.tsx` the chat and composer, `md.ts` markdown, `Desk.tsx` the desk, `CommandCenter.tsx` the home screen, `LayoutManager.tsx` the layout editor, `panels/` the panels, `engine.ts` runs the turns, `catArt.ts` draws the cats.

Ported from: the cat from Glyphh OS (`os/src/renderer/character.js`), the command center from Glyphh OS's Apps sheet, the layout grid from the Glyphh desktop (`app/src/renderer/help/workspace-grid.ts`), and the Files, Editor, Diff, Browser and Terminal panels from the desktop's code workbench, `working-directory.ts` and `wb-terminal.ts`.


## License

Apache-2.0. See LICENSE and NOTICE. Copyright 2026 Chris Timmerman / Glyphh AI LLC. More about it: https://glyphh.ai/projects/glyphh-bot
