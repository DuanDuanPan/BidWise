---
diff_output: '' # set at runtime
spec_file: '' # set at runtime (path or empty)
review_mode: '' # set at runtime: "full" or "no-spec"
---

# Step 1: Gather Context

## RULES

- YOU MUST ALWAYS SPEAK OUTPUT in your Agent communication style with the config `{communication_language}`
- The prompt that triggered this workflow IS the intent — not a hint.
- Do not modify any files. This step is read-only.

## INSTRUCTIONS

1. **First parse explicit structured fields from the invocation text if present.**
   - Look for lines such as:
     - `Skill: bmad-code-review`
     - `automation: non-interactive`
     - `review mode: ...`
     - `base branch: ...`
     - `spec file: ...`
     - `worktree: ...`
   - If an explicit `review mode:` field is present, treat it as authoritative and do not ask the user to restate it.
   - If an explicit `spec file:` field is present and the file exists, treat it as already provided context rather than asking again in step 4.
   - If `automation: non-interactive` is present, treat this run as orchestrated by another agent. Do not pause for optional confirmations once all required inputs are valid.
   - If an explicit field is present but invalid (for example, the file does not exist), ask only about that invalid field.

2. **Detect review intent from invocation text.** Check the triggering prompt for phrases that map to a review mode:
   - "staged" / "staged changes" → Staged changes only
   - "uncommitted" / "working tree" / "all changes" → Uncommitted changes (staged + unstaged)
   - "branch diff" / "vs main" / "against main" / "compared to {branch}" → Branch diff (extract base branch if mentioned)
   - "commit range" / "last N commits" / "{sha}..{sha}" → Specific commit range
   - "this diff" / "provided diff" / "paste" → User-provided diff (do not match bare "diff" — it appears in other modes)
   - When multiple phrases match, prefer the most specific match (e.g., "branch diff" over bare "diff").
   - **If a clear match is found or an explicit `review mode:` field is present:** Announce the detected mode (e.g., "Detected intent: review staged changes only") and proceed directly to constructing `{diff_output}` using the corresponding sub-case from instruction 4. Skip to instruction 5 when `spec file:` was already supplied and valid.
   - **If no match from invocation text, check sprint tracking.** Look for a sprint status file (`*sprint-status*`) in `{implementation_artifacts}` or `{planning_artifacts}`. If found, scan for any story with status `review`. Handle as follows:
     - **Exactly one `review` story:** Suggest it: "I found story {{story-id}} in `review` status. Would you like to review its changes? [Y] Yes / [N] No, let me choose". If confirmed, use the story context to determine the diff source (branch name derived from story slug, or uncommitted changes). If declined, fall through to instruction 3.
     - **Multiple `review` stories:** Present them as numbered options alongside a manual choice option. Wait for user selection. Then use the selected story's context to determine the diff source as in the single-story case above, and proceed to instruction 4.
     - **If no match and no sprint tracking:** Fall through to instruction 3.

3. HALT. Ask the user: **What do you want to review?** Present these options:
   - **Uncommitted changes** (staged + unstaged)
   - **Staged changes only**
   - **Branch diff** vs a base branch (ask which base branch)
   - **Specific commit range** (ask for the range)
   - **Provided diff or file list** (user pastes or provides a path)

4. Construct `{diff_output}` from the chosen source.
   - For **branch diff**: verify the base branch exists before running `git diff`. If it does not exist, HALT and ask the user for a valid branch.
   - For **commit range**: verify the range resolves. If it does not, HALT and ask the user for a valid range.
   - For **provided diff**: validate the content is non-empty and parseable as a unified diff. If it is not parseable, HALT and ask the user to provide a valid diff.
   - For **file list**: validate each path exists in the working tree. Construct `{diff_output}` by running `git diff HEAD -- <path1> <path2> ...`. If any paths are untracked (new files not yet staged), use `git diff --no-index /dev/null <path>` to include them. If the diff is empty (files have no uncommitted changes and are not untracked), ask the user whether to review the full file contents or to specify a different baseline.
   - After constructing `{diff_output}`, verify it is non-empty regardless of source type. If empty, HALT and tell the user there is nothing to review.

5. Ask the user: **Is there a spec or story file that provides context for these changes?**
   - If a valid `spec file:` field was already provided in the invocation text: set `{spec_file}` from that value, announce that the spec was supplied explicitly, and set `{review_mode}` = `"full"` without asking again.
   - If yes: set `{spec_file}` to the path provided, verify the file exists and is readable, then set `{review_mode}` = `"full"`.
   - If no: set `{review_mode}` = `"no-spec"`.

6. If `{review_mode}` = `"full"` and the file at `{spec_file}` has a `context` field in its frontmatter listing additional docs, load each referenced document. Warn the user about any docs that cannot be found.

7. Sanity check: if `{diff_output}` exceeds approximately 3000 lines, warn the user and offer to chunk the review by file group.
   - If the user opts to chunk: agree on the first group, narrow `{diff_output}` accordingly, and list the remaining groups for the user to note for follow-up runs.
   - If the user declines: proceed as-is with the full diff.

### CHECKPOINT

Present a summary before proceeding: diff stats (files changed, lines added/removed), `{review_mode}`, and loaded spec/context docs (if any).

- If `automation: non-interactive` is present and all required inputs were validly resolved: print the summary, state that automation mode is enabled, and continue immediately to the next step without waiting.
- Otherwise: HALT and wait for user confirmation to proceed.


## NEXT

Read fully and follow `./step-02-review.md`
