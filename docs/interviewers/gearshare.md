# GearShare, interviewer guide

A neighbourhood lending app. Four phases, about 60 minutes. Phases 2 to 4 are held back until you reveal them. **Keep this file out of the candidate's folder.** Everything under `exercises/` can be read by the candidate and by their assistant.

## Run it

```bash
make start      # pick gearshare
```

The app starts by itself. Demo users: ana, ben, chloe, dev (all `@example.test`, pick one on the login page).

## Phase 1, comprehension (~5 min)

No code change. Listen for: the entry points (`index.ts` starts `app.ts`), that login is a cookie holding the user id (a demo, not safe), that the rules live in `pricing.ts` and `loans.ts` and not in the routes, and the life of a loan (requested, approved, active, returned, plus declined and cancelled).

Good questions: "Where would you look to change how a price is worked out?" "Is the login safe? Why or why not?"

## Phase 2, bug fixing (~15 min)

`npm test` starts with 5 failing tests. There are three bugs, each with a one line cause. The candidate should fix the code, not the tests.

| # | Symptom | Where | Cause | Fix |
|---|---------|-------|-------|-----|
| 1 | A booking cannot start the day another one ends | `pricing.ts`, `rangesOverlap` | `<=` where it should be `<` | `aStart < bEnd && bStart < aEnd` |
| 2 | A 7 day loan gets no discount | `pricing.ts`, `quote` | `days > 7` where it should be `days >= 7` | `days >= 7` |
| 3 | The owner cannot cancel an approved loan | `loans.ts`, `changeStatus` | The cancel check only lets the borrower through | `loan.borrower_id !== actorId && item.owner_id !== actorId` |

Bugs 1 and 2 each fail two tests, bug 3 fails one. Watch for: reading the failure before changing anything, deciding whether the test or the code is wrong, a small fix, and checking the fix in the page as well.

A common trap: making the test pass by loosening it. A weaker answer changes the expected value in the test.

## Phase 3, feature (~20 min)

"Owners can block dates." There is no right design. Look for whether they reuse `rangesOverlap` and `RuleError`, where they put the check (both when a loan is created and when it is approved, because a block can be added after the request), and whether the request form tells the borrower before they send.

Edge cases to prompt: a block that touches a loan's end date, someone blocking dates on another person's item, a block added over an already approved loan.

## Phase 4, pair review (~15 min)

Read the diff together. Things worth finding: the approve step and the create step each doing their own overlap check, no test for a stranger, and two requests arriving at the same time (the check and the insert are not one step). Whether the AI written parts were read or trusted.

## What good looks like

They read before they change, they check what the assistant says against the code, they keep changes small, and they can explain every line they keep.

## Resetting

`make delete` removes a candidate and their folder.
