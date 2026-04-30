---
name: Auto git push after every task
description: Always commit and push to origin after completing any code change
type: feedback
---

After finishing any code change, always stage, commit, and push to origin without waiting for the user to ask.

**Why:** User explicitly requested this to save the extra step every time.

**How to apply:** At the end of every task that modifies files — commit the relevant files with a descriptive message and run `git push`. No need to ask for confirmation first.
