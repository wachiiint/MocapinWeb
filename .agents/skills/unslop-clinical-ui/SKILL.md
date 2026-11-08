---
name: unslop-clinical-ui
description: >-
  Audits and polishes HTML wireframes or React UI components to eliminate generic AI-generated "slop" and AI verbosity ("tech yapping"), enforcing the MOCAPCARE + Left Sidebar clinical UI standard. Activate when creating, reviewing, or refactoring wireframes in docs/wireframes/ or UI screens in frontend/.
---

# Unslop Clinical UI Skill

Adapted from `heydamir/unslop` and tailored strictly to our **`MOCAPCARE` Theme + Left Navigation Sidebar** design system ([docs/wireframes/THEME.md](../../../docs/wireframes/THEME.md) and [docs/wireframes/AGENTS.md](../../../docs/wireframes/AGENTS.md)). This skill uses **zero external APIs, zero Playwright video scripts, and zero third-party image generators**.

---

## Step 1: The Slop & Yapping Audit (Run Before Editing)

Before modifying a screen, scan the HTML or JSX and list every violation found across these categories:

1. **AI Verbosity ("Tech Yapping") — CRITICAL**:
   - Redundant subtitle sentences under section headers that explain the obvious (e.g., *"กรอกข้อมูลเบื้องต้นเพื่อใช้เป็นฐานข้อมูล"*, *"คลิกเลือกผลการประเมินในแต่ละการ์ด"*).
   - Bilingual parenthetical clutter on standard labels (e.g., `1. การเคลื่อนไหว (Locomotor Capacity)`, `แรงบีบมือ (Handgrip Strength)`).
   - Internal pipeline or guideline jargon leaked onto the UI (`OpenSim Scaling`, `Pose2Sim`, `AWGS 2025`, `WHO ICOPE Step 1`, `DOMAIN 01`, `NEW INTAKE RECORD`, `v1.0`).
2. **AI Color & Dark/Neon Tells**:
   - Heavy dark sidebars, cyberpunk cards, purple/indigo neon glows, or dull all-black templates.
   - Native `<input type="radio">` circles visible inside bordered boxes.
3. **Emoji & Badge Spam**:
   - Any emoji used as an icon, bullet, status badge, or button label (`👤`, `📋`, `🩺`, `✨`).
4. **Clinical Boundary Violations**:
   - Video/pose screens displaying "Sarcopenia" as a diagnosis ([docs/clinical-rules.md](../../../docs/clinical-rules.md)).
   - Hardcoded clinical cutoffs inside UI labels instead of data-driven badges/bands.

---

## Step 2: The 7 Sequential Polish Passes

Fix all detected issues in this exact sequence:

### Pass 1: Copy Reduction (Zero Tech Yapping)
- Strip every section header down to **1 short title** (2–3 words max: `ข้อมูลผู้ป่วย`, `คัดกรอง 6 ด้าน`, `ค่าตรวจวัดเพิ่มเติม`). Delete the explanatory subtitle paragraph underneath.
- Remove English translations in parentheses from Thai labels.
- Remove all `DOMAIN 01`, `AWGS`, `ICOPE`, and `OpenSim` badges.
- Keep card question text to **one short, natural phrase** (`ลุกนั่งเก้าอี้ 5 ครั้งโดยไม่ใช้มือ`).

### Pass 2: `MOCAPCARE` + Left Sidebar Color & Surface Palette
- **Ambient Backdrop**: `bg-gradient-to-b from-[#DCEBFF] via-[#EFF5FF] to-[#F8FAFC]`.
- **App Frame**: `bg-white/95 rounded-3xl border border-white shadow-[0_16px_48px_rgba(11,101,255,0.06)]`.
- **Left Navigation Sidebar**: `lg:w-64 bg-[#F4F8FC] border-r border-slate-200/70` with active nav item `bg-[#0B65FF] text-white font-semibold rounded-xl shadow-sm`.
- **Primary Section Surface**: `rounded-2xl bg-[#F6F9FF] border border-blue-100/80 p-5 sm:p-6`.
- **Tactile Item Cards**: `rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs` with `rounded-full` pill toggles.
- **Primary CTA**: Royal Medical Blue pill `rounded-full bg-[#0B65FF] px-7 py-3.5 text-sm font-semibold text-white shadow-md shadow-blue-500/20 hover:bg-[#0052CC]`.

### Pass 3: Circular Icon Badges
- Replace emojis or plain icons with `w-10 h-10 rounded-full bg-[#EFF5FF] text-[#0B65FF]` circular icon containers.

### Pass 4: Typography & Role Accessibility
- Use `'Plus Jakarta Sans'` + `'Anuphan'` (never terminal monospace fonts for UI labels).
- Apply `tabular-nums` to numeric inputs, timers, and scores.
- **Elderly Patient / Caregiver Screens**: High contrast, body font `>= 18px`, touch targets `>= 48px`, plain everyday Thai.

### Pass 5: Spacing & Grid Rhythm
- Normalize container padding to `p-5` or `p-6` and section spacing to `space-y-8`.

### Pass 6: Layout & Figma Portability
- Structure markup cleanly so `docs/wireframes/*.html` imports into Figma via `html.to.design` and maps cleanly into `frontend/src/`.

### Pass 7: Micro-Details & Clean Toggle States
- Use `peer sr-only` radio inputs inside `rounded-full` pill buttons (`peer-checked:bg-[#0B65FF]` for normal/pass, `peer-checked:bg-amber-500` for flagged/issue) so native radio circles never clutter bordered buttons.
