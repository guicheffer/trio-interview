# Security

What protects the tool, and what does not. For interviewers, and for anyone reviewing the tool.

## What it is

This is not a hosted service. There is no server, no cloud deployment and nothing listening on a network. It is a local tool. The interviewer runs it on their own machine and shares one link with the candidate, who works in the browser (editor, terminal, AI chat). The AI assistant is one of three, chosen by the candidate from what the interviewer allowed: the chat (the Claude Code CLI, started on the interviewer's machine for each message), or Claude Code or OpenCode running in a terminal in the page. All of them run on the interviewer's machine with the interviewer's own login, so the interviewer's account pays for them. Candidate work stays in `.solutions/` (gitignored) on that machine. The tool sends no telemetry.

## What is in place

- **Network.** Frontend and backend are bound to loopback, so the tunnel is the only way in. CORS allows the app's own origin only.
- **Interview link.** The tunnel address is not a secret and may repeat (a free ngrok account always gets the same one). What protects the interview is a private part in the link, made by `make start` for every interview, kept only in the environment of the running servers and never written to disk. It rides after a `#`, so it is not sent to any server or written in a log. The page trades it once for an HttpOnly cookie, and the servers answer a candidate (API, WebSockets, preview) only with that cookie. An address on its own, a link from an earlier interview, or a guess gets a 401. The interviewer on `localhost` is not asked for it. Running the servers without `make start` (plain `npm run dev`) turns this off.
- **Roles.** `localhost` is the interviewer, the tunnel is a candidate. Interviewer endpoints (candidate list, preview ports, workspace reset, hidden files) answer 403 to candidates, and a forged forwarding header does not change that (the role reads the last entry, the one the nearest proxy wrote; checked with a forged header through Next.js and with ngrok). A candidate screen can start its own workspace but cannot switch the interview to a folder that already belongs to someone else. Requests to the interviewer side must come from the app itself: another site's Origin, a cross-site fetch or a cross-site WebSocket is refused.
- **Candidate code in the interviewer's browser.** The interviewer's preview frame loads the candidate's app from port 3099, a second port of the same server that only serves `/preview/`. A different port is a different origin, so a page the candidate wrote cannot read the interviewer's API or page, and the interviewer's powers are not granted on that port. It is the same site, so the app's own cookies (a login) still work. Port 3099 listens on this machine only.
- **Files.** Paths resolve inside the candidate's own folder, symlinks included, for reads and writes, and the file routes refuse to work without an active candidate. Locked files are read only on the server, however the path is written (`./`, `../`, case). Hidden files are not in the candidate's folder at all and cannot be recreated by the candidate.
- **Names.** Candidate names and exercise ids are plain names only (letters, digits, `_`, `-`, `.`), since they become folders.
- **Exercise apps.** The exercise dev server and API listen on `127.0.0.1` only; the platform proxies them.
- **Terminal.** Only allowlisted programs start, paths outside the exercise are refused, and the shell gets a reduced environment without tokens.
- **AI assistant.** No MCP servers, browser or skills. The system prompt keeps it to the exercise: it steers away from questions about the machine, accounts, tokens, the interviewer or its own instructions, without discussing its rules, and it starts with an overview of the project so it needs no exploration. Spending is whatever the interviewer's account allows, so use an account with a limit.
- **Who chooses the assistant.** The candidate picks, the interviewer only watches. The server refuses the interviewer's choice (403) and refuses a tool the interviewer did not allow in `interview.config.yaml`, however the request is made; hiding a button is not what enforces it. The chat is always allowed, so a candidate is never left without an assistant. The reason a tool cannot start (login, budget, install) is shown to the interviewer only.
- **Terminal assistants (Claude Code and OpenCode).** Each runs in a real terminal on the server, one per candidate and exercise, and every screen attached to it sees the same terminal. Each gets a private configuration folder next to the candidate's work, so nothing of the interviewer's own setup comes along: no status line, hooks, plugins, skills, MCP servers or commands. Only the login is copied in (the provider the interviewer already uses), and only from the interviewer's own configuration or environment. The folders are created with the login file readable by the owner only. Claude Code starts with `--strict-mcp-config`, `--no-chrome` and the same blocked tools as the chat; OpenCode starts with `--standalone` (so it does not attach to the interviewer's background service), ignores a project configuration file written by the candidate (checked: without this, a candidate's `opencode.json` changes the model and can add tools) and has web fetch, web search, image generation and sub agents removed.
- **Settings file.** `interview.config.yaml` is local and gitignored. A missing or broken file allows everything, so it never stops an interview. It decides which assistants are offered and which exercises `make start` lists. Candidates are never sent the file.
- **Code quality.** Type check, lint and tests run on every pull request, including tests that try to break the role and tool rules.

## Limits

1. **The candidate's code runs as the interviewer's user.** The terminal checks the first word of a command, not what the program does. It is a guard rail, not a sandbox.
2. **The assistant is confined by instructions, not by the operating system.** It can be talked into reading outside the folder by a determined candidate. This holds for the terminal assistants too: Claude Code and OpenCode can run shell commands as the interviewer's user, and a provider can add a web search tool of its own that a client side setting does not remove. In testing, both refused to search the web when the interview rules were loaded, which is the instruction doing its job, not a block.
3. **No egress filtering.** The candidate's code can reach the internet.
4. **The link is the only secret.** There is no login. Whoever has the full link during the interview can open the candidate's workspace, so send it only to the candidate. It stops working at the next `make start`.
5. **Role relies on the tunnel's forwarding headers.** Verified with ngrok. Other tunnels have not been verified, and `cloudflared` quick tunnels were found not to deliver the chat stream. The terminal assistants use a WebSocket and were tested on `localhost` and with the page's own candidate address, not through every tunnel.
6. **The terminal assistants run with permission prompts off.** They edit and run things without asking, the same as the chat, because a prompt nobody is watching would stop the candidate. The folder and the supervision are what limit them.
7. **The OpenCode login is copied into a folder on this machine.** The private folder under `.solutions/` holds a copy of the provider login, and it is not encrypted (the file is readable by its owner only). Delete a candidate with `make delete` when the interview is done.

## How we run it

Interviews are supervised and the candidate shares their screen. Use a machine and account without production credentials. A dedicated account, VM or container is the stronger setup if the limits above are not acceptable.

## Protocols this covers

A short list of what the tool is checked against, so a reviewer can find the part that answers each question.

| Question | Where it is answered |
| --- | --- |
| Who can reach it? | Network, Interview link, Roles |
| Who can change what the AI does? | Who chooses the assistant, Settings file |
| What can the AI and the candidate's code touch? | Files, Terminal, Terminal assistants, Limits 1 to 3 |
| What leaves the machine? | Nothing except the calls the assistants make to their provider and the tunnel. No telemetry. Limit 3 covers what candidate code can send. |
| What is stored and for how long? | Candidate work in `.solutions/` (gitignored), the provider login copy (Limit 7) |
| How is it checked? | Type check, lint, tests that try to break the role and tool rules, a code scan and a secret scan are not part of this repository, so run your own before you publish a change. |

### Reporting a problem

Open a private security advisory on the repository, or contact the maintainer, with the steps and what you saw, not a working exploit. Do not post an interview link or a login key anywhere public: a link only stops working at the next `make start`.
