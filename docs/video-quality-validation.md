# Video quality validation — Phase E

Status on 2026-11-09: offline benchmark tooling and procedural regression cases are implemented. Threshold calibration on independently labelled real images, model-team validation, and physical-device acceptance are **not complete**. Phase A also remains open. The desktop Chrome code is experimental; neither Android Chrome nor iPhone Safari is certified.

## What is implemented

The [benchmark CLI](../frontend/quality-benchmark.ts) runs the production [single-frame quality checks](../frontend/src/pose-check/quality-checks.ts) on versioned, labelled samples. It reports both bad samples incorrectly allowed through and good samples incorrectly warned about. It does not classify an entire recording, evaluate readiness over time, run ONNX inference, or certify clinical suitability. Existing readiness and recorder tests cover temporal behaviour separately.

Run with Node 24 from `frontend`:

```powershell
node quality-benchmark.ts --synthetic
node quality-benchmark.ts labelled-dataset.json
node quality-benchmark.ts labelled-dataset.json candidate-config.json
```

The candidate config must supply the full versioned config with all numeric settings, using the same bounds as Debug. Start with a copy of [quality-config.ts](../frontend/src/pose-check/quality-config.ts)'s values expressed as JSON. Assign a distinct version to a candidate. The CLI evaluates it without changing application defaults. Do not pick a production threshold solely because it passes procedural examples.

To retain a UTF-8 report on Windows:

```powershell
node quality-benchmark.ts labelled-dataset.json candidate-config.json |
  Set-Content -LiteralPath benchmark-result.json -Encoding utf8
```

### Procedural image cases

[Fixtures](../frontend/src/pose-check/quality-benchmark.fixture.ts) generate grayscale RGBA images in memory, run the actual fixed-resolution pixel analysis, and attach explicit synthetic pose geometry. They are deterministic and need no downloaded images, inference session or package. They cover normal texture, darkness, clipping, backlighting, smooth/possibly blurry regions, feet outside the frame, proximity to an edge, a small/distant person, an occluded landmark, no person and multiple people. The acceptance examples use a different image size/pattern from calibration. Both sets are visible development fixtures, not a secret or independent acceptance dataset.

The [2026-11-09 synthetic report](quality-benchmark-2026-11-09.json) contains these results with default criteria:

| Split | Good passed / good total | Bad blocked / bad total | Bad passed | Good warned |
|---|---:|---:|---:|---:|
| Calibration, synthetic | 1 / 1 | 10 / 10 | 0 | 0 |
| Acceptance, synthetic | 1 / 1 | 10 / 10 | 0 | 0 |
| Human-labelled real data, both splits | No samples | No samples | Not measured | Not measured |

These counts verify the intended engineering checks on known constructions. They do not demonstrate a real-world false-acceptance or false-warning rate. No default threshold was changed on the strength of these results. The sample imbalance, shared generators and supplied pose geometry make these fixtures unsuitable for device or downstream-model acceptance.

## Real-data labelling contract

A dataset has `schemaVersion: 1`, `metricVersion: "video-quality-experimental-v1"`, and a non-empty `samples` array. Each sample requires:

| Field | Meaning |
|---|---|
| `id` | Unique sample identifier |
| `sourceGroup` | Stable pseudonymous group for related images/clips; never put a group in both splits |
| `split` | `calibration` or `acceptance`, assigned before tuning |
| `expected` | `good` or `bad`, decided by human inspection against the agreed video specification |
| `labelSource` | `human` for independently inspected real images; `synthetic` for constructed cases |
| `labelledBy` | Pseudonymous reviewer ID, not an automatically generated expected label |
| `provenance` | Clip/image hash, sampled frame/offset, capture setup, review date and explanation of the label |
| `frame` | Source dimensions, person boxes, raw HALPE26 points and pixel metrics; a D report's frame entry can be used directly |

`frame` requires `width`, `height`, `people`, `keypoints` and `quality`. Other D report fields are ignored by this static benchmark. Coordinates must be source pixels, not mirrored display coordinates. Pixel metrics must come from the current 128 × 128 analysis pipeline: finite non-negative values or `null`, and either an empty unknown histogram or 256 counts totalling 16,384 samples. The keypoint array has zero or 26 entries in HALPE26 order. The CLI rejects incompatible metric versions, malformed inputs, missing provenance, duplicate IDs and source groups crossing splits.

