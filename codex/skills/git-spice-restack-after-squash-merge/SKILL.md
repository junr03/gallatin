---
name: git-spice-restack-after-squash-merge
description: Repair a `git-spice` stack in the `cloud` repo after a parent PR was squash-merged into `main`. Use when `git-spice` says a branch needs restack after GitHub squash merge, upstack branches still point at old hashes, or `git rebase` starts replaying inherited parent commits because they were "replaced with a single commit with a different hash".
---

# Git-Spice Restack After Squash Merge

Use this in `cloud` after a parent PR was squash-merged. `cloud` only allows squash merges, so this is a normal maintenance workflow, not an edge case.

Context: [git-spice limitation: squash merges restack the upstack](https://abhinav.github.io/git-spice/guide/limits/#squash-merges-restack-the-upstack). git-spice notes that upstack branches "need to be restacked" after squash merge because GitHub does not reconcile the new squashed commit with the old branch history.

## Preflight

Before rewriting anything, identify the stack relationship from `git-spice ls`.

1. Use `git-spice ls` as the source of truth for branch parent relationships in this workflow.
   - Do not reconstruct the chain from commit overlap, merge-bases, or `git-spice log long -a` display order.
2. Name the roles before running any rebase:
   - `merged_parent`: the branch whose PR was squash-merged into `main`
   - `survivor`: the branch the user still wants to keep and repair
   - `old_parent_tip`: the pre-rewrite tip of `merged_parent`
   - `squash_commit`: the landed squash commit on `main` that replaced `merged_parent`
3. If the branch you are fixing appears directly under `main` in `git-spice ls`, interpret that as:
   - its old parent has already landed on `main`
   - this branch should now have `main` as its parent
   - its commits still need to be rewritten so they apply cleanly on top of `main`
4. If `git-spice ls` shows:
   ```text
   survivor
   └─ merged_parent
      └─ main
   ```
   and `merged_parent` was squash-merged, the desired final stack is:
   ```text
   survivor
   └─ main
   ```
   Do not preserve `merged_parent` as a repaired empty base. It must be removed from git-spice tracking after `survivor` is replayed.
5. Identify the old parent tip that the branch was previously based on and the landed squash commit that replaced it on `main`.
6. If any branch is already mid-rebase, inspect its rebase metadata and create rescue refs first.

## Workflow

### Child Branch Whose Parent Was Squash-Merged

Use this path when the user is keeping an upstack branch but its direct parent was already squash-merged, for example:

```text
f/pickup
└─ f/timezone
   └─ main
```

If `f/timezone` was squash-merged, the final stack must be:

```text
f/pickup
└─ main
```

1. Create backup refs for `merged_parent` and every surviving upstack branch before rewriting anything.
2. Optionally replay `merged_parent` onto `squash_commit` only as a temporary aid for conflict resolution or duplicate-patch detection. This branch is not the final base.
3. Rebase `survivor` directly onto current `main`, using the frozen backup of `merged_parent` as the cut point:
   - `GIT_EDITOR=true git -C <survivor-worktree> rebase --onto main backup/<merged_parent>-<stamp>`
4. If the rebase stops on inherited parent commits that are already present through the squash commit, skip them.
5. If the rebase stops on a real survivor commit, resolve conflicts against current `main` and preserve only survivor-branch edits.
6. Stage conflict resolutions with `git add`, then continue.
7. Reset git-spice metadata so the merged parent is no longer in the stack:
   - `git-spice branch untrack <merged_parent>`
   - `git-spice branch track --base main <survivor>`
8. Remove the squash-merged parent branch/worktree immediately after it is removed from git-spice tracking:
   - `wt remove <merged_parent>`
9. Verify `git-spice ls` shows `survivor` directly under `main`.

Wrong final state:

```text
survivor
└─ merged_parent
   └─ main
```

This means the squash-merged parent branch was accidentally preserved as a stack node. Fix the tracking with:

```bash
git-spice branch untrack <merged_parent>
git-spice branch track --base main <survivor>
```

After fixing the tracking, remove the merged parent locally with `wt remove`, not by deleting the worktree directory or branch by hand.

### Branch Itself Is The First Affected Branch

Use this path when the branch being repaired is the branch whose old parent was squash-merged, and the final stack should keep that branch.

1. Run the preflight above and identify the first affected branch from `git-spice ls`.
   - If the branch appears on `main`, treat it as the first affected branch whose old parent was squash-merged.
2. Create backup refs for every branch in the affected stack before rewriting anything.
3. Rewrite that first affected branch onto the landed squash commit:
   - `git rebase --onto <squash-commit> <old-parent-tip>`
4. Rebase each higher branch onto its repaired parent in order, using the frozen backup tip of the old parent branch as the cut point:
   - `GIT_EDITOR=true git -C <child-worktree> rebase --onto <parent-branch> backup/<parent-branch>-<stamp>`
5. Work in each branch's own worktree. Do not rely on `git-spice stack restack` across worktrees.
6. If a rebase stops on inherited parent commits that are already present on the new base, skip them.
7. If a rebase stops on a real child commit, resolve conflicts against the current base version and preserve only child-only edits.
8. Stage conflict resolutions with `git add`, then continue.
9. Verify the repaired parent chain with merge-base checks and clean worktrees before doing any final `git-spice` operation.
10. Check whether the first affected branch is still behind current trunk:
   - `git merge-base <first-affected> main`
   - `git rev-parse main`
11. If those differ, do a second pass that rebases the repaired stack from `<squash-commit>` onto current `main`, then replay the upstack branches again using fresh backup refs.
12. Before using `git-spice` for a final trunk restack or status check, confirm in `git-spice ls` that the first affected branch now sits under the expected parent.
   - If the first affected branch should now be on `main`, make sure `git-spice` tracks it that way.
13. Only then verify the final state with `git-spice ls`, merge-base checks, and clean worktrees.

## Rules

- Use `git-spice ls` as the authority for branch parent relationships in this workflow.
- Never infer the stack chain from repeated commit subjects, overlapping diffs, or `git-spice log long -a` display order.
- If the branch being repaired is shown on `main` in `git-spice ls`, treat that as "its parent was merged and this branch now belongs on main, but its commits still need repair".
- If the branch being repaired is upstack from a squash-merged parent, preserve the survivor branch and remove the merged parent from git-spice tracking. Do not leave an empty repaired parent branch between the survivor and `main`.
- After removing a squash-merged parent from git-spice tracking, run `wt remove <merged_parent>` to remove its local branch/worktree.
- Remove local stack branches/worktrees with `wt remove`; do not use manual directory deletion or ad hoc `git branch -D` cleanup for this workflow.
- Backup first. Use timestamped refs like `backup/f-rnum-20260325_stack_repair`.
- If a branch is already mid-rebase, add rescue refs for both the detached `HEAD` and the pre-rebase branch tip.
- Use the backup refs as the stable rebase cut points. Do not recompute cut points from current merge-bases after rewriting parents.
- Treat squash repair and trunk catch-up as separate checks. Rebasing onto the landed squash commit repairs the broken parent chain, but the bottom branch may still need a second restack onto current `main`.
- Before running `git-spice branch restack` after manual rebases, confirm in `git-spice ls` that the first affected branch is tracked against the expected base. If a branch that should now be on `main` is still tracked under the old parent, fix tracking first with `git-spice branch track --base main <first-affected>`.
- Use `GIT_EDITOR=true` for non-interactive `rebase --continue` in environments where the default editor can crash.
- If a zero-byte `index.lock` is left behind in a worktree and no Git process is using it, remove it and retry.
- For generated files with conflicts, keep the existing generated file and regenerate later.
- In conflict resolution, prefer the current base branch's squashed result, then layer child-only changes on top.

## Minimal Command Pattern

### Surviving child whose parent was squash-merged

```bash
# 0. Identify the stack from git-spice before touching history.
git-spice ls

# Example roles:
#   merged_parent=f/timezone
#   survivor=f/pickup
#   final desired stack: f/pickup -> main

# 1. Backup the affected branches.
stamp=$(date +%Y%m%d_%H%M%S)_stack_repair
for b in f/timezone f/pickup; do
  git branch "backup/${b//\//-}-$stamp" "$b"
done

# 2. Replay the survivor directly onto current main.
GIT_EDITOR=true git -C /path/to/cloud.f-pickup rebase --onto main "backup/f-timezone-$stamp"

# 3. Remove the merged parent from git-spice metadata and track the survivor on main.
git-spice branch untrack f/timezone
git-spice branch track --base main f/pickup

# 4. Remove the squash-merged parent branch/worktree.
wt remove f/timezone

# 5. Verify the final stack is f/pickup -> main, not f/pickup -> f/timezone -> main.
git-spice ls
```

### Branch itself should remain in the stack

```bash
# 0. Identify the stack from git-spice before touching history.
git-spice ls

# 1. Backup the proven stack
stamp=$(date +%Y%m%d_%H%M%S)_stack_repair
for b in f/rnum f/ref f/pickup; do
  git branch "backup/${b//\//-}-$stamp" "$b"
done

# 2. Repair the first affected branch
git -C /path/to/cloud.f-rnum rebase --onto <squash-commit> <old-parent-tip>

# 3. Rebase each higher branch in its own worktree
GIT_EDITOR=true git -C /path/to/cloud.f-ref rebase --onto f/rnum backup/f-rnum-$stamp
GIT_EDITOR=true git -C /path/to/cloud.f-pickup rebase --onto f/ref backup/f-ref-$stamp

# 4. If the repaired bottom branch is still behind current main,
# do a second pass onto current trunk with fresh backups.
restack_stamp=$(date +%Y%m%d_%H%M%S)_main_restack
for b in f/rnum f/ref f/pickup; do
  git branch "backup/${b//\//-}-$restack_stamp" "$b"
done
git -C /path/to/cloud.f-rnum rebase --onto main <squash-commit>
GIT_EDITOR=true git -C /path/to/cloud.f-ref rebase --onto f/rnum backup/f-rnum-$restack_stamp
GIT_EDITOR=true git -C /path/to/cloud.f-pickup rebase --onto f/ref backup/f-ref-$restack_stamp

# 5. Before using git-spice again, confirm the tracked base is correct.
git-spice ls
git-spice branch track --base main f/rnum
```

## Verification

- For a surviving child, `git-spice ls` must not show the squash-merged branch between the survivor and `main`.
- For a surviving child, the squash-merged parent branch/worktree was removed with `wt remove`.
- For a surviving child, `git log --oneline main..<survivor>` shows only survivor commits, not commits from the squash-merged parent.
- For a surviving child, `git merge-base <survivor> main` equals `git rev-parse main`.
- For a branch that itself remains in the stack, `git log --oneline main..f/rnum` shows only the real branch commits.
- For a branch that itself remains in the stack, `git merge-base f/rnum main` equals `git rev-parse main` after any required trunk catch-up pass.
- For each pair, `git merge-base <child> <parent>` equals `git rev-parse <parent>`.
- `git-spice ls` shows the repaired chain under the correct parent stack.
- If the first affected branch is fully repaired, `git-spice log long -a` shows `needs push`, not `needs restack`.
- All affected worktrees are clean.
- No affected worktree has `rebase-merge` or `rebase-apply` left behind.
