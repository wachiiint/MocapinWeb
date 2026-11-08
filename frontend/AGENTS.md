# Frontend Rules (`frontend/`)

This file defines the strict rules for all code inside `frontend/`. Every agent working on the React application must follow these rules alongside the root [AGENTS.md](../AGENTS.md), [docs/architect.md](../docs/architect.md), and [docs/wireframes/AGENTS.md](../docs/wireframes/AGENTS.md).

---

## 1. Tech Stack & Folder Boundaries

1. **Single Vite SPA (No Next.js / No SSR)**:
   - Stack: **React + TypeScript + Vite + Tailwind CSS (shadcn/ui)**.
   - Do NOT use Next.js imports (`next/*`), Server Actions, or React Server Components.
2. **Folder Structure**:
   - `src/components/ui/` — Reusable shadcn/ui primitives.
   - `src/pose-check/` — In-browser live camera quality check (lighting, framing, extra person).
   - `src/pages/patient/` — Patient and caregiver screens (large-font accessible UI).
   - `src/pages/doctor/` — Doctor clinical workstation screens.
3. **Strict Dependency Control**:
   - Do not install new npm libraries (state managers, animation kits, icon packs, or UI frameworks) without explicit approval.

---

## 2. Architecture & Clinical Boundaries

1. **In-Browser Pose Check Is a Quality Gate Only**:
   - `src/pose-check/` only validates live camera readiness (framing, lighting, single person in frame) and renders a live guide overlay.
   - **Never** compute stored clinical metrics or joint angles in the browser. Server-side `pose-engine` (RTMPose) is the single source of truth for measurements.
2. **Zero Clinical Cutoffs in Frontend Code**:
   - Never hardcode clinical thresholds, MDC/MCID numbers, or scoring formulas in TypeScript. The Go API calculates and returns all scores and noise bands from the versioned config.
   - Never label video/pose results as "Sarcopenia" ([docs/clinical-rules.md](../docs/clinical-rules.md)).
3. **Presigned URL Video Flow**:
   - Never send raw video bytes through the Go API JSON endpoints.
   - Follow the lifecycle in [docs/architect.md](../docs/architect.md): request presigned PUT URLs from the API -> upload video directly to object storage -> notify API -> poll job status (`processing -> done / failed`).

---

## 3. React & Vite Best Practices (Adapted from `react-best-practices`)

1. **Eliminate Async Waterfalls**:
   - Run independent API or presigned-upload requests in parallel with `Promise.all` instead of sequential `await` statements.
2. **Derived State During Render (No `useEffect` Chains)**:
   - If a value can be computed from existing props or state, compute it directly during render.
   - Never use `useEffect` + `setState` to synchronize derived values.
3. **Bundle Hygiene (No Barrel Files, Lazy Heavy Views)**:
   - Import components and utilities directly from their source file. Do not create `index.ts` barrel files that re-export entire folders.
   - Use `React.lazy` + `<Suspense>` for heavy route views (such as the in-browser pose-check model or the doctor's 3D/biomechanics progress view).
4. **Safe Conditional Rendering & Polling**:
   - Use explicit booleans or ternaries (`count > 0 ? <Badge /> : null`) instead of `count && <Badge />` so `0` is never rendered as text.
   - Always clean up polling intervals and camera `MediaStream` tracks inside `useEffect` cleanup functions using `AbortController` or `clearInterval`.

---

## 4. UI & Role Accessibility Standards

1. **Clinical Aesthetic (Zero AI Slop)**:
   - Follow [docs/wireframes/AGENTS.md](../docs/wireframes/AGENTS.md): shadcn/ui Slate + Medical Teal palette, 1px `border-slate-200` cards, zero emojis, clean monochrome SVGs, and `tabular-nums` on all numeric metrics.
2. **Patient / Caregiver Routes (`src/pages/patient/`)**:
   - Built for elderly users: base font size `>= 18px`, touch targets `>= 48px`, high contrast, plain language, and referral suggestions only (never diagnostic labels).
3. **Doctor Routes (`src/pages/doctor/`)**:
   - High-density clinical workstation layout: show both composite scores and continuous values alongside MDC/MCID noise bands and compensation warnings.
