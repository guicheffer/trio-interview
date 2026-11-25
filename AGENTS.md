# AGENTS.md

Guide for anyone (human or AI) working on Trio, a live coding interview platform.

Do not create a `CLAUDE.md` at the repo root. Candidate sessions run inside `.solutions/`, which sits in this repo, so Claude Code would load it into the candidate's assistant.

## What this is

A local tool for live coding interviews. The interviewer runs it on their own machine and candidates join through a tunnel URL. The candidate picks the AI assistant from what the interviewer allowed: the chat (the Claude Code CLI, spawned per message), or Claude Code, OpenCode or Pi running in a real terminal in the page. Codex shows in the picker as coming soon and has no server route. They all run on the interviewer's machine with the interviewer's own login, so the interviewer's account pays for them.

- `app/` Next.js frontend (port 3000)
- `server/` Fastify backend (port 3001): files, terminal (PTY), chat (SSE), presence (WebSocket), preview proxy
- `shared/` code used by both (model catalog, the preview port)
- `exercises/<id>/` exercise templates (never edited at runtime)
- `.solutions/<candidate>/` each candidate's working copy and state (gitignored, contains candidate data)
- `scripts/` preflight, start, stop, export

Commands: `make help`, `make start` (`make start LOG=1` for full logs), `make stop`, `make export`, `make delete` (removes a candidate and their exercise folder after two confirmations; `make delete CANDIDATE=name YES=1` skips them). The interviewer's candidate list has the same through a trash button on candidates that are not connected or active (`DELETE /api/interviewer/candidates/:name`, refused for the active or a connected one).

## Roles

The host decides the role. `localhost` is the interviewer, any other host (the tunnel) is a candidate. The interviewer sees and edits everything, can hide and reveal files, and can follow or not follow the candidate's view.

A candidate also needs this interview's link. `make start` makes a secret (`TRIO_ACCESS_TOKEN`, only in the servers' environment, never on disk) and prints the link as `<tunnel>/#k=<secret>`. `server/lib/access-gate.ts` answers a candidate only with the cookie the page gets by trading the secret (`/api/access`), and `app/components/AccessGate.tsx` is the page side. Without the variable, as in plain `npm run dev` and in tests, nothing is required. To test as a candidate without a tunnel, open `http://candidate.localhost:3000` (the server treats it as a candidate). Under `make start` the secret is set, so use the `Dry run (candidate)` link it prints (`http://candidate.localhost:3000/#k=<secret>`); with plain `npm run dev` the variable is unset and no link is needed. Never add `TRIO_ACCESS_TOKEN` to the environment the terminal or the assistant gets. The interviewer's **Share** button gets the full link from `GET /api/interviewer/share-link` (interviewer only, never part of the page), built from the tunnel address `make start` posts to `/api/platform-url` plus the secret.

## Creating an exercise

Use the `create-exercise` skill (`.claude/skills/create-exercise/SKILL.md`), or follow this by hand. `make start` lists every folder in `exercises/` that has a `description.md`, so nothing else needs registering. The server uses the first exercise in `exercises/` when none was chosen (`server/lib/default-exercise.ts`), so no exercise has to exist by name.

```
exercises/<id>/
  description.md            H1 is the title shown in the start menu; the candidate reads this first
  exercise.json             the one config file: locked files, hidden files, first file, how Run starts the app
  phases/                   optional phase briefs
  codebase/                 the starting code (or a single starter file for small exercises)
```

`exercise.json` stays on the interviewer's side and is never copied to the candidate. The server reads it from `exercises/<id>/`.

```json
{
  "defaultFile": "description.md",
  "lockedFiles": ["description.md", "phases/"],
  "hidden": ["phases/phase-2-*.md", "phases/phase-3-*.md"],
  "assistant": { "context": "A React and Express app ... (stack, folders, how to run, test users)" },
  "run": {
    "start": "cd codebase && npm install && npm run dev",
    "description": "Install deps and start",
    "port": 5173,
    "serverPort": 3002,
    "install": "cd codebase && npm install"
  }
}
```

