# Details

Everything that did not fit on the front page. Back to the [README](../README.md).

## How it works

Two local servers:

- Next.js frontend on port 3000 (editor, terminal, chat, file tree)
- Fastify backend on port 3001 (files, terminal, Claude proxy, previews)

Each candidate gets their own copy of the exercise in `.solutions/<name>/<exercise>/`. Claude and the terminal are sandboxed to that folder. The exercise template in `exercises/` is never edited by candidates.

## Requirements

- Node 25 (see `.nvmrc`, run `nvm use`)
- The **Claude Code CLI**, installed and signed in (`npm install -g @anthropic-ai/claude-code`, then run `claude` once). The chat and the Claude Code terminal both run on it, with your login, so your account pays for what candidates use.
- Optional: **OpenCode 2** (`brew install anomalyco/tap/opencode-v2`), signed in to a provider with a default model. Version 1 is not supported.
- Optional, to share with a remote candidate, one of: `ngrok` (needs a free account and an authtoken: sign up at https://dashboard.ngrok.com/signup, then `ngrok config add-authtoken <token>`; on the free plan candidates see a one time "Visit Site" page) or `cloudflared` (`brew install cloudflared`, no account needed). `make config` asks which and checks what it still needs from you.
- Some budget on the account the assistants are signed in to: candidates spend yours.

`make install` installs the dependencies and checks all of this: Node, Claude Code, OpenCode and the tunnel (including whether ngrok is logged in). In a terminal it offers to install what it can.

`make config` then asks which assistants and exercises you allow. `make start` installs dependencies when `node_modules` is missing or `package-lock.json` changed, refuses to start if Claude Code is missing, and reports (without stopping) when something you allowed is not ready.

## Run it

```bash
nvm use
make start
```

Before a real interview, do one dry run with a test candidate, see the [interviewer guide](interviewer-guide.md#test-it-once).

To skip the prompt:

```bash
EXERCISE_PATH=$(pwd)/exercises/<id> EXERCISE_ID=<id> npm run interview
```

## Running an interview

1. Open http://localhost:3000, click "Use Web Interface", enter the candidate name.
2. The candidate reads `description.md` and the files in `phases/`.
3. In the terminal panel, the Run button installs dependencies, migrates the DB and starts the exercise app. A preview link shows up when it is ready.
4. Candidate work is saved to `.solutions/<name>/<exercise>/`.

## What the candidate gets

- Progress is kept on the interviewer's machine, per candidate and exercise, in `.solutions/<name>/state.json`: open files, the active file, open folders, chats (and which model each used), terminal tabs and the pinned preview. Reconnecting through a new tunnel URL or another browser restores it once the candidate types the same name.
- Terminals live on the server. Reloading the page, or opening a second screen, reattaches to the same shell with its full history, and a running app keeps streaming its log. Closing a terminal tab that was used, or a chat that has messages, asks for confirmation.
- The Run button types the command and presses Enter, so `npm install` output shows up right away in a real TTY.
- Closing the preview tab no longer stops the app; use Stop in the terminal. Web exercises open the preview tab unfocused with the first file, and an Open preview button appears next to Stop once the app runs. Hot reload works through the tunnel.
- Files autosave a few seconds after typing stops, only when something changed. The editor header shows the state (unsaved, saving, saved at a time), and Ctrl+S or Cmd+S saves immediately.
- The chat streams answers as they are written, shows the tokens used by the conversation, and renders the assistant's questions as buttons (type your own answer too). Files the assistant changed get a small sparkle in the file tree until someone opens them. Agent tabs can be dragged to reorder, and the order is remembered.
- New chats use Sonnet 5.5; switching to "Plan first" selects Opus 5.5 and the assistant asks clarifying questions before planning.
- The preview can be pinned next to the editor (Pin button on the Preview tab) with a draggable divider. The chevron hides it and the Preview tab still opens it full size. The preview always lives at `/preview/<name>/<exercise>/`, on localhost and on a tunnel alike.
- The burger menu can hide or show the other person's cursor (remembered per browser).
- On start the server asks the assistant for one tiny answer. If it fails (for example no login, or no budget left) it logs a clear warning, also available at `/api/ai-status`. Set `TRIO_SKIP_HEALTHCHECK=1` to skip it.

## Command palette

Cmd+K (Ctrl+K elsewhere, also Cmd+Shift+P) opens a palette with about 70 actions, searchable by name: focus the chat, terminal or editor, new terminal, chat, file or folder, run or stop the app, toggle any panel, pin the preview, switch model, plan or instant mode, compact or undo the AI, editor actions (find, go to line, format, fold), go to any open tab or chat, and for the interviewer reveal hidden files or switch candidate. Cmd+P goes to a file, Cmd+B toggles the sidebar, `?` lists the shortcuts and the terminal commands. New actions are registered in `app/page-client.tsx` (`paletteActions`) and handled by the component that owns the behaviour through `useAction` in `app/lib/actions.ts`.

## After the interview

`make export` writes a zip of the candidate's code, every conversation and a self-contained `viewer.html` to `exports/`. To evaluate it, ask your agent (Claude Code, OpenCode or any agent that reads files) to run the `evaluate-candidate` skill (`.claude/skills/evaluate-candidate/SKILL.md`) on that export: it reports what was built, how far the candidate got and how they used the AI assistant.

## Interviewer mode

Anyone opening the tool through `localhost` is the interviewer. The sign in screen there has an "I'm an interviewer" button with the list of candidates (online ones first, refreshed every 30 seconds). Opening a candidate gives the exact same workspace they have, live and in both directions:

- open files, active file, editor scroll, open folders, panel layout, terminal tabs and their output, chats (including the thinking state), and the pinned preview stay in sync between the two screens. Either side can type, edit, run and chat.
- live editing: carets, selections and typing in any text file show up on the other screen as you type (labelled "Interviewer" or the candidate's name), and what either side types in the chat box is visible to the other.
- follow switch: both sides start with Follow off (header pill and burger menu). Off means each screen navigates on its own: open files and tabs, scroll, preview, terminal and chat tabs, layout and folders are not mirrored. Content stays live either way (file text, terminal output, chat messages, cursors and carets). Turning Follow on mirrors the other person's navigation.
- cursors: the interviewer sees the candidate's cursor with their tag, the candidate only sees one tagged "Interviewer". Candidates never see each other. Cursors work over the preview too.
- the tool serves one candidate at a time. Opening a different candidate while another one is online asks for confirmation.

### Hiding files from the candidate

An exercise can start with files the candidate cannot see (the assistant cannot see them either; the interviewer reveals them from the file tree, there is a "Reveal all" button). List them under `hidden` in `exercises/<id>/exercise.json`:

```json
"hidden": ["phases/phase-2-bug-finding.md", "phases/phase-3-implementation.md", "phases/phase-4-optimization.md"]
```

Paths may use `*` and `**`. Hidden files are moved out of the candidate's folder (to `.solutions/<name>/.hidden/<exercise>/`), so the file tree, the terminal and the AI assistant cannot read them. In the interviewer's file tree they show with a "hidden" badge, an eye button per file and "Reveal all / Hide all" for the whole set, and the candidate's tree updates within a couple of seconds. Both shipped exercises hide phases 2 to 4.

## Assistants and models

The candidate picks the assistant from what you allowed in `interview.config.yaml`: the chat, Claude Code or OpenCode. The interviewer sees the same options, disabled, and the choice once it is made. See [SECURITY.md](../SECURITY.md) for how the terminal assistants are kept apart from your own setup.

The chat runs the Claude Code CLI on your machine, through whatever login that CLI uses. Every message a candidate sends is paid for by that account, so make sure it has enough left.

The chat's model list lives in `shared/models.ts` and feeds both the server and the dropdown: Opus 5.5, Sonnet 5.5 and Haiku 4.5. Sonnet 5.5 is the default and Plan first switches to Opus 5.5. If your account or gateway names a model differently, override it for one run:

```bash
TRIO_MODEL_OPUS=my-opus-id make start
```

The terminal assistants start on Sonnet 5.5.

Subagents (the Task tool) work. The server sets `CLAUDE_CODE_SUBAGENT_MODEL` to the model the candidate picked.

## Sharing with a remote candidate

The candidate only ever uses one URL, the tunnel URL. It serves exactly the same tool as http://localhost:3000: the editor, terminal websocket, chat and the exercise preview (`/preview/<name>/<exercise>/`) all go through port 3000. Nothing in the browser talks to ports 3001, 5173 or 3002 directly. The one exception is the interviewer's own preview frame, which loads the candidate's app from port 3099 (a second port of the same server, so that code the candidate wrote runs in a different origin than the interviewer's page).

`make start` opens the tunnel you chose in `make config` (`tunnel:` in `interview.config.yaml`: `ngrok`, `cloudflared` or `none`; ngrok when the file says nothing).

With `ngrok`, the free plan needs an account (once), always gives the same address (the private part of the link is what changes), and shows a one time "You are about to visit" page that the candidate clicks through once. Everything works through it.

With `cloudflared` a quick tunnel needs no account and gives a new address every time, and a link just made can take a little while to open on the candidate's side while the name spreads. It carries the terminal assistants (Claude Code and OpenCode) and everything else that uses a WebSocket, but not the chat's live answers: they travel as server sent events, which a quick tunnel holds back, so the chat would stay empty. Tell the candidate to pick a terminal assistant. `make start` says so under the link.


The address is not what keeps strangers out. `make start` makes a new secret for every interview and prints the link as `https://<tunnel-address>/#k=<secret>`. The page trades the secret for an HttpOnly cookie (12 hours) and removes it from the address bar; the backend (`server/lib/access-gate.ts`) answers a candidate only with that cookie, WebSockets and the preview included. The secret lives only in the environment of the servers and in the printed link, never on disk or in a log, and the next `make start` replaces it. Without `make start` (plain `npm run dev`) there is no secret and nothing is asked for.

## Exercises

| Exercise | Stack | Time |
|----------|-------|------|
| fibonacci | Node | 20 min |
| gearshare (in `examples/`, added by `make config`) | React, Express, SQLite | 60 min |

Each exercise has a `description.md`, an optional `phases/` folder and an `exercise.json` file whose `run` section tells the platform how to start it (`port` for the frontend, `serverPort` for the API). To add one, follow [CONTRIBUTING.md](../CONTRIBUTING.md).

## Commands

```bash
make start        # interactive start
make stop         # stop the servers, exercise apps and tunnel
make test         # unit tests
make typecheck    # tsc --noEmit
make reset        # reset exercises to original state
make config       # choose the assistants and exercises you allow
```

## Exporting a candidate

`make export` lists the candidates in `.solutions/`, lets you pick one and writes `exports/<name>-<exercise>-<date>.zip`.
For a non interactive run: `make export CANDIDATE=name EXERCISE=fibonacci`.
The zip has `code/`, `conversations/*.md` (Claude Code sessions with subagents, plus in-app chat threads), `data.json` and `viewer.html`.
`viewer.html` is a single static file: open it from disk or host the unzipped folder on any static host.

## Project layout

```
app/           Next.js frontend
server/        Fastify backend (routes, Claude proxy, sandbox)
shared/        Code used by both (model catalog, settings file, file lock rules)
cli/           Entry point for `npm run interview`
scripts/       Start, stop, setup check and export scripts
exercises/     Exercise templates and their shared rules
.claude/skills/  create-exercise and evaluate-candidate
examples/      Exercises that make config can add
docs/          Guides, and the interviewer's notes per exercise
```

## Troubleshooting

- Port already in use: `make stop`.
- Chat says "Invalid model name": the ids in `shared/models.ts` must match what your gateway serves. Override with `TRIO_MODEL_<KEY>` (see Models above).
- Exercise API crashes with EADDRINUSE: its `run.serverPort` in `exercise.json` must not be 3000, 3001 or 3099.
- `exercises/` is ignored by git, so an exercise there is read from the disk and a change counts for the next candidate who starts. If you chose to version an exercise, the platform restores it from git when a new candidate starts (`git checkout HEAD -- exercises/<id>`), so commit your changes to it.
