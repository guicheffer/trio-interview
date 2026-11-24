# Phase 1: Code Comprehension

**Suggested time**: ~5 minutes

---

## Objective

Read the codebase and build a mental model of how it works before changing anything. Ask clarifying questions rather than immediately generating code.

---

## What to Explore

1. **Entry points**: how does the app start? Where do the client and the server meet?
2. **Login**: how does a user stay logged in? Where is that stored, and is it safe?
3. **Data flow**: how does an item get from the database to the screen?
4. **The life of a loan**: which states can a loan be in, who may move it, and where is that decided?
5. **Key files**: `src/server/loans.ts`, `src/server/pricing.ts`, `src/server/routes/`, `src/client/pages/`

---

## Success Criteria

- Builds a mental model of the system quickly
- Names the entry points, the contracts between client and server, and where the rules live
- Asks clarifying questions when something is unclear
- Uses the AI assistant to explore, and checks what it says against the code
