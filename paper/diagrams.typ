// Paper diagrams (fletcher). Import into main.typ: #import "diagrams.typ": arch-diagram
#import "@preview/fletcher:0.5.8" as fletcher: diagram, node, edge

// Layer colours: data, anatomy, motion, clinical
#let c-data = luma(235)
#let c-anat = rgb("#dbe8f6")
#let c-motion = rgb("#dcefdc")
#let c-clin = rgb("#f8e6d0")

#let box(pos, title, detail, fill, ..args) = node(
  pos,
  align(center)[*#title* \ #text(size: 7pt, detail)],
  fill: fill, stroke: 0.6pt, corner-radius: 3pt, width: 3cm, inset: 6pt,
  ..args,
)

#let arch-diagram = {
  set text(size: 8pt)
  set par(justify: false)
  diagram(
    spacing: (10mm, 12mm),
    edge-stroke: 0.6pt,
    mark-scale: 70%,

    box((0, 0.5), [M1 Acquisition + QC], [Dixon MRI · 2 synced phones (or 1) · rig calibration · height, weight · on-device keypoint guard], c-data),

    box((1, 0), [M2 Segmentation], [nnU-Net · per-muscle $V_m$, $"FF"_m$, IMAT], c-anat),
    box((2, 0), [M3 Capacity model], [Scaled Lai--Uhlrich · moment arms · $F_m^max$ (Eq. 1)], c-anat),

    box((1, 1), [M4 Motion recovery], [RTMPose → Pose2Sim → marker augmenter → IK · 1 cam: WHAM], c-motion),
    box((2, 1), [M5 Dynamics], [Contact-sphere sim · GRF · muscle forces · DCR (Eq. 2)], c-motion),
    box((3, 1), [M6 Forecasting], [Proposed, not built], c-motion, stroke: (dash: "dashed", thickness: 0.6pt)),

    box((3, 0), [M7 Clinical metrics], [AWGS 2025 criteria · SPPB · MCID · intervals], c-clin),
    node((3, -0.75), [Clinician + stakeholder views], stroke: none),

    edge((0, 0.5), (1, 0), "-|>", [MRI], label-side: left, label-pos: 0.6),
    edge((0, 0.5), (1, 1), "-|>", [video], label-side: right, label-pos: 0.6),
    edge((1, 0), (2, 0), "-|>"),
    edge((2, 0), (1, 1), "-|>", [scaled model], label-pos: 0.3),
    edge((2, 0), (2, 1), "-|>", [$F_m^max$], label-side: left),
    edge((1, 1), (2, 1), "-|>", [$q(t)$], label-side: right),
    edge((2, 1), (3, 0), "-|>", [DCR, endpoints], label-side: right),
    edge((2, 1), (3, 1), "--|>"),
    edge((3, 1), (3, 0), "--|>"),
    edge((3, 0), (3, -0.75), "-|>"),
  )
}
