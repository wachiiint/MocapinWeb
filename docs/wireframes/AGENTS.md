# UI & Wireframe Rules for Agents

This document defines the strict UI/UX design standards for all wireframes, prototypes, and UI screens in this repository. Every agent touching UI files must follow these rules without exception.

---

## 1. Design System & Clinical Aesthetic (shadcn/ui Standard)

1. **Aesthetic Benchmark**:
   - Strictly adhere to the **shadcn/ui** clinical design system (Clinical Slate palette, crisp 1px borders `border-slate-200`, clean typography, subtle shadows).
   - Do NOT use bubbly, pastel, rounded-20px cartoon cards.
   - Do NOT use heavy purple/neon gradients or dark flashy themes. The platform must feel like professional clinical medical workstation software, not a generic black AI template.

2. **Zero "AI Slop" & Zero Decorative Emojis**:
   - **Never use emojis** (such as 👤, 📋, 🩺, 🚀, 💡, 🔥) as section icons or button labels. They look amateur and signal cheap AI-generated templates.
   - Use **clean, monochrome inline SVG icons** (Lucide style: `stroke="currentColor"`, stroke-width `1.5` or `2`, sized `16x16` or `20x20` with `text-slate-500`).

3. **Clinical Color Palette (shadcn Slate + Medical Teal)**:
   - Page Background: `bg-slate-50` or `bg-white`
   - Cards/Containers: `bg-white`, `border-slate-200`, `shadow-sm`, `rounded-lg`
   - Primary Text: `text-slate-900`
   - Muted/Secondary Text: `text-slate-500`
   - Primary Action Buttons: `bg-slate-900 text-white hover:bg-slate-800 shadow-sm rounded-md`
   - Medical Accent / Active State: `text-teal-700 bg-teal-50 border-teal-200`
   - Inputs: `border-slate-200 bg-white placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-slate-900 rounded-md`

4. **Low-Text & High Visual Clarity (Mandatory UX Rule)**:
   - **Never overload screens with long text**: Clinicians and users do not want to read lengthy descriptions, tutorial blocks, or wordy AI explanations.
   - **Visual-first presentation**: Information must be understood instantly at a glance through clean metric numbers, compact status badges, high-contrast graphs, and direct labels (inspired by shadcn dashboard examples).
   - If a concept can be conveyed with a number, a status pill, or an icon, do not write a sentence for it.

5. **Elderly Accessibility (Patient/Caregiver Screens, Screen 5.6)**:
   - High contrast, fonts `>= 18px`, touch targets `>= 48px`.
   - Plain language, no medical jargon.

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
   - Build wireframes with clean HTML + Tailwind CSS using standard shadcn class names.
   - Code must be structured so that developers can copy-paste it directly into React + shadcn/ui components (`<Card>`, `<Input>`, `<Label>`, `<RadioGroup>`) without redesigning.
2. **Figma Friendly**:
   - Layouts must be clean and standard so they can be imported directly into Figma using the `html.to.design` plugin as editable vector frames.
