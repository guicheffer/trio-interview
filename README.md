# Trio Interview

Live coding interviews in the browser, with an AI assistant. You run it on your machine, the candidate opens a link. Nothing to install for them.

The name is the three of you in one session: the interviewer, the candidate and the assistant.

## What you get

- **A shared workspace.** Files, an editor, a terminal and a live preview. The interviewer sees the candidate's screen as it happens, can follow along or look around, and can edit too.
- **The candidate picks the assistant.** The chat, Claude Code or OpenCode, from what you allowed. Claude Code and OpenCode run in a real terminal, and you see the same terminal the candidate sees.
- **Phases you release.** Later parts of an exercise start hidden. Reveal them when the candidate is ready.
- **A record.** `make export` builds a zip with the code and every conversation, and the `evaluate-candidate` skill turns it into a review.

## Quick start

```bash
make install     # dependencies, and a check of Claude Code, OpenCode and the tunnel
make config      # which assistants and exercises you allow (the first time)
make start       # pick an exercise, start everything, share the link
```

`make start` prints the link to send the candidate. It carries a private part that is new for every interview, so an old link or a guessed address gets nothing.

## You need

- **Node 25.** `nvm use` reads `.nvmrc`.
- **Claude Code**, signed in (`npm install -g @anthropic-ai/claude-code`, then run `claude` once). The chat and the Claude Code terminal both run on it.
- **A tunnel to share the link.** `ngrok` is the one that is checked (`brew install ngrok`, then a free account and `ngrok config add-authtoken <token>`, once). Other tunnels may work, but they have not been tested. Quick tunnels from `cloudflared` were found not to deliver the chat stream.
- **OpenCode 2, optional.** `brew install anomalyco/tap/opencode-v2`, and sign it in to a provider once. The version matters: the older install command installs version 1, which the terminal assistant does not support.

Every message a candidate sends is paid for by the account your assistant is signed in to. Use an account with a limit.

## Choosing what is allowed

`make config` checks what is installed, asks which assistants and exercises you allow, and writes `interview.config.yaml`. Git ignores it. Run it again any time, edit the file by hand, or run `make config CHECK=1` to only see what is ready. Without the file everything is allowed.

It also offers the example exercises in `examples/`. Saying yes copies one into `exercises/`, and the example stays where it is.

## Exercises

| Exercise | What it is | Time |
| --- | --- | --- |
| `fibonacci` | One file, no app. A warm up. | 20 min |
| `gearshare` (in `examples/`) | A neighbourhood lending app: React, Express and SQLite. Four phases: read the code, fix three bugs, add a feature, review it together. | 60 min |

The interviewer's notes for each one are in [docs/interviewers/](docs/interviewers/README.md), outside the folder the candidate can read. To write your own, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

This tool is built to be used with care, and it is clear about where that care stops. Read [SECURITY.md](SECURITY.md) before a real interview. It lists what protects the tool, the protocols it is checked against, and the limits.

- Nothing listens on the network: the frontend and backend are bound to loopback, and the tunnel is the only way in.
- Every interview gets its own link with a private part. An address alone, or a link from an earlier interview, gets nothing, even if the tunnel address repeats.
- The candidate's role is decided on the server. Interviewer endpoints answer 403 through the tunnel, and a forged forwarding header does not change that.
- The candidate chooses the assistant, within what you allowed. The server enforces it, not only the page.
- The terminal assistants run in a private configuration, so none of your own setup (status line, hooks, plugins, MCP servers, commands) comes along. Only the login is copied in.
- File access is confined to the candidate's own folder, including through symlinks. Locked files are read only, and hidden files are not in the candidate's folder at all.
- The terminal only starts allowed programs, refuses paths outside the exercise and runs without your tokens in its environment.
- Candidate work stays on your machine, in gitignored folders.

> [!WARNING]
> **This is a guard rail, not a sandbox.** A candidate's code runs as your user, the assistants are kept on the exercise by instructions and not by the operating system, and nothing filters what the candidate's code sends out. Run it on a machine and account without production credentials, supervise the interview and have the candidate share their screen. A VM or container is the stronger setup. The full list of limits is in [SECURITY.md](SECURITY.md).

## More

[docs/details.md](docs/details.md) covers sharing, interviewer mode, hiding files, exporting and troubleshooting. [AGENTS.md](AGENTS.md) is the guide for anyone changing the code.
