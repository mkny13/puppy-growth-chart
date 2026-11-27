---
name: lesson-cancellation-delegation
description: When guarding an async workflow with a cancellation check, wrap or pass the cancellation guard into delegated subroutines that update state so delayed operations do not perform post-cancellation updates.
metadata:
  mahler-id: 1
  created: "2026-11-27"
  updated: "2026-11-27"
  source: "#83"
---

# Cancellation in Delegated Async Routines

When protecting an async workflow against updates after cancellation (e.g., a React component unmounting during an in-flight operation), guarding only the top-level `await` calls is insufficient if the workflow delegates tasks to helper subroutines that perform state updates.

## Guideline
- If a delegated helper routine updates external state (such as UI setters or status hooks), ensure state updates are suppressed when cancelled:
  1. Pass wrapped state callbacks that check the cancellation predicate before updating state, or
  2. Provide the cancellation check directly to the subroutine so it can abort state changes after any internal `await` (including on rejection/catch branches).
- Suppress both success and error/offline state transitions when the calling context has been cancelled.
