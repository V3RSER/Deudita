# Optimization & Execution Guidelines for this Next.js App

## 1. Performance: Avoid Latency & Timeouts

- **Exclude build/dependency folders from searches**: always exclude `.next`, `dist`, and `node_modules` (e.g. `--exclude-dir={.next,node_modules,dist}`). Searching minified build chunks locks the execution buffer with megabyte-long single strings.
- **Atomic single-pass edits**: read the target file once and perform all edits in that same turn. Avoid reading/editing the same file 3+ times across separate turns.
- **Verify fast, compile last**: use `lint_applet` for quick syntax/import checks during development. Reserve full compilation for the end of the task to avoid 80+ second build locks.

## 2. Routing Conventions (App Router)

- This project uses route groups `(dashboard)` and dynamic segments `[id]`, `[groupId]`.
- Never URL-encode these paths (no `%28dashboard%29`, no `%5Bid%5D`). Use literal paths: `app/(dashboard)/...`, `app/api/groups/[id]/...`.
- Do not rename these routing folders.

## 3. Security: Fail-Fast, No Privilege Escalation

- **No placeholder/dummy credentials**: never hardcode fallback URLs, keys, or JWTs (e.g. `'https://placeholder-project.supabase.co'`, `'eyJhbGci...placeholder'`).
- **No silent fallback to lower privileges**: never fall back from a service/admin key to an anon key (`SUPABASE_SERVICE_ROLE_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY`). Admin/service clients must never silently degrade to public permissions.
- **No arbitrary `|| ""` or similar fallbacks** in core logic, database helpers, or state managers without an explicit, justified purpose.
- **Fail fast and explicitly**: if a required env var or config value is missing, throw immediately (`throw new Error(...)`) rather than masking the root cause.
- **Never bypass RLS with admin/service-role clients** (`adminDb`, `createAdminClient`, `lib/supabase/admin.ts`) to work around access restrictions or patch design flaws.
- **For public/pre-auth flows** (invite links, group previews, etc.), solve access properly — store the necessary metadata on the invite/record itself or configure correct RLS policies — instead of escalating privileges.

## 4. Frontend UX & Copy

- Keep user-facing copy natural, polished, and human-centered.
- Never leak internal implementation details, stack traces, or backend jargon into the UI.
- Prioritize fluid, intuitive workflows and smooth visual states.