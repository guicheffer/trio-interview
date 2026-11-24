---
name: create-exercise
description: Scaffold a new coding exercise for the interview platform (description, starter code, run config, locked and hidden files).
---

# Create an exercise

Read `AGENTS.md` ("Creating an exercise") first. Then:

1. Ask for: id (kebab-case), title, difficulty, language or stack, duration, and the scenario in a few sentences. Ask whether it is a single file exercise or a web app with a `codebase/` folder.
2. Ask whether it has phases. If yes, ask which phases should stay hidden from the candidate until the interviewer reveals them (typically everything after phase 1).
3. Create `exercises/<id>/`:
   - `description.md`: H1 title, scenario, numbered requirements (3 to 6), bonus items, constraints, time estimate. If phases are hidden, the description must not name or describe them.
   - Starter code with `TODO` markers where the candidate works. For web apps use `codebase/` and copy `exercises/_templates/web-app/vite.config.ts` into it (preview base path, fetch prefix, API proxy), and set the router basename to `import.meta.env.BASE_URL`.
   - `phases/phase-N-*.md` when the exercise has phases.
   - `exercise.json`, the one config file, with these keys:
   - `lockedFiles`: always `description.md` and `phases/` (a trailing slash locks the whole folder), plus any fixtures or tests the candidate must not edit (file names, paths or globs like `fixtures/*.json`) and `defaultFile` (`description.md`).
   - `run` with `start`, `port` (null when nothing serves HTTP), `install` (the dependency install command, run by `make start`) and for web apps a `serverPort` of 3002 or higher that is not used by another exercise.
   - `assistant.context`: a short overview of the project for the AI assistant (stack, folder map, how to run and test, test users, what the product does). Never mention the bug, feature or solution of any phase.
   - `hidden` listing the hidden files (globs allowed), when the user asked for hidden phases.
4. Check: no other exercise uses the same `serverPort`; hidden files are not mentioned in `description.md`; the start command works when run from the exercise folder.
5. Commit the exercise on a branch (the platform reads templates from git). Do not push to master.
6. Tell the user to run `make start` and pick the new exercise, and to verify it on both `localhost` and the tunnel URL.
