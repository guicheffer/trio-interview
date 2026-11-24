# Interviewer notes

For interviewers only. This folder is not part of any exercise, so a candidate's workspace, terminal and AI assistant never contain it. Keep it that way: do not move these files into `exercises/`.

How to run the tool itself is in the [interviewer guide](../interviewer-guide.md). This folder is about the exercises.

## Which exercise to use

| Exercise | Use it for | Time |
|---|---|---|
| [GearShare](gearshare.md) (in `examples/`, add it with `make config`) | A full interview: read the code, fix bugs, build a feature, review it | 60 min |
| [Fibonacci](fibonacci.md) | Trying the tool, demos, checking your setup | 20 min |

## Running an interview

Before:

1. `make install` once, then `make config` to choose what is allowed. Candidates spend your assistant's account, so check it has enough left.
2. `make start`, pick the exercise, open `http://localhost:3000` to confirm it loads.
3. Send the candidate the link that `make start` prints. Ask them to share their screen too, it is more real time than Follow.

During (about 60 minutes for GearShare):

| Time | Phase |
|---|---|
| 5 min | Intro and ice breaker |
| 5 min | Code comprehension |
| 15 min | Bug fixing |
| 20 min | Feature |
| 15 min | Pair review |

- Phases 2 to 4 are hidden from the candidate, including from their terminal and AI assistant. When they are ready, reveal the next file from the file tree ("Reveal all" shows everything at once).
- The candidate picks the assistant (the chat, Claude Code or OpenCode). You see the same screen, and in the terminal ones you see the same terminal.
- You see their editor, terminal and assistant live. Follow is off by default; turn it on to mirror their open file and scroll.
- Files you edit while the candidate is watching change live for them, so prefer the chat or your voice for hints.

After:

1. `make stop`, then `make export CANDIDATE=<name> EXERCISE=<id>`.
2. Ask your agent to run the `evaluate-candidate` skill on the zip for a summary of what was built, how far they got and how they used the assistant.
