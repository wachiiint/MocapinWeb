# AGENTS.md — Architecture & Anti-Bloat Rules

This file defines the working rules for AI coding agents in this repository. Follow every rule STRICTLY. We are building a clinical-grade elderly mobility and sarcopenia care platform, not an exploratory "vibe-coded" prototype.

---

## 1. Pace & Workflow (No Vibe Coding)

1. **Plan Before Code**: Never write or modify application code until the user approves a short implementation plan (files to touch, data contracts, and expected behavior).
2. **One Focused Change at a Time**: Implement one small, testable piece per turn (for example, one data schema, one pure calculation module, or one UI screen component). Stop and check in with the user before starting the next piece.
3. **Human-Reviewed Architecture**: Do not invent new folders, frameworks, background workers, or state management libraries on your own initiative. Propose options and let the team decide.
4. **Setup Steps Are Guidance, Not Actions**: Never download large AI models, clone external repositories, or install heavy system packages without asking. Write the exact CLI commands in the documentation instead.
5. **Git Hygiene**: Agents are PROHIBITED for commit or push git. Only advice team for git action. Highlight key changes per commit. Always warn team to write commit message by his/her own word.

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

## 3. Architecture & Folder Boundaries

- **Before creating folders or backend code, read [docs/architect.md](docs/architect.md).** It holds the folder tree and layer rules.
- Hard rules: `handlers/` never contain SQL or clinical math. `pose-engine/` never touches the app database.

---

## 4. Clinical Guardrails

- **Before any clinical logic, metric, or report, read [docs/clinical-rules.md](docs/clinical-rules.md).**
- Hard rules: video/pose metrics never label a patient as sarcopenic. No clinical numbers in code — use the versioned config.

---

## 5. Communication Style

- Write simple, beginner-friendly explanations with short sentences.
- **Never use the section symbol** — always write "section" or "part" instead.
- Always link to files and symbols using clickable Markdown links.
