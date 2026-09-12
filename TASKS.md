# TASKS.md

## Dispatch log

**2026-09-12** — investigated the long-unmerged remote branch
`claude/dog-growth-projection-y36jml` to decide whether it had anything worth
pulling into `main` before deleting it. Conclusion: no, it's fully
superseded.

- `src/GrowthChart.jsx` is byte-identical between `origin/main` and the
  branch tip — nothing left to port.
- All three feature commits on the branch are already in `main`, just
  reworded/reworked:
  - "Anchor adult-weight projection to a breed maturity prior" landed as
    `cab76f9` "...size-based maturity prior" via [PR #3](https://github.com/mkny13/puppy-growth-chart/pull/3).
  - "Show projection ranges as text and auto-scale y-axis to the visible
    band" and "Replace static 'calibrates at 14w' text with latest
    measurement date" are both literal ancestors of current `main`, not even
    reworded.
- `data/weights.json` on the branch stops at week 25 (Leia 25.8, Luke 37.5);
  `main`'s goes through week 29+ — `main` is strictly newer and more
  complete.

Remote branch `claude/dog-growth-projection-y36jml` deleted as a result —
its content isn't missing, it's already landed under different wording.