- `defaultFile` opens on the candidate's first visit.
- Phase briefs the interviewer has released (phase 1, and any revealed later) are normal files in the candidate's folder, so the AI assistant can read them when asked; withheld ones wait in `.hidden/`, out of its reach. The prompt tells it not to open them on its own.
- An exercise with `run.port` starts its app by itself: `autoStartApp` in `server/routes/terminal.ts` types `run.start` once, when a terminal of a fresh session (no command yet) is first opened. The Run button still restarts it.
- `lockedFiles` protects files from the candidate (read only in the editor, and rejected by the server for rename, move, create and save). Entries can be a file name, an exact path, a whole folder (`phases/`) or a glob (`fixtures/*.json`). The interviewer can still edit them.
- `hidden` (`*` and `**` globs allowed) lists files the candidate cannot see until the interviewer reveals them. They are moved out of the candidate's folder, so the file tree, terminal and AI assistant cannot see them. Keep `description.md` free of the names and contents of hidden phases.
- `assistant.context` is background knowledge for the AI assistant, added to its system prompt before the candidate types anything, so it does not have to explore the project first. Write what a new teammate needs: stack, folder map, how to run and test, test users, what the product does. Never mention the bug, the feature or the solution of any phase; the candidate can get the assistant to repeat whatever is here.
- `run` is how the Run button starts the app. Set `port` to null when nothing serves HTTP.

Rules for exercises that serve a web app:

- `serverPort` must not be 3000, 3001 or 3099 (the platform uses them). Use 3002 and up.
- The preview is always served through the platform at `/preview/<candidate>/<exercise>/`, so the dev server needs `VITE_BASE` support. Copy `exercises/_templates/web-app/vite.config.ts` into `codebase/` (see the README next to it) and set the router `basename` to `import.meta.env.BASE_URL`. Hot reload works through the same path.
- `run.install` is run by `make start` in the template, and the installed `node_modules` are cloned into each candidate's copy, so Run is fast. A `port` means the exercise has a preview: the tab opens (unfocused) with the exercise and the terminal shows an Open preview button.
- `exercises/` is ignored by git on purpose (the ones that ship are in `examples/`), so an exercise there is read from the disk and a change to it counts for the next candidate without a commit. Only an exercise that someone chose to version is restored from git on activation (`git checkout HEAD -- exercises/<id>`), which reverts its uncommitted changes. `make new-exercise` makes one, and `sources:` in `interview.config.yaml` with `make exercises` brings in a repository of them (`shared/interview-config.ts`, `scripts/exercise.ts`).

## Assistants and settings

