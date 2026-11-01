# AGENTS.md — Architecture & Anti-Bloat Rules

This file defines the working rules for AI coding agents in this repository. Follow every rule strictly. We are building a clinical-grade elderly mobility and sarcopenia care platform, not an exploratory "vibe-coded" prototype.

---

## 1. Pace & Workflow (No Vibe Coding)

1. **Plan Before Code**: Never write or modify application code until the user approves a short implementation plan (files to touch, data contracts, and expected behavior).
2. **One Focused Change at a Time**: Implement one small, testable piece per turn (for example, one data schema, one pure calculation module, or one UI screen component). Stop and check in with the user before starting the next piece.
3. **Human-Reviewed Architecture**: Do not invent new folders, frameworks, background workers, or state management libraries on your own initiative. Propose options and let the team decide.
4. **Setup Steps Are Guidance, Not Actions**: Never download large AI models, clone external repositories, or install heavy system packages without asking. Write the exact CLI commands in the documentation instead.
5. **Git Hygiene**: Commit or push only when explicitly asked. Write small, story-telling commits.

---

## 2. Anti-Overengineering & Simplicity Constraints

1. **Keep Code Simple & Focused (No Overengineering)**:
   - Aim to keep application source files concise (roughly **~200 lines** as a guideline, not a rigid rule that forces artificial splitting) and functions focused on one clear job.
   - Do not split cohesive logic into tiny fragments just to hit a line count, and do not write bloated, monolithic files either. Favor flat, straightforward code that is easy to read in one sitting.
2. **Zero Dead Code**:
   - Never leave commented-out code blocks, unused imports, or `TODO` placeholders that duplicate existing logic.
   - Delete obsolete code immediately instead of keeping `v2` or `_old` copies.
3. **No Premature Abstraction**:
   - Do not create base classes, factory patterns, or generic wrappers for a single use case. Write direct, readable code first.
4. **Strict Dependency Control**:
   - Do not add any package to `pyproject.toml` or `package.json` without explaining why the standard library or existing stack cannot solve it.

---

## 3. Monorepo Architecture & Folder Boundaries

Keep the repository organized into clear workspaces with strict layer boundaries (`handlers` -> `usecases` -> `repositories` / `gateways`):

```text
├── docs/
│   └── wireframes/             # Standalone POC screens & UI rules (see docs/wireframes/AGENTS.md)
├── research/                   # Offline Pose2Sim & OpenSim experiments (never imported by backend)
├── frontend/                   # React + TypeScript + Vite + Tailwind (shadcn/ui)
│   └── src/
│       ├── components/ui/      # Reusable shadcn/ui primitives
│       └── pages/              # Screen views (5.1 Screening, 5.2 Capture, 5.3 Analysis)
└── backend/
    ├── api/                    # Go Main API (Chi + Huma)
    │   ├── cmd/api/            # Application entrypoint
    │   └── internal/
    │       ├── handlers/       # Layer 1: HTTP transport (validate input -> call usecase -> return JSON)
    │       ├── usecases/       # Layer 2: Business logic & clinical rules (ICOPE, AWGS 2025, MDC)
    │       ├── repositories/   # Layer 3: Database queries
    │       ├── gateways/       # Layer 4: Outbound clients calling external services (pose-engine)
    │       └── models/         # Domain & DTO structs
    └── pose-engine/            # Python FastAPI service (strictly RTMPose .onnx & Pose2Sim inference)
        └── app/
```

- **Strict Layer Responsibility in `backend/api/`**:
  - `handlers/` must never contain SQL queries or clinical cutoff math.
  - `usecases/` holds pure business/clinical logic and orchestrates `repositories/` and `gateways/`.
- **Stateless `backend/pose-engine/`**: The Python service only runs AI pose estimation and 3D kinematics; it never accesses the application database directly.

---

## 4. Clinical & Domain Guardrails (AWGS 2025 & WHO ICOPE)

Every feature must respect these clinical rules from our specification:

1. **Separate Diagnosis from Outcome Tracking**:
   - **Sarcopenia Diagnosis** uses **Muscle Mass (ASM via BIA/DXA) + Muscle Strength (Handgrip)** only (AWGS 2025 / GLIS 2024).
   - **Video & Pose Metrics** (gait speed, 5STS, SPPB, TUG, joint ROM, symmetry) must **never** auto-label a patient as having sarcopenia. They are strictly **Physical Performance / Outcome Tracking** metrics.
2. **Two-Layer Metric Transparency**:
   - Always store and return both the **composite clinical score** (such as SPPB 0–12) and the **continuous biomechanical value** (such as 5STS in seconds, gait speed in m/s, and joint angles in degrees).
3. **Mandatory MDC / MCID Noise Bands**:
   - Longitudinal progress payloads must include the **Minimal Detectable Change (MDC)** and **MCID** thresholds (for example: SPPB `1.1–1.4` points, 4m walk `0.77–0.80` s, 5STS `1.32–1.77` s) so the UI can distinguish real clinical improvement from measurement error.
4. **Versioned Clinical Cutoffs**:
   - Never hardcode magic numbers in code. Store all clinical cutoffs and MDC/MCID constants in a versioned configuration file (for example, `AWGS_2025_v1`) so guidelines can be updated cleanly.
5. **Privacy & Elderly Accessibility by Default**:
   - Video pipelines must support skeleton-only rendering or face blurring for PDPA compliance.
   - Patient/Caregiver UI screens (`Screen 5.6`) must use high contrast, large fonts (`>= 18px`), large touch targets (`>= 48px`), and plain language without medical jargon.

---

## 5. Communication Style

- Write simple, beginner-friendly explanations with short sentences.
- **Never use the section symbol** — always write "section" or "part" instead.
- Always link to files and symbols using clickable Markdown links.
