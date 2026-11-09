# UI & Wireframe Rules for Agents

This document defines the strict UI/UX design standards for all wireframes, prototypes, and UI screens in this repository. Every agent touching UI files must follow these rules without exception and read [docs/wireframes/THEME.md](THEME.md) for the exact style tokens.

---

## 1. Design System & Clinical Aesthetic (`MOCAPCARE` Full-Screen + Responsive Shell)

1. **Aesthetic & Layout Benchmark**:
   - Follow the locked design tokens in [docs/wireframes/THEME.md](THEME.md):
     - **100% Full-Screen Edge-to-Edge Shell**: `min-h-screen w-full bg-white flex flex-col lg:flex-row` (no outer margin box around the app).
     - **Responsive Navigation**: Fixed **Left Navigation Sidebar (`lg:w-64 bg-[#F4F8FC]`) on Desktop (`lg+`)**, and **Compact Top Header + Sticky Bottom Bar on Mobile (`< lg`)**.
     - **Cards & Controls**: Soft blue-tinted primary section (`bg-[#F6F9FF] border-blue-100/80`), clean `rounded-2xl` white cards with `w-10 h-10 rounded-full bg-[#EFF5FF] text-[#0B65FF]` icon circles, `rounded-full` pill toggles, and Royal Blue (`#0B65FF`) pill CTA buttons.
   - Use `'Plus Jakarta Sans'` + `'Anuphan'` for warm, human, high-legibility Thai and Latin typography.
   - Do NOT use dark cyberpunk themes, heavy purple/neon mesh gradients, or stiff terminal monospace labels.

2. **Zero "AI Yapping" & Zero Tech Jargon (Mandatory Copy Rule)**:
   - **No section subtitle filler**: Never write explanatory sentences under section headings telling users why they are filling out a form. A 2–3 word heading (`ข้อมูลผู้ป่วย`, `เลือกท่าทาง`) is enough.
   - **No bilingual parentheses clutter**: Write natural Thai labels (`การเคลื่อนไหว`, `โภชนาการ`, `แรงบีบมือ`) without stuffing English medical terms in parentheses (`(Locomotor Capacity)`, `(Handgrip Strength)`).
   - **No engineering or guideline leaks**: Never display internal pipeline names (`OpenSim`, `Pose2Sim`, `RTMPose`), guideline codes (`AWGS 2025`, `WHO ICOPE Step 1`), or robotic badges (`DOMAIN 01`, `NEW INTAKE`, `v1.0`) in the UI.

3. **Zero Emojis & Circular Icon Badges**:
   - **Never use emojis** (`👤`, `📋`, `🩺`, `✨`) anywhere in UI markup.
   - Use clean SVG icons inside `w-10 h-10 rounded-full bg-[#EFF5FF] text-[#0B65FF]` circular badges or `16x16` / `20x20` inline icons.

4. **Elderly Accessibility & Mobile Responsiveness (Patient/Caregiver Screens)**:
   - High contrast, body fonts `>= 16-18px`, touch targets `>= 48px`, plain everyday Thai language, and smooth vertical mobile responsiveness for smartphone use.

---

## 2. Complete 9-Screen Wireframe Architecture

Keep wireframes separated into standalone, connected files inside `docs/wireframes/`:

- **Public & Auth (`1.x`)**:
  - `1.0-landing-page.html` — Public full-screen landing page (no Doctor links).
  - `1.1-patient-auth.html` — Patient Login & Sign-Up (basic profile + height/weight).
- **Patient Flow (`2.x`)**:
  - `2.1-location-and-poses.html` — Select Home (1-cam default, caregiver toggle, easy/medium + doctor-assigned poses) vs Hospital (2-cam default, nurse handgrip/vitals, clinical poses).
  - `2.2-camera-setup-and-record.html` — 1-cam or 2-cam companion pairing -> 26-keypoint check -> Demo video popup (`เข้าใจแล้ว`) -> 10s countdown -> Auto-record & Smart Auto-Stop.
  - `2.3-patient-result.html` — Plain-Thai Traffic-Light referral card + 3 metrics + AI disclaimer banner (before doctor review) -> Doctor feedback & appointment card (after doctor review).
- **Restricted Doctor Flow (`3.x`)**:
  - `3.1-doctor-login.html` — Hidden `/doctor/login` screen (no Sign-Up).
  - `3.2-doctor-patient-list.html` — Doctor landing page listing all patients and review status.
  - `3.3-doctor-patient-detail.html` — Patient profile + Pose Assignment Editor + Past Recorded Sessions Table.
  - `3.4-doctor-session-analysis.html` — Single-session 3D/2D biomechanics & video replay + Doctor Review & Feedback form.

---

## 3. Unslop Redline Audit (Mandatory Before & After Edits)

Before delivering or modifying any wireframe or UI screen, run this 7-pass redline check:

1. **Anti-Yapping Copy Pass**: Delete all section subtitle filler sentences, parenthetical English translations, `DOMAIN 01` labels, and `OpenSim`/`AWGS`/`ICOPE` jargon badges.
2. **Spacing Pass**: Stick to clean Tailwind spacing (`gap-4`, `p-5`, `p-6`, `space-y-8`).
3. **Color & Surface Pass**: Use the `MOCAPCARE` full-screen palette from [docs/wireframes/THEME.md](THEME.md).
4. **Icons Pass**: Zero emojis. Use crisp inline SVGs inside `bg-[#EFF5FF] text-[#0B65FF]` circular badges.
5. **Typography Pass**: Use `'Plus Jakarta Sans'` + `'Anuphan'` and `tabular-nums` for numbers.
6. **Layout Pass**: Edge-to-edge full-screen (`min-h-screen w-full`) with desktop left sidebar (`lg:w-64`) and mobile top/bottom bars.
7. **Clinical Gate**: Verify that video/pose screens never display a "Sarcopenia" diagnosis label, never hardcode clinical cutoffs in the UI, and never leak Doctor links onto Patient pages.
