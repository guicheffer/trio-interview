---
name: evaluate-candidate
description: Evaluate a candidate's exported solution, what they built, and how they used the AI assistant.
---

# Evaluate a candidate

Input: a candidate export from `make export` (a folder or the unzipped zip). It contains `code/`, `conversations/*.md`, `data.json` and `viewer.html`. If the user only names a candidate, run `make export CANDIDATE=<name> EXERCISE=<id>` first and use the newest folder in `exports/`.

Read in this order, then write the evaluation:

1. `code/description.md` and the phase files: what was asked, and in which phases the candidate got.
2. `code/`: compare with the exercise template in `exercises/<id>/` (use `git diff --no-index`) to see exactly what the candidate changed. Run the exercise tests when they exist.
3. `conversations/`: every chat with the assistant, in order.

Write a Markdown report (English, concise, no em dashes) with:

- **Summary**: 3 lines, how far they got and the overall impression.
- **What was done**: per phase, what works, what is missing, bugs left, with file references.
- **Code quality**: structure, naming, tests, edge cases, security issues.
- **AI usage**: how they prompted (specific or vague), whether they read and verified what the assistant wrote, whether they planned first, whether they ever contradicted or corrected the assistant, how much of the final code is theirs versus pasted. Note the models used and the number of chats.
- **Signals**: strengths and concerns, each with evidence (file, chat and message).
- **Open questions** worth asking in the debrief.

Be evidence based. Do not invent what you cannot see in the export. Do not give a hire or no hire verdict unless the user asks; give the signals. Save the report next to the export as `evaluation.md`.

Works the same with Claude Code, OpenCode or any agent that can read files: point it at this file and the export folder.
