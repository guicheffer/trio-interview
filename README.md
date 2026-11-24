# Trio Interview

Trio Interview (say it "TREE-oh IN-ter-vyoo") is a free and open source way to run live coding interviews in the browser, where you run it on your own machine, send the candidate a link, and both of you work in the same editor, terminal and preview while an AI assistant helps the candidate in plain sight of the interviewer. The name is the three of you in one session: the interviewer, the candidate and the assistant.

There is no account to create, no seat to buy and no server of ours in the middle, because everything runs on the interviewer's machine and the only thing that leaves it is the link you share.

## Why this exists

Hosted interview tools such as [CoderPad](https://coderpad.io/), [HackerRank](https://www.hackerrank.com/) and [CodeSignal](https://codesignal.com/) run the room for you on their servers, and you can compare what they offer and what they ask for on their own sites. Trio Interview takes the other way, which is that the room runs on your machine, the code is open so that a company can read what it runs, change it and keep its exercises to itself, and there is nothing to subscribe to, because the tool is free and whatever it costs you is the assistant account you already pay for. The maintenance falls to the people who use it, and if you want to help, open an issue or a pull request.

Because it is your machine and your accounts, the assistant a candidate uses is paid for by the account you signed in with, so use one with a limit, and read [SECURITY.md](SECURITY.md) before a real interview, which says what is protected and what is not.

## What you get

A shared workspace shows files, an editor, a terminal and a live preview of the candidate's app, and the interviewer sees it as it happens, can follow along or look around, and can edit too, with cursors and typing visible on both screens. The candidate picks the assistant from what you allowed, either the chat or Claude Code or OpenCode running in a real terminal that you see too, and you release later phases of an exercise when the candidate is ready, while `make export` builds a zip with the code and every conversation that the `evaluate-candidate` skill turns into a review.

## Quick start

```bash
make install     # dependencies, and a check of Claude Code, OpenCode and the tunnel
make config      # which assistants, exercises and tunnel you allow (the first time)
make start       # pick an exercise, start everything and share the link
```

`make start` prints a link for the candidate that carries a private part, new for every interview, so an old link or a guessed address gets nothing.

## What you need

Node 25 (`nvm use` reads `.nvmrc`) and Claude Code signed in (`npm install -g @anthropic-ai/claude-code`, then run `claude` once), because both the chat and the Claude Code terminal run on it. OpenCode 2 is optional (`brew install anomalyco/tap/opencode-v2`, signed in to a provider once), and the version matters because the older install command gives version 1, which the terminal assistant does not support.

To share the link with someone who is not on your network you need a tunnel, and `make config` asks which one. With `ngrok` (`brew install ngrok`, then a free account and `ngrok config add-authtoken <token>`, once) the address stays the same between interviews and every assistant works, while with `cloudflared` (`brew install cloudflared`) there is no account, the address is new each time, and the chat does not get its live answers through it, so the candidate should pick Claude Code or OpenCode. `make config` checks what your choice still needs from you, and other tunnels have not been tried.

## Choosing what is allowed

`make config` checks what is installed, asks which assistants, exercises and tunnel you allow, and writes `interview.config.yaml`, which git ignores. Run it again whenever you like, edit the file by hand, or run `make config CHECK=1` to see what is ready without being asked anything, and without the file everything is allowed. It also offers the example exercises in `examples/`, copying one into `exercises/` when you say yes and leaving the example where it is.

## Exercises

| Exercise | What it is | Time |
| --- | --- | --- |
| `fibonacci` | One file and no app, a warm up | 20 min |
| `gearshare` (in `examples/`) | A neighbourhood lending app with React, Express and SQLite, in four phases: read the code, fix three bugs, add a feature, review it together | 60 min |

The interviewer's notes for each one are in [docs/interviewers/](docs/interviewers/README.md), outside the folder the candidate can read, and writing your own is covered in [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

Trio Interview is built to be used with care and is plain about where that care stops, so read [SECURITY.md](SECURITY.md) before a real interview, where each question (who can reach it, who can change what the assistants do, what they and the candidate's code can touch, what is stored, what leaves your machine) points at the part of the tool that answers it.

The frontend and backend listen on loopback only, with the tunnel as the single way in, every interview gets its own link with a private part, and the candidate's role is decided on the server, so the interviewer's routes answer 403 through the tunnel even with a forged forwarding header. The candidate chooses the assistant within what you allowed and the server enforces that, the terminal assistants run in a private configuration so none of your own setup comes along, file access stays inside the candidate's own folder, and candidate work stays on your machine in gitignored folders.

> [!WARNING]
> **This is a guard rail, not a sandbox.** A candidate's code runs as your user, the assistants are kept on the exercise by instructions and not by the operating system, and nothing filters what the candidate's code sends out. Run it on a machine and account without production credentials, supervise the interview and have the candidate share their screen. A virtual machine or a container is the stronger setup.

## How far to trust it

The protections hold up against an honest candidate and against a curious one, which is what a supervised interview needs, and they are not a promise against a determined attacker with time, a case that calls for a virtual machine or a container with an account that has no production access.

## More

[docs/details.md](docs/details.md) covers sharing, interviewer mode, hiding files, exporting and troubleshooting, and [AGENTS.md](AGENTS.md) is the guide for anyone changing the code.

## License

Copyright (C) 2026 guicheffer. Trio Interview is free software under the [GNU Affero General Public License, version 3](LICENSE), so you can use, study, change and share it, and if you run a changed version as a service that other people use over a network, the license asks you to offer them the source of your changes too.