Example preparation from a downloaded D report, after independently reviewing the corresponding video/frame:

```powershell
$recording = Get-Content -LiteralPath recording-quality.json -Raw | ConvertFrom-Json
$sample = [ordered]@{
  id = 'session-01-frame-10'
  sourceGroup = 'participant-01-session-group'
  split = 'calibration'
  expected = 'good' # Replace with the reviewer decision; never copy the gate status as truth.
  labelSource = 'human'
  labelledBy = 'reviewer-01'
  provenance = 'Replace with the clip hash, actual offset, device/browser, review date and label explanation.'
  frame = $recording.frames[10] # Select a real index present in this report.
}
$dataset = [ordered]@{
  schemaVersion = 1
  metricVersion = 'video-quality-experimental-v1'
  samples = @($sample)
}
$dataset | ConvertTo-Json -Depth 30 |
  Set-Content -LiteralPath labelled-dataset.json -Encoding utf8
```

This is a format example, not an acceptance dataset. Add both good and bad real examples in both splits, from distinct source groups. Group adjacent frames and repeated/near-duplicate captures together; include the participant in the grouping when testing generalisation to new people. Keep an image/clip hash register because group names alone cannot detect copied images or dishonest labels. Record resolution, camera, distance, scene, lighting, clothing and motion variations. Resolve uncertain labels with the model team before freezing the dataset; do not label from the current warning output. Do not commit identifiable participant images or personal details as fixtures.

The D recorder can only start in Ready. To collect a controlled poor-quality scene using the current app, start in a passing scene and then introduce the quality problem while recording continues. Preserve and review the original clip. Do not weaken production thresholds simply to label a poor frame as good. Frames in a D report are inference samples; use the recorded capture offset to locate corresponding video content, allowing for the documented timing limitations.

### How to interpret the report

Every sample records its identity/provenance, expected label, predicted `pass / fail / unknown`, measured checks and reason codes. All eight static checks must pass for a sample to pass. A failed check blocks it; absent data also blocks it and is counted as unknown if no explicit failure is present.

Results are separated by split and label source so synthetic evidence cannot inflate human-labelled results:

- `badPassed`: bad samples incorrectly passing; `falseAcceptanceRate = badPassed / bad`.
- `goodWarned`: good samples blocked by a failed or unknown check; `falseWarningRate = goodWarned / good`.
- `badBlocked`, `goodPassed`, `unknown`, total counts and source-group counts provide the denominators/context.
- A rate is `null` when its corresponding class has no examples. Zero is never substituted for missing evidence.

These are sample-level proportions, not independent population estimates. Adjacent video frames are correlated; report grouping and capture coverage along with counts. No automatic pass/fail acceptance percentage is invented by the tool. The model team must agree the acceptable false-acceptance and false-warning limits before the held-out run.

## Calibration and acceptance procedure

1. Finish Phase A's official-image parity investigation and desktop physical-camera baseline, or clearly record any unresolved blocker before interpreting quality results.
2. Agree the downstream video specification with the model team using the table below. Independently label captured images/frames; retain their source clips for downstream testing.
3. Freeze the split manifest and hashes before adjusting thresholds. Keep all related frames in one split. The calibration analyst may inspect calibration labels; acceptance labels remain with a separate reviewer where possible.
4. Evaluate candidate configs on calibration data only. Inspect both error directions and per-reason examples. Retain every candidate report/config; changes must have a reason beyond improving one convenient scene.
5. Freeze the chosen config/version, then have another person run it once against acceptance data. Report bad-passed and good-warned counts/rates, unknowns and scene/device coverage. If acceptance drives another threshold change, retire that set as held-out evidence and collect a new acceptance set.
6. Run the retained reference clips through the large model. Compare its actual success/failure with quality-gate decisions; a gate pass alone does not establish usable downstream input. No automatic whole-clip deletion or clinical classification is introduced.

### Model-team decisions and evidence

| Item | Required decision/evidence | Current status |
|---|---|---|
| Recording tasks | Supported motions/postures and full-body/foot requirements | Pending model team |
| Video input | Minimum resolution, frame rate, orientation, format/codec, duration, mirroring and compression limits | Pending model team |
| Quality expectations | Acceptable framing, lighting, occlusion and blur, with labelled examples | Pending model team |
| Error trade-off | Maximum bad-passed and good-warned rates and required capture coverage | Pending model team |
| Reference pipeline | Model/config revision and official-image parity results | Phase A open |
| Reference clips | Clip hashes, gate outputs, downstream outputs, errors and reviewer judgement | Not run |
| Threshold release | Approved version/config and held-out report reviewed by another person | Not approved |

