# UI & Wireframe Rules for Agents

This document defines the strict UI/UX design standards for all wireframes, prototypes, and UI screens in this repository. Every agent touching UI files must follow these rules without exception and read [docs/wireframes/THEME.md](THEME.md) for the exact style tokens.

---

## 1. Design System & Clinical Aesthetic (`MOCAPCARE` Theme + Left Sidebar)

1. **Aesthetic Benchmark**:
   - Follow the locked design tokens in [docs/wireframes/THEME.md](THEME.md):
     - **Outer Backdrop**: Soft sky-to-white gradient (`bg-gradient-to-b from-[#DCEBFF] via-[#EFF5FF] to-[#F8FAFC]`).
     - **Framed App Shell**: `bg-white/95 rounded-3xl border border-white shadow-[0_16px_48px_rgba(11,101,255,0.06)]` with a **Left Navigation Sidebar (`lg:w-64 bg-[#F4F8FC]`)** and a spacious right content area.
     - **Cards & Controls**: Soft blue-tinted primary section (`bg-[#F6F9FF] border-blue-100/80`), clean `rounded-2xl` white cards with `w-10 h-10 rounded-full bg-[#EFF5FF] text-[#0B65FF]` icon circles, `rounded-full` pill toggles, and Royal Blue (`#0B65FF`) pill CTA buttons.
   - Use `'Plus Jakarta Sans'` + `'Anuphan'` for warm, human, high-legibility Thai and Latin typography.
   - Do NOT use dark cyberpunk themes, heavy purple/neon mesh gradients, or stiff terminal monospace labels.

2. **Zero "AI Yapping" & Zero Tech Jargon (Mandatory Copy Rule)**:
   - **No section subtitle filler**: Never write explanatory sentences under section headings telling users why they are filling out a form. A 2–3 word heading (`ข้อมูลผู้ป่วย`, `คัดกรอง 6 ด้าน`) is enough.
   - **No bilingual parentheses clutter**: Write natural Thai labels (`การเคลื่อนไหว`, `โภชนาการ`, `แรงบีบมือ`) without stuffing English medical terms in parentheses (`(Locomotor Capacity)`, `(Handgrip Strength)`).
   - **No engineering or guideline leaks**: Never display internal pipeline names (`OpenSim`, `Pose2Sim`, `RTMPose`), guideline codes (`AWGS 2025`, `WHO ICOPE Step 1`), or robotic badges (`DOMAIN 01`, `NEW INTAKE`, `v1.0`) in the UI.

3. **Zero Emojis & Circular Icon Badges**:
   - **Never use emojis** (`👤`, `📋`, `🩺`, `✨`) anywhere in UI markup.
   - Use clean SVG icons inside `w-10 h-10 rounded-full bg-[#EFF5FF] text-[#0B65FF]` circular badges or `16x16` / `20x20` inline icons.

4. **Elderly Accessibility (Patient/Caregiver Screens)**:
   - High contrast, fonts `>= 18px`, touch targets `>= 48px`, plain everyday Thai language.

---

## 2. Clinical & Functional Integrity

1. **No Frontend Preaching**:
   - Intake forms are strictly for data entry. Do not clutter input fields with hardcoded cutoff rules, warnings, or textbook explanations. Calculations belong in the domain backend.
2. **Realistic Medical Workflow**:
   - Initial intake forms must start blank for new data entry (no pre-filled patient records or fake IDs).
   - In movement tests, tests are organized in a **Pose Protocol Checklist**: clinicians select which poses to perform. Any unselected or skipped pose is recorded as unperformed / unable to perform without cluttering the recording viewfinder with extra buttons.
3. **One Focused Screen per File**:
   - Keep wireframes separated into standalone files (for example: `5.1-screening-form.html`, `5.2-motion-capture.html`) so stakeholders can review and approve each screen individually.

---

## 3. Tech Stack & Figma Portability

1. **Pure Tailwind in Standalone HTML**:
   - Build wireframes with clean HTML + Tailwind CSS so developers can copy-paste markup directly into React + shadcn/ui components without redesigning.
2. **Figma Friendly**:
   - Layouts must be clean and standard so they can be imported directly into Figma using the `html.to.design` plugin as editable vector frames.

---

## 4. Unslop Redline Audit (Mandatory Before & After Edits)

Before delivering or modifying any wireframe or UI screen, run this 7-pass redline check (use the `unslop-clinical-ui` skill for full details):

1. **Anti-Yapping Copy Pass**: Delete all section subtitle filler sentences, parenthetical English translations, `DOMAIN 01` labels, and `OpenSim`/`AWGS`/`ICOPE` jargon badges.
2. **Spacing Pass**: Stick to clean Tailwind spacing (`gap-4`, `p-5`, `p-6`, `space-y-8`).
3. **Color & Surface Pass**: Use the `MOCAPCARE` + Left Sidebar palette from [docs/wireframes/THEME.md](THEME.md) (soft sky canvas, `#F4F8FC` left sidebar, `#F6F9FF` highlight section, white `rounded-2xl` cards, `#0B65FF` Royal Blue primary pills).
4. **Icons Pass**: Zero emojis. Use crisp inline SVGs inside `bg-[#EFF5FF] text-[#0B65FF]` circular badges.
5. **Typography Pass**: Use `'Plus Jakarta Sans'` + `'Anuphan'` and `tabular-nums` for numbers.
6. **Layout Pass**: Framed `rounded-3xl` container with left navigation rail (`lg:w-64`) and right main workspace.
7. **Clinical Gate**: Verify that video/pose screens never display a "Sarcopenia" diagnosis label and never hardcode clinical cutoffs in the UI.
