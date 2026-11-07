# MocapinWeb

## Description

MocapinWeb is a clinical-grade elderly mobility and sarcopenia care platform. The repository currently contains architecture, clinical safeguards, and UI wireframes.

The frontend includes a local realtime webcam demo with RTMPose HALPE26 overlays, person counts, model scores, and a still-image test. Default models load automatically; no model upload is needed. Video-quality and recording-readiness checks are still pending. See [frontend/README.md](frontend/README.md) for setup, model sources, and validation limits.

The demo now defaults to Auto runtime selection with WebGPU and per-model WASM fallback. Debug includes a WASM baseline and stage-by-stage timing statistics. Measured desktop results and test limits are recorded in [the runtime performance report](docs/runtime-performance-2026-11-07.md).

## Memmber
1. Wachi (Wachiraphut Intarachart) @wachiiint
2. Dobby (Puntawit Masun) @Puntawit
3. Duckin (Kittichon Chaonawig) @Duckin99
4. GAn (Kantinun Sucharitkul) @IamGann

With supervision by Assoc. Prof. Pizzanu Kanongchaiyos, Ph.D. (รศ.ดร.พิษณุ คนองชัยยศ)



## Appendix
for reference, please see legacy Proof-of-Concept Here \
https://github.com/wachiiint/Home-Based-Markerless-Movement-Analysis-Subsystem