## Physical-device acceptance

After desktop acceptance, test Android Chrome and iPhone Safari on physical devices. A desktop browser resized to phone dimensions is only a layout check. Use the team's HTTPS URL accessible from the phone; HTTP to a laptop's LAN IP is not a replacement. Camera access requires a secure context as described in [MDN's getUserMedia security documentation](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#privacy_and_security). No new hosting service or system package is provisioned by this work.

For each device, record tester/date, device model, OS/browser version, URL/build revision, config version, front/rear camera, orientation, requested/actual resolution, runtime provider/fallback reasons and recording MIME type. Keep power mode, charging state, ambient conditions and run length with the measurements. Use pseudonymous capture/session IDs.

| Scenario | Expected behaviour | Android Chrome | iPhone Safari |
|---|---|---|---|
| HTTPS and permissions | Camera opens after permission; denied/revoked permission shows actionable English error | Not run | Not run |
| Front/rear cameras | Selection while stopped; dimensions and overlay alignment correct | Not run | Not run |
| Portrait/landscape rotation | Preview remains aligned; no stale Ready or distorted output | Not run | Not run |
| Good/poor scenes | Framing, lighting, blur and person-count warnings reflect reviewed cases | Not run | Not run |
| Ready and recording | Hold for two seconds; recheck on Start; warnings continue without stopping capture | Not run | Not run |
| Slow inference/stalled source | Stale overlay hidden and Ready cleared; monitoring limitations logged | Not run | Not run |
| Switch apps/background tab | Eligibility cleared; hidden/gap intervals recorded; no claim of guaranteed background capture | Not run | Not run |
| Lock/unlock | Observe actual track/recorder behaviour; preserve available data or show explicit error | Not run | Not run |
| Camera disconnect/interruption | End recording explicitly and preserve available video/report | Not run | Not run |
| Runtime/model recovery | Old readiness cleared; bounded recovery; report unavailable monitoring intervals | Not run | Not run |
| Playback/download/repeat | Video decodes, JSON matches session, clear/restart works, stream tracks released when stopped | Not run | Not run |
| Sustained load | Record camera FPS, inference updates/s, frame-age/stage median/P95, thermal symptoms and battery observations | Not run | Not run |

For baseline, measure at least five continuous minutes per runtime on the same camera, resolution and scene, with preview visible. Debug retains only 60 timing samples and excludes the first three warm-up frames; its final numbers are not a five-minute aggregate. D reports contain observed inference timings, not a complete camera-FPS history, hardware temperature readings, or a controlled benchmark. Do not infer actual camera acquisition FPS from inference sample count. Retain full-run measurements separately and distinguish measured temperature from subjective heat observations. Ten updates/s remains an optimisation target rather than automatic demo acceptance.

Mark a device tested/accepted only after the team reviews the recorded evidence. Unknown, interrupted and unsupported cases must remain explicit. Return to calibration if a device/scene needs different thresholds; do not silently weaken the production config during acceptance.

## Automated coverage and remaining gaps

| Area | Test level and coverage target | Example |
|---|---|---|
| Pixel/quality maths | Deterministic unit/regression; every added criterion and its boundary/unknown paths | Dark subject, bright background, out-of-frame heel |
| Benchmark contract and statistics | Unit/contract; both confusion directions, missing classes, invalid inputs and split leakage | A bad labelled frame passes; one clip appears in both splits |
| Readiness and interval logging | Deterministic temporal tests; resets, stale data, overlapping reasons and end closure | Repeated result cannot advance the hold |
| Recorder lifecycle | Unit plus browser smoke; final chunks, errors, stream end and playable output | Quality drops during a native recording |
| Actual model/pixels | Official-reference and real-image integration, still pending | Same image/box through official and browser pipelines |
| UI and devices | Focused manual/E2E on desktop first, then physical phones, still pending | Rotate during camera use; lock phone during recording |
| Model usefulness | Retained real-clip integration owned by model team, still pending | Gate pass but large model rejects clip |

Run `npm test`, `npm run lint` and `npm run build` after relevant changes. Automated tests and synthetic counts are a regression baseline, not a replacement for Phase A, independent human testing or hardware acceptance.
