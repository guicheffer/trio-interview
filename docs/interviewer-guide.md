# Interviewer guide

How to run an interview with Trio, from setup to export. The notes for each exercise are in [interviewers/](interviewers/README.md).

## Before you start

1. **Node 25** (`nvm use`).
2. **Claude Code**, signed in. The assistants run on your machine with your login, so your account pays for everything a candidate does. Use one with a limit.
3. **A tunnel** for a remote candidate: `ngrok`, with a free account (see [details](details.md#requirements)).
4. **OpenCode 2**, if you want candidates to be able to pick it.

`make install` checks all of this and offers to fix what it can. `make config` then asks which assistants and exercises you allow.

## Test it once

Before a real interview, run a dry run with a made up candidate:

1. `make start` and pick an exercise. Check what it prints.
2. Open `http://localhost:3000` and choose **I'm an interviewer**.
3. In a second browser, open `http://candidate.localhost:3000` (use the `Dry run (candidate)` link that `make start` prints, it carries the private part).
4. Enter a name, pick an assistant on the candidate side, and check you see the same thing.
5. `make delete` removes the test candidate.

## Running the interview

- **Share the link** that `make start` prints, to the candidate only. It has a private part that is new for every interview and stops working at the next `make start`. Ask the candidate to share their screen as well.
- **You see what they see.** Their files, editor, terminal and assistant. Follow is off by default; turn it on to mirror their open file and scroll.
- **The candidate picks the assistant.** You see the choice once it is made. You cannot pick for them. In the terminal assistants (Claude Code and OpenCode) you see the same terminal and can type in it too, but nothing says who typed, so agree on that beforehand.
- **Phases.** Later phases start hidden, including from the candidate's assistant. Reveal them from the file tree, one by one or all at once.
- **Files you edit change live for the candidate.** Prefer the chat or your voice for hints.
- **If the chat stops working,** its panel is blurred for the candidate and you see the reason. Usually the login or the budget. Fix it and use **Check again**. A terminal assistant that cannot start shows the reason as text in its own panel, and in the picker, where only you see it.

## After

1. `make stop`.
2. `make export CANDIDATE=<name> EXERCISE=<id>` writes a zip with the code, every conversation and a `viewer.html`.
3. Ask your agent to run the `evaluate-candidate` skill on the zip.
4. `make delete` when you no longer need the candidate's work. Their folder holds their code and a copy of the OpenCode login.

## Something went wrong

| What you see | What to do |
|---|---|
| Port already in use | `make stop`, then try again. |
| `make start` says a step failed | Read the message, fix it, run `make start` again. Logs are in `.logs/`. |
| "The AI assistant is not working" (the chat) | Usually the login or the budget. Check the account, then **Check again**. |
| A candidate cannot open the link | It must be the whole link, including the part after the `#`. Send it again from `make start`. |
| Claude Code or OpenCode is greyed out | Run `make config CHECK=1` to see what is missing. |

## Reading more

| What | Where |
|---|---|
| Everything else about the tool | [details.md](details.md) |
| What is protected, and what is not | [SECURITY.md](../SECURITY.md) |
| Understand or change the code | [AGENTS.md](../AGENTS.md) |
| Write an exercise | [CONTRIBUTING.md](../CONTRIBUTING.md) |
