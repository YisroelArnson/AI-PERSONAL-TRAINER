---
description: Create a clean, well-structured git commit and push to remote
disable-model-invocation: true
---

# Git Commit & Push

Create a well-structured git commit for the current changes and push to remote.

## Process

### Step 1: Assess the Current State

Run these in parallel:
1. `git status` — see all untracked and modified files (never use `-uall`)
2. `git diff` — see unstaged changes
3. `git diff --cached` — see staged changes
4. `git log --oneline -10` — see recent commit style

### Step 2: Present Changes for Review

Summarize what you found:
- **Staged changes** (if any)
- **Unstaged changes** grouped by area/feature
- **Untracked files**
- **Deleted files**

If changes span multiple unrelated areas, suggest splitting into separate commits and ask the user how they'd like to group them.

### Step 3: Get User Approval on Scope

Ask the user:
- Which files to include in this commit (or confirm "all")
- Whether to split into multiple commits
- Wait for explicit approval before staging anything

### Step 4: Stage and Commit

1. Stage the approved files by name (avoid `git add -A` or `git add .`)
2. Draft a concise commit message (1-2 sentences) that focuses on the **why**, not the **what**
3. Follow the commit style from the repo's recent history
4. Present the commit message for approval
5. Commit using a HEREDOC:

```bash
git commit -m "$(cat <<'EOF'
Your commit message here.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

6. Run `git status` after to verify success

### Step 5: Push to Remote

1. Push to the current branch's upstream: `git push`
2. If no upstream is set, use `git push -u origin <branch-name>`
3. Confirm the push succeeded and report the result

## Rules

- **Never** use `git add -A` or `git add .` — always add specific files
- **Never** amend a previous commit unless explicitly asked
- **Never** skip hooks (`--no-verify`)
- **Never** force push (`--force`) — warn the user if they ask for this
- **Never** commit files that look like secrets (`.env`, credentials, tokens)
- If a pre-commit hook fails, fix the issue, re-stage, and create a **new** commit (don't amend)
- Always use a HEREDOC for the commit message to preserve formatting