- `interview.config.yaml` (gitignored, made by `make config`) says which assistants a candidate may pick (`tools`) and which exercises `make start` lists (`exercises`). A missing or broken file allows everything. `shared/interview-config.ts` reads and writes it with a small parser of its own (no YAML dependency); `server/lib/interview-config.ts` reads it on every call, so a change needs no restart. The chat can never be removed.
- **Either screen may choose the assistant, and the settings decide what exists.** `GET /api/agent-mode` tells each screen the options. `POST` and `DELETE /api/agent-mode` refuse an unknown mode and a tool the settings did not allow (403), and a tool that cannot start (409), whoever asks, so the page hiding a button is not what enforces it (`server/routes/__tests__/agent.test.ts` tries to break it). A tool that cannot start is explained to the interviewer only.
- **Terminal assistants** (`server/lib/agent-pty.ts`) run in a real terminal (node-pty), one per candidate and exercise, and every screen attached sees the same terminal. Each gets a private home next to the candidate's folder (`.agent-claude-<exercise>`, `.agent-opencode-<exercise>`, `.agent-pi-<exercise>`), so none of the interviewer's own setup comes along: no status line, hooks, plugins, skills, MCP servers or commands. Claude Code is started with `--strict-mcp-config` and `--no-chrome`, and its login comes from the environment (`ANTHROPIC_*`) or the interviewer's Claude settings. OpenCode (`server/lib/opencode-pty.ts`) needs version 2: it is started with `--standalone` so it does not attach to the interviewer's background service, `OPENCODE_DISABLE_PROJECT_CONFIG` stops a config file the candidate writes from being read, and only the provider the interviewer already uses is copied (its login file is readable by the owner only). Pi (`server/lib/pi-pty.ts`) gets its config folder and its sessions inside that home (`PI_CODING_AGENT_DIR`, `PI_CODING_AGENT_SESSION_DIR`), is started with `--no-extensions --no-skills --no-prompt-templates --no-themes --no-context-files --offline`, takes the interview rules as `APPEND_SYSTEM.md`, and its login is found on its own with no setting (`readPiLogin`): what Pi saved in `~/.pi/agent` (a `/login` sign in or a key, its default provider first), then a key Pi documents in the environment, and `TRIO_PI_API_KEY` for one run. Only that one provider is copied in. Router and cloud variables of other tools are never read and are removed from what Pi runs with. With nothing signed in the picker shows a quiet grey card and the interviewer gets one line, `Sign in once: run pi, then /login.` Each tool's check says in one line whether it is installed, its version, whether a login was found and whether the sandbox works (`shared/assistant-status.ts`, `server/lib/assistant-facts.ts`); the reason is for the interviewer only.
- **What the terminal assistants do not have.** The chat records every file it writes (`rememberWrites` in `server/lib/claude-proxy.ts`), and the Keep and Undo bar, the sparkle in the file tree and the "N files changed by the agent" summary are built on that record. Claude Code, OpenCode and Pi in a terminal do not go through it, so none of those three exist for them. The pencil (files that differ from how the exercise started) still works, since it compares the folder with the template. Their conversations are still exported. Closing this gap would mean watching the candidate's folder for writes while a terminal assistant runs, which is not done yet.
- Claude Code in a terminal asks its own questions, so the `trio-question` style block of the chat is left out of its rules (`buildTerminalSystemPrompt`). Changing the mode, or the candidate choosing again, stops the terminal that was running.
- Seeding the private Claude Code home matters: without `disableAutoMode` in its settings the program offers to switch to auto mode, and without the folder marked as trusted it asks to trust it. `skipAutoPermissionPrompt` does not work for that, because Claude Code removes it at startup whenever the default mode is not auto.

## After an interview

`make export` builds the zip; the `evaluate-candidate` skill reviews it (solution, phases reached, AI usage). It only needs file access, so it works with Claude Code, OpenCode or any agent.

## Live sync (interviewer and candidate)

