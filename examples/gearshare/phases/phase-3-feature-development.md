# Phase 3: Feature Development

**Suggested time**: ~20 minutes

---

## Objective

Owners want to block dates when they will not lend an item (a holiday, a repair). Add that.

---

## Requirements

1. An owner can add and remove a blocked date range for their own items.
2. Nobody can request or be approved for dates that overlap a blocked range.
3. The request form in the page tells the borrower, before they send, when the dates are blocked.
4. Add tests for the rules you add.

Decide yourself where it lives in the database and how the API looks. Say what you chose and why.

---

## Success Criteria

- Splits the work into steps and builds it in the right order
- Reuses what exists (the overlap check, the error type) instead of duplicating it
- Handles the edge cases: touching dates, a block that starts the day a loan ends, someone else's item
- Tests the behaviour, not the implementation
