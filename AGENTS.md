# Optimization & Execution Guidelines for this Next.js App

## 1. Build & Compilation Policy (ABSOLUTE RULE: ZERO MANUAL BUILDS)

- **DEV SERVER IS ALWAYS RUNNING**: The container already runs `npm run dev` continuously in the background. Edits to any file are hot-reloaded automatically by Next.js in ~1-2 seconds (just like in a local terminal: `✓ Compiled in 1358ms`).
- **NEVER RUN `compile_applet`**: `compile_applet` triggers a full production `npm run build` from scratch, which wipes caches, freezes the container for minutes, and is completely unnecessary during development. It is STRICTLY FORBIDDEN to call `compile_applet` unless the user literally types "compila el proyecto", "haz un build", or "ejecuta compile_applet".
- **NEVER RUN MANUAL BUILD COMMANDS**: Never run `npm run build`, `next build`, or background compilation tasks via `run_command`.
- **Fast validation only**: If you need to verify imports or syntax, only use `lint_applet` (completes in < 2 seconds without building).
- **Instant Turn Completion**: Once file edits are saved, END the turn immediately. Do not call any build tools, timers, or background checks. The dev server handles compilation automatically.

## 2. Performance & Token Economy: Avoid Latency, Timeouts & Token Floods

- **FORBIDDEN: Root directory (`.`) searches (`grep`, `find`, `ls -R`)**: NEVER run `grep ... .` or `find . ...` targeting the root directory without strictly pruning ignored folders. Scanning the root traverses `.next`, `node_modules`, `.git`, or build caches, dumping tens of thousands of characters of minified code, vendor scripts, and source maps into the token context.
- **Source-directed searches only**: All searches (`grep`, `find`) must explicitly target application source directories:
  `grep -rn "pattern" app/ components/ lib/ supabase/` or `find app components lib supabase ...`
- **Prioritize native file reading tools**: Use `view_file` and `list_dir` instead of shell commands.
- **When directory exclusions are required**: If you must exclude directories in shell tools, explicitly prune `node_modules`, `.next`, `dist`, and `.git` (e.g. in `grep`: `--exclude-dir=.next --exclude-dir=node_modules --exclude-dir=dist`, NEVER brace expansion `{...}`).
- **No generic wildcards**: Avoid broad patterns like `*script*` or `*test*` that match hundreds of vendor files.
- **Atomic single-pass edits**: Read the target file once and perform all edits in that same turn.
- **No background command loops**: Never spawn background loops or timers waiting on compilation processes.

## 3. Routing Conventions (App Router)

- This project uses route groups `(dashboard)` and dynamic segments `[id]`, `[groupId]`.
- Never URL-encode these paths (no `%28dashboard%29`, no `%5Bid%5D`). Use literal paths: `app/(dashboard)/...`, `app/api/groups/[id]/...`.
- Do not rename these routing folders.

## 4. Security: Fail-Fast, No Privilege Escalation

- **No placeholder/dummy credentials**: never hardcode fallback URLs, keys, or JWTs (e.g. `'https://placeholder-project.supabase.co'`, `'eyJhbGci...placeholder'`).
- **No silent fallback to lower privileges**: never fall back from a service/admin key to an anon key (`SUPABASE_SERVICE_ROLE_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY`). Admin/service clients must never silently degrade to public permissions.
- **No arbitrary `|| ""` or similar fallbacks** in core logic, database helpers, or state managers without an explicit, justified purpose.
- **Fail fast and explicitly**: if a required env var or config value is missing, throw immediately (`throw new Error(...)`) rather than masking the root cause.
- **Never bypass RLS with admin/service-role clients** (`adminDb`, `createAdminClient`, `lib/supabase/admin.ts`) to work around access restrictions or patch design flaws.
- **For public/pre-auth flows** (invite links, group previews, etc.), solve access properly — store the necessary metadata on the invite/record itself or configure correct RLS policies — instead of escalating privileges.

## 5. Frontend UX & Copy

- Keep user-facing copy natural, polished, and human-centered.
- Never leak internal implementation details, stack traces, or backend jargon into the UI.
- Prioritize fluid, intuitive workflows and smooth visual states.