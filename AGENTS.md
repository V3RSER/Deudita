# Optimization & Execution Guidelines for this Next.js App

## Strict Execution Rules to Prevent Latency & Timeouts
1. **Never Search Inside `.next` or `node_modules`**:
   - Always exclude `.next`, `dist`, and `node_modules` from file searches (e.g. `--exclude-dir={.next,node_modules,dist}`).
   - Searching minified build chunks locks the execution buffer with megabyte-long single strings.

2. **Folder Path Convention (Do Not URL-Encode)**:
   - This project uses Next.js App Router route groups `(dashboard)` and dynamic routes `[id]`, `[groupId]`.
   - Never encode paths as `%28dashboard%29` or `%5Bid%5D`. Use exact literal paths: `app/(dashboard)/...` and `app/api/groups/[id]/...`.
   - Do NOT rename these Next.js routing folders.

3. **Atomic Single-Pass Edits**:
   - Read the target file once and perform full edits in a single turn.
   - Avoid reading and editing the same file 3+ times across separate turns.

4. **Fast Verification**:
   - Use `lint_applet` for rapid syntax and import verification.
   - Only run full compilation at the end of task completion to avoid 80+ second build locks.

5. **Code & UX Quality**:
   - Do NOT hardcode arbitrary fallback values like `|| ""` in core logic without purpose.
   - Keep user-facing copy natural and polished without exposing technical internals.
