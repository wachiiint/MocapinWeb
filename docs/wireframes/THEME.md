# UI Theme & Design Tokens (`MOCAPCARE` Theme + Left Navigation Sidebar)

This file defines the locked visual design system and copy rules referenced by [docs/wireframes/AGENTS.md](AGENTS.md).
It combines the **`MOCAPCARE`** visual theme (Royal Blue `#0B65FF`, soft sky backdrop, tactile rounded-2xl cards, circular icon badges, and pill buttons) with a **Left Navigation Sidebar (`#F4F8FC`)**.

---

## 1. Typography (Warm, Human, High-Clarity)

- **Font Pairing**: `'Plus Jakarta Sans'` (Latin & Numbers) + `'Anuphan'` (Modern, human loopless Thai UI font).
- **Zero Monospace Clutter**: Do NOT use technical coding fonts (`JetBrains Mono`) for normal UI badges or labels. Use `tabular-nums` on standard sans-serif numbers so metrics align cleanly without looking like a developer terminal.
- **Scale**:
  - Page Title: `text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight`
  - Section Title: `text-base font-bold text-slate-900`
  - Card Title: `text-sm font-bold text-slate-900`
  - Field Label: `text-xs font-semibold text-slate-600`
  - Secondary / Question Text: `text-xs text-slate-500`

---

## 2. Color, Shell & Surface Tokens

| Token Role | Visual Description | Tailwind / CSS Classes |
| :--- | :--- | :--- |
| **Ambient Outer Canvas** | Soft, airy sky-to-white background | `bg-gradient-to-b from-[#DCEBFF] via-[#EFF5FF] to-[#F8FAFC]` |
| **App Window Frame** | Crisp white floating container with soft blue elevation | `bg-white/95 rounded-3xl border border-white shadow-[0_16px_48px_rgba(11,101,255,0.06)]` |
| **Left Navigation Sidebar** | Light frosted cool-gray/blue sidebar on the left (`lg:w-64`) | `bg-[#F4F8FC] border-r border-slate-200/70 p-5 sm:p-6` |
| **Active Sidebar Item** | Royal Blue pill highlight with white icon & text | `bg-[#0B65FF] text-white font-semibold rounded-xl shadow-sm shadow-blue-500/15` |
| **Primary Form Surface** | Soft blue-tinted grouping box for primary patient inputs | `rounded-2xl bg-[#F6F9FF] border border-blue-100/80 p-5 sm:p-6` |
| **Tactile Item Card** | Clean white card with circular blue icon & pill toggles | `rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs` |
| **Circular Icon Badge** | `40x40` soft blue circle with Royal Blue SVG icon | `w-10 h-10 rounded-full bg-[#EFF5FF] text-[#0B65FF] flex items-center justify-center` |
| **Pill Choice Toggle** | Full-rounded pill button (`peer sr-only`) | `h-9 rounded-full border border-slate-200 text-xs font-semibold text-slate-600`<br>Pass/Normal: `peer-checked:bg-[#0B65FF] peer-checked:border-[#0B65FF] peer-checked:text-white`<br>Attention/Issue: `peer-checked:bg-amber-500 peer-checked:border-amber-500 peer-checked:text-white` |
| **Primary CTA Button** | Royal Blue full-pill button with subtle blue glow | `rounded-full bg-[#0B65FF] px-7 py-3.5 text-sm font-semibold text-white shadow-md shadow-blue-500/20 hover:bg-[#0052CC]` |

---

## 3. Strict "Zero Tech Yapping" Copy Rules

1. **Short, Human Titles Only**:
   - Write `ข้อมูลผู้ป่วย`, `คัดกรอง 6 ด้าน`, `ค่าตรวจวัดเพิ่มเติม`.
   - **Never** write redundant section subtitles explaining how to fill out a form (e.g., ban *"กรอกข้อมูลเบื้องต้นเพื่อใช้เป็นฐานข้อมูล"*).
2. **No Bilingual Parentheses Clutter**:
   - Write `การเคลื่อนไหว`, **never** `1. การเคลื่อนไหว (Locomotor Capacity)`.
   - Write `แรงบีบมือ`, **never** `แรงบีบมือ (Handgrip Strength)`.
3. **No Internal Engineering or Guideline Jargon on Screens**:
   - **Never** display `OpenSim Scaling`, `Pose2Sim`, `AWGS 2025`, `WHO ICOPE Step 1`, `DOMAIN 01`, `v1.0`, or `New Intake Record` in UI badges or headers.