- `/api/presence` WebSocket rooms are `${candidate}_${exercise}`. Mouse cursors, editor carets and selections, live edits and chat drafts travel as `peer` messages.
- UI state (tabs, folders, chats, layout) is `trio_cc_*` localStorage keys replicated through `app/lib/kvSync.ts`. Keys under `trio_cc_scroll_`, `trio_cc_active_file_`, `trio_cc_preview_pinned_`, `trio_cc_sizes_` (panel sizes, one key per side) and the layout, folder and active chat keys are the ones the follow switch controls (`app/lib/follow.ts`). Turning Follow on saves this screen's view and asks the other screen for its current one; turning it off from the switch restores the saved view, while navigating or dragging a separator ends Follow and keeps where you went.
- Messages in the assistant chat carry who sent them (`from`: interviewer or candidate) and the box keeps a terminal style history: arrow up and down bring back what was sent before in that chat (`app/lib/chatHistory.ts`).
- The file tree marks files the AI wrote to (a sparkle, kept in `.solutions/<name>/ai-files-<exercise>.json`) and files that differ from how the exercise started (a pencil). `GET /api/files-status` answers both; AGENTS.md and CLAUDE.md count as original because the platform adds them.
- After the AI changes the open file, `app/components/AiChangesBar.tsx` draws the changes inside the editor: added lines in green, removed lines in red in a zone above them, with Keep and Undo on each change and Keep all or Undo all in a small bar. Undo is a normal Monaco edit, so it saves and syncs like typing. The "before" text comes from `GET /api/chat/changes` (the last turn's originals kept by `claude-proxy.ts`); the line diff is `shared/line-diff.ts`. Every Keep and Undo shows a small toast with an Undo that counts down for six seconds (taking an undo back tells the server with the `redo` action so the AI is not told); Ctrl or Cmd+Z in the editor also brings an undone change back. Undoing is told to the AI quietly with the person's next message (`POST /api/chat/review`, a hidden note like the open file note, never shown in the chat); keeping needs no word. The zones sit under the text by default, so the code lifts the zone layer and stops the mouse events on the buttons, otherwise the editor swallows the click. Do not name the vendor in text the person sees, the assistant can run on many models.
- The assistant's open questions, plan mode and the chat scroll are shared between the screens through `trio_cc_qa_`, `trio_cc_plan_` and `trio_cc_scroll_chat_` keys (`app/lib/questionSync.ts`). The question panel shows the other person's choices and typing live; only the person who wrote the last message can use it, the other side watches. The scroll key is a Follow key, so it only moves a screen that is following.
- Plan mode sends `plan: true` with the message and the server adds `PLAN_NOTE` (in `assistant-prompt.ts`) as a hidden note, so the chat only shows what the person typed. The tree highlights files that appear while the page is open (and opens their folders) for a few seconds. Plan mode makes the assistant write each plan as a new file, `plans/PLAN-<number>-<short-topic>.md` (see `PLAN_PREFIX` in `app/lib/chatHistory.ts` and the planning line in `assistant-prompt.ts`), never over an older one. It is a normal AI write, so the file gets the AI icon in the tree and, once edited, the change icon.
- `app/components/AiChangesSummary.tsx` pins "N files changed by the agent +X -Y" above the chat box (expandable per file). It counts while the agent answers and the numbers stay fixed after that (stored per file and version in `trio_review_counts_*`), whatever the person keeps, undoes or edits. `GET /api/chat/changes` merges the changes of every session (the interviewer's tab and the candidate's have one each), so both screens, the editor bar included, see the same changes; `useAiChanges` polls it.
- Keep choices are remembered per file and per version of the "before" text (`app/lib/reviewStore.ts`, `trio_review_kept_*`), so coming back to a file or reloading does not show them again; the undo toast has an expiry time and is dropped when a hidden tab comes back. `SubagentBar` in the chat lists the subagents of the latest answer (spinning while the agent works, ticked when done).
- The server tells each room who is in it (`roster` in `presence.ts`, `collab.roster`, `useOtherSideOnline`). The Follow switch and menu item only show when the other role is online, and the interviewer's dot reads Candidate offline when the candidate is gone.
- When a message talks about the terminal or logs (`mentionsTerminal`), the page sends its terminal tabs and the server adds `terminalNote`: each terminal, which one is in front, what runs there and the end of its output, as a hidden note.
- While the agent writes files the editor is read only (`aiLocked` in `MonacoCodeViewer`): `GET /api/chat/changes` also says `writing` (the agent is answering and has already written in this turn), which both screens poll, plus the editing event, held for 2.5 s so it does not flicker. The editor saves 400 ms after the last key (one request at a time, the latest text last), and what is typed is flushed to disk before a message goes to the agent, so the agent works on it and the agent's text, loaded when its answer ends, wins.
- Ctrl or Cmd+W, and Alt+W which browsers do not take, close the thing in focus: the open file, the terminal or the chat, the last two with their confirmation (`closeShortcut`). Chrome does not let a page cancel Ctrl or Cmd+W in a normal tab, so Alt+W is the dependable one there. An unsent chat message is kept per chat in `trio_draft_chat_*`; a half typed terminal line lives in the server's terminal session and comes back with its output.
- Terminal Tab completes commands and files (`server/lib/tab-complete.ts`, kept inside the exercise folder) and lists the options when several fit. Shift with the arrows, Home or End selects text by keyboard (`app/lib/terminalSelect.ts`), Cmd+A selects all, Escape clears.
- File names in the assistant's answers are links: `app/lib/fileLinks.ts` matches mentions (plain or in inline code, optional `:line`) against the project files (`useProjectFiles`) and the chat renders them as buttons that open the file in the editor. Code blocks and unknown or ambiguous names are left alone. The system prompt asks for relative paths.
- The header dot says Not active when the platform works on another candidate than the one a screen shows (`GET /api/session/status`, polled by `useSessionStatus`). Clicking it asks first: the interviewer switches to the active candidate (named), a candidate leaves to the home page. Switch candidate in the menu goes straight to the candidate list (`trio_cc_pick_candidate` in sessionStorage). A candidate who types a name that already has a folder is only asked to add a last name or a number, never told why.
- The chat footer shows what the conversation has used in total against 20M (`CONVERSATION_TOKEN_BUDGET`): the tokens of the earlier context windows (`trio_cc_ctxarch_*`, synced to the other screen) plus the window in use. Before a message is sent, a window past `AUTO_COMPACT_AT` (70%) of the model's context is summarized first (`compactConversation` in `useClaudeStream`, same path as `/compact`), the chat says so, and what the window held moves to the archived part. Nothing blocks at 20M; it is the size a conversation is meant to reach.
- The settings menu ends with Back to the home page (with a confirmation). The candidate keeps the name and the work, and lands on "Continue as <name>" (or someone else) instead of being logged in again; the interviewer picks the role again.
- The assistant stream survives drops: the server sends a `ping` event every 10 s, the page reopens a stream that was quiet for 35 s (a proxy or the network can kill it without an error) and reopens after an error within 1 s, asking for `replay=1` whenever the chat is waiting for an answer, so what the agent said while the stream was down comes back from the turn the server keeps. The header says Connected only when that stream and the presence socket are both up.
- Each browser tab keeps one session id in `sessionStorage` (`app/lib/tabSession.ts`), so a reload finds the assistant's work in progress. The server keeps the events of the current turn (`turnSnapshot` in `claude-proxy.ts`); a page that reloads while its chat is flagged as busy opens `/api/stream?replay=1`, gets the turn again and shows the loading state until it ends.
- Editor text is edited live through Monaco edits, not through the `value` prop. Do not call `setContent` for remote edits, a late re-render overwrites newer text.
- Server code is not hot reloaded by `make start`. Restart after changing `server/`.

## AI assistant rules

The system prompt lives in `server/lib/assistant-prompt.ts` (base rules) plus the exercise's `assistant.context`. It keeps the assistant inside the exercise folder and on the exercise, without announcing limits to the candidate, forbids browser and MCP tools, and defines the `trio-question` block that the chat renders as buttons. Claude is started with `--strict-mcp-config --no-chrome` so interviewer tools are not available to candidates.

## Working rules

- `npm run lint` (unused variables and parameters, no eslint here) runs next to type check and tests in the PR checks; run it before pushing.
- Never push to the main branch. Work on a branch and open a pull request.
- English for code, docs and commits. No em dashes.
- Verify UI changes in the browser on both sides: `localhost` (interviewer) and the tunnel link in an isolated context (candidate).

- **Terminal assistants run inside the operating system's sandbox.** `server/lib/confinement.ts` lists what a candidate session may not reach; Claude Code gets it as its own sandbox settings plus switches that keep its file tools in the folder, and `server/lib/os-sandbox.ts` wraps OpenCode and Pi (and whatever comes next) in `sandbox-exec` with the same list. The profile sits in a folder the assistant can read and not write (a read only file is not enough: deleting depends on the folder). Where the sandbox does not exist the assistant is not started. `server/lib/__tests__/os-sandbox.test.ts` runs ordinary programs inside the real sandbox and tries to get out.
