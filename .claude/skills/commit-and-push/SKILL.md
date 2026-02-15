---
description: Create clean, well-structured git commits and push to remote
disable-model-invocation: true
---

# Git Commit & Push

Create well-structured git commits for the current changes and push to remote.

## Process

### Step 1: Assess the Current State

Run these in parallel:
1. `git status` — see all untracked and modified files (never use `-uall`)
2. `git diff` — see unstaged changes
3. `git diff --cached` — see staged changes
4. `git log --oneline -10` — see recent commit style

### Step 2: Present the Full Plan for Batch Approval

Analyze all changes and present a **single overview** for the user to approve or adjust. If changes span multiple unrelated areas, split them into logical commits. Present the entire plan at once like this:

```
Here's my proposed commit plan:

### Commit 1: [message]
- `path/to/file1.swift` (modified)
- `path/to/file2.swift` (deleted)

### Commit 2: [message]
- `path/to/file3.js` (modified)
- `path/to/file4.js` (new)

...

Ready to execute, or want changes?
```

Each commit should have:
- A concise message (1-2 sentences) that focuses on the **why**, not the **what**
- A list of files with their change type (modified, deleted, new)
- Logical grouping by area/feature

If all changes are related, propose a single commit. Wait for the user to approve the full plan before staging anything.

### Step 3: Execute All Commits

Once the user approves (or adjusts) the plan:

1. For each commit in order:
   - Stage the files by name
   - Commit using a HEREDOC:
     ```bash
     git commit -m "$(cat <<'EOF'
     Your commit message here.

     Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
     EOF
     )"
     ```
2. After all commits, push to remote: `git push`
   - If no upstream is set, use `git push -u origin <branch-name>`
3. Run `git status` to verify clean state
4. Show a summary of all commits pushed

## Rules

- **Never** use `git add -A` or `git add .` — always add specific files
- **Never** amend a previous commit unless explicitly asked
- **Never** skip hooks (`--no-verify`)
- **Never** force push (`--force`) — warn the user if they ask for this
- **Never** commit files that look like secrets (`.env`, credentials, tokens)
- If a pre-commit hook fails, fix the issue, re-stage, and create a **new** commit (don't amend)
- Always use a HEREDOC for the commit message to preserve formatting
