# Clinical Rules
!![SLOP 70% - barely review]

Every feature must follow these rules (AWGS 2025, GLIS 2024, WHO ICOPE).

## 1. Diagnosis ≠ Outcome Tracking

| | Sarcopenia Diagnosis | Outcome Tracking |
|---|---|---|
| Inputs | Muscle mass (ASM via BIA/DXA) + Handgrip strength | Video & pose metrics: gait speed, 5STS, SPPB, TUG, joint ROM, symmetry |
| Can label "sarcopenia"? | Yes | **Never** |

## 2. Two-Layer Metrics

Always store and return **both**:
- **Composite score**, e.g. SPPB 0–12
- **Continuous value**, e.g. 5STS (s), gait speed (m/s), joint angle (°)

## 3. MDC / MCID Noise Bands

- **MDC** (Minimal Detectable Change): smallest change bigger than measurement error.
- **MCID** (Minimal Clinically Important Difference): smallest change that matters to the patient.
- Every progress-over-time result includes both, so the UI can tell real change from noise.

Seed values for the cutoff config:

| Metric | MDC / MCID |
|---|---|
| SPPB | 1.1–1.4 points |
| 4 m walk | 0.77–0.80 s |
| 5STS | 1.32–1.77 s |

## 4. Versioned Cutoffs

- No clinical numbers in code.
- All cutoffs and MDC/MCID values live in a versioned config (e.g. `AWGS_2025_v1`), so a guideline update is a config change.

## 5. Privacy (PDPA)

- Video pipelines support **skeleton-only** rendering or **face blurring**.
