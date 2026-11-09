# UI Theme & Design Tokens (`MOCAPCARE` Full-Screen + Responsive Shell)

This file defines the locked visual design system and copy rules referenced by [docs/wireframes/AGENTS.md](AGENTS.md).
It combines the **`MOCAPCARE`** visual theme (Royal Blue `#0B65FF`, soft `#F6F9FF` section surfaces, tactile `rounded-2xl` cards, circular icon badges, and pill buttons) with an **Edge-to-Edge 100% Full-Screen Layout** (`w-full min-h-screen`), featuring a **Left Navigation Sidebar (`lg:w-64 bg-[#F4F8FC]`) on Desktop** and a **Compact Top Bar + Bottom Navigation Bar on Mobile (`< lg`)**.

---

## 1. Typography (Warm, Human, High-Clarity)

- **Font Pairing**: `'Plus Jakarta Sans'` (Latin & Numbers) + `'Anuphan'` (Modern, human loopless Thai UI font).
- **Zero Monospace Clutter**: Do NOT use technical coding fonts (`JetBrains Mono`) for normal UI badges or labels. Use `tabular-nums` on standard sans-serif numbers so metrics align cleanly without looking like a developer terminal.
- **Scale**:
  - Page Title: `text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight`
  - Section Title: `text-base sm:text-lg font-bold text-slate-900`
  - Card Title: `text-sm sm:text-base font-bold text-slate-900`
  - Field Label: `text-xs sm:text-sm font-semibold text-slate-600`
  - Patient Body Text (Elderly Accessible): `text-base sm:text-lg text-slate-600` (`>= 16-18px`, touch targets `>= 48px`)

---

## 2. Color, Full-Screen Shell & Surface Tokens

| Token Role | Visual Description | Tailwind / CSS Classes |
| :--- | :--- | :--- |
| **Full-Screen App Shell** | Edge-to-edge full-viewport layout (no outer margin box) | `min-h-screen w-full bg-white text-slate-900 flex flex-col lg:flex-row` |
| **Desktop Left Sidebar** | Fixed/sticky left rail on Desktop (`lg+`) | `hidden lg:flex lg:w-64 lg:flex-col lg:shrink-0 bg-[#F4F8FC] border-r border-slate-200/80 p-6` |
| **Mobile Top Bar & Bottom Nav** | Compact top brand header + sticky bottom navigation bar on Mobile (`< lg`) | Top: `flex lg:hidden items-center justify-between px-4 py-3 bg-[#F4F8FC] border-b border-slate-200/80`<br>Bottom: `fixed bottom-0 inset-x-0 z-40 flex lg:hidden bg-white/95 backdrop-blur border-t border-slate-200/80` |
| **Active Navigation Item** | Royal Blue pill highlight with white icon & text | `bg-[#0B65FF] text-white font-semibold rounded-xl shadow-sm shadow-blue-500/15` |
| **Soft Sky Hero / Accent Surface** | Soft sky-to-white gradient for hero or highlight panels | `bg-gradient-to-b from-[#DCEBFF]/70 via-[#EFF5FF] to-white` |
| **Primary Section Surface** | Soft blue-tinted grouping box for primary inputs/cards | `rounded-2xl bg-[#F6F9FF] border border-blue-100/80 p-5 sm:p-6` |
| **Tactile Item Card** | Clean white card with circular blue icon & pill toggles | `rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-2xs` |
| **Circular Icon Badge** | `40x40` or `48x48` soft blue circle with Royal Blue SVG icon | `w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#EFF5FF] text-[#0B65FF] flex items-center justify-center shrink-0` |
| **Pill Choice Toggle** | Full-rounded pill button (`peer sr-only`) | `h-10 sm:h-11 rounded-full border border-slate-200 text-xs sm:text-sm font-semibold text-slate-600`<br>Pass/Normal: `peer-checked:bg-[#0B65FF] peer-checked:border-[#0B65FF] peer-checked:text-white`<br>Attention/Issue: `peer-checked:bg-amber-500 peer-checked:border-amber-500 peer-checked:text-white` |
| **Primary CTA Button** | Royal Blue full-pill button with subtle blue glow | `rounded-full bg-[#0B65FF] px-7 py-3.5 text-sm sm:text-base font-semibold text-white shadow-md shadow-blue-500/20 hover:bg-[#0052CC]` |

---

## 3. Strict "Zero Tech Yapping" Copy Rules

1. **Short, Human Titles Only**:
   - Write `ข้อมูลผู้ป่วย`, `เลือกสถานที่`, `ท่าทางที่ต้องทำ`, `ผลประมวลผลเบื้องต้น`.
   - **Never** write redundant section subtitles explaining how to fill out a form (e.g., ban *"กรอกข้อมูลเบื้องต้นเพื่อใช้เป็นฐานข้อมูล"*).
2. **No Bilingual Parentheses Clutter**:
   - Write `การเคลื่อนไหว`, **never** `1. การเคลื่อนไหว (Locomotor Capacity)`.
   - Write `แรงบีบมือ`, **never** `แรงบีบมือ (Handgrip Strength)`.
3. **No Internal Engineering or Guideline Jargon on Screens**:
   - **Never** display `OpenSim Scaling`, `Pose2Sim`, `AWGS 2025`, `WHO ICOPE Step 1`, `DOMAIN 01`, `v1.0`, or `New Intake Record` in UI badges or headers.
4. **Strict Role Separation**:
   - Public and Patient screens (`1.x`, `2.x`) must **never** show links or buttons to the Doctor Portal (`3.x`).
