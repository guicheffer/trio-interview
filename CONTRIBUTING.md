# Contributing

Two kinds of changes come up here: a new exercise, and a change to the tool itself. Exercises are the common one and need no code.

## Set up

```bash
nvm use           # Node 25, see .nvmrc
make install      # installs dependencies and checks Claude Code, OpenCode and the tunnel
make help         # every command
```

`make test` runs the unit tests, `make typecheck` the type check, `make dev` starts the frontend and the backend with hot reload. `AGENTS.md` explains how the tool is put together, and it is the file to give any AI agent that works on this repository.

## Add an exercise

An exercise is a folder in `exercises/` with a `description.md`. `make start` lists every such folder, so nothing else needs registering.

### With an agent (recommended)

The repository ships a skill that asks the right questions and scaffolds everything. In Claude Code, OpenCode or any agent that reads files, ask:

> Run the create-exercise skill

It lives in `.claude/skills/create-exercise/SKILL.md`. It asks for the id, title, stack, duration and scenario, whether there are phases and which ones stay hidden, and then creates the files below. Review what it wrote; the scenario and the starter code are your call.

### By hand

```
exercises/<id>/
  description.md            H1 is the title shown in the start menu; the candidate reads it first
  exercise.json             the one config file: locked files, hidden files, first file, assistant overview, how Run starts the app
  phases/                   phase briefs (optional)
  codebase/                 the starting code, or a single starter file for small exercises
```

The details of every file are in the "Creating an exercise" section of `AGENTS.md`. Rules worth repeating:

- `description.md` must not name or describe hidden phases. Hidden files are moved out of the candidate's folder, so the file tree, the terminal and the AI assistant cannot see them, but the description is read by all three.
- Interviewer material (guides, solutions, evaluation criteria) is hidden too, or lives outside the exercise folder. You see hidden files with a `hidden` badge in the file tree and reveal them one by one or all at once:
- Lock `description.md` and `phases/` in `exercise.json` (`lockedFiles`), plus any fixture or test the candidate must not edit.
- A web app sets `run.serverPort` to 3002 or higher (3000 and 3001 belong to the tool), uses `exercises/_templates/web-app/vite.config.ts` so the preview works through the platform path, and sets its router `basename` to `import.meta.env.BASE_URL`.
- Commit the exercise. Activating a candidate restores the template with `git checkout HEAD -- exercises/<id>`, so uncommitted changes are discarded.

### Check it before you open the pull request

1. `make start`, pick the exercise, open `http://localhost:3000` and enter a name.
2. Click Run (if it has an app) and confirm the preview opens.
3. Open the tunnel URL in another browser profile and check that locked files are read only and hidden files are not there.
4. Reveal a hidden file from the interviewer side and check that it shows up for the candidate.

On `localhost`, "I'm an interviewer" lists the candidates and opens their workspace live.

## Change the tool

1. Branch from the main branch (`feature/short-description`, `fix/` and `chore/` work too). Never push to the main branch.
2. Make the change with tests. Logic goes in small functions with unit tests; the files that need a real process, terminal, socket or AI provider are the hard ones to test, so keep decision making out of them.
3. Run `npm run lint`, `make typecheck`, `make test` and `npx next build`.
4. Verify UI changes in the browser on both sides: `localhost` (the interviewer) and `candidate.localhost` or the tunnel URL in a separate browser profile (the candidate).
5. Open a pull request and say what changed and how you checked it.

CI runs the type check, the lint and the tests on every pull request (`.github/workflows/pr-branch-checks.yml`).

When you change who may do what (roles, the choice of assistant, what a terminal assistant can reach), add a test that tries to break it. `server/routes/__tests__/agent.test.ts` is the example: it calls the API directly the way a candidate could, not through the page.

## House rules

- English for code, docs and commit messages. Short sentences, no dashes in prose, no emojis.
- Never skip hooks.
- Candidate data (`.solutions/`, `exports/`) and interviewer tokens never go in the repository. They are gitignored; keep it that way.
- The assistants that candidates talk to run on the interviewer's machine. Changes to `server/lib/assistant-prompt.ts`, to the flags in `server/lib/claude-proxy.ts` or `server/lib/agent-pty.ts`, or to what `server/lib/opencode-pty.ts` copies in, change what candidates can do, so describe the effect in the pull request.
