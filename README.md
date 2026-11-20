# oliver-project

Oliver's end-of-semester project: an AI assistant and agent built to help with something Oliver is designing.

## Status

Just getting started. Right now we're checking that both of us can clone, commit and push to this repo.

## Goals

- Define the problem: what Oliver is designing and where an AI assistant would actually help.
- Build an assistant that can answer questions and give feedback on the design.
- Extend it into an agent that can take actions (run tools, look things up, update files) on Oliver's behalf.
- Demo it at the end of the semester.

## Getting started

Accept the GitHub invite, then on a Mac:

```bash
brew install gh
gh auth login
gh repo clone timmetim/oliver-project ~/development/oliver-project
cd ~/development/oliver-project
```

To work with Claude Code in the repo:

```bash
curl -fsSL https://claude.ai/install.sh | bash
claude
```

## The app

Oliver is an Electron app: a bot OS. A crew of Claude bots (each one a horse with its own look, voice, personality and job) talk out loud, take turns and build things.

![Oliver: the crew room](docs/oliver.png)

**A swarm, mid-turn.** Dex's turn is already a merged pull request, Koda is up and asking before running a command:

![A swarm with a merged pull request and a permission card](docs/oliver-swarm.png)

**Making a bot.** Describe it and Claude builds the name, voice, personality and fit; then tweak anything:

![The bot editor](docs/oliver-bot.png)

```bash
npm install
npm start
```

- **Claude**: the app uses your own Claude Code login (`claude auth login`). It asks you to connect if you are not signed in, and the Connections tab shows the account and its connectors.
- **Voice**: bots speak and listen through ElevenLabs. Put your key in Settings (on Chris's Mac it falls back to the key in `glyphh/server/.env`).
- **Bots**: left rail. Click one to talk to it alone, or make a new one by describing it.
- **The Crew**: the main chat. With Swarm on, each bot takes a turn on its own git branch and opens a pull request; with it off they just talk it over.
- **Work panel**: right rail, with the swarm's turns and pull requests, the files, a Monaco editor and a browser.
- Projects live in `~/Oliver/`. Bots, settings and your key are stored in `~/Library/Application Support/oliver/oliver.json`, never in this repo.

Code: `src/main` (Claude, voice, git), `src/renderer/src` (the UI; `Horse.tsx` draws the bots, `engine.ts` runs the turns).

## Working together

- Pull before you start: `git pull`
- Commit small changes with clear messages.
- Push when you're done: `git push`

## Contributors

- Oliver (@oliver-ship-it)
- Chris (@timmetim)

## GitHub test log

Each of us adds a line here to confirm we can push from our machine.

- [x] Chris: pushed from Chris's Mac
- [ ] Oliver: push from Oliver's Mac
