# Auto / WASM runtime validation — 2026-11-07

Auto improved worker pipeline throughput in this test, but neither mode met the 10 updates/s target. These results do not certify physical-camera latency, mobile support, clinical accuracy, or a general GPU speedup.

## Environment and method

- CPU: 12th Gen Intel Core i7-1270P; Windows kernel 10.0.26200, x64.
- Browser: Codex in-app Chromium; user agent reports Chrome/156.0.0.0. A separate desktop Chrome check also initialized the WebGPU models successfully.
- Browser-reported default adapter: Intel, architecture `gen-12lp`. Per-operator GPU placement was not profiled. A WebGPU-requested session may use WASM operators.
- ONNX Runtime Web: 1.31.1. WASM was limited to one thread; the default pinned RTMDet-Nano and RTMPose-s HALPE26 files were unchanged.
- Input: the [official MMDeploy human-pose image](https://github.com/open-mmlab/mmdeploy/blob/main/demo/resources/human-pose.jpg), drawn at `(169, 0, 302, 480)` into a 640 × 480 canvas with `#cbd5e1` background.
- Each run used the actual application worker and its bitmap readback, preprocessing, sessions, decoding, and output validation. A new bitmap was sent only after the previous result. No frame queue accumulated.
- Three warm-up frames were discarded, followed by at least 300 seconds of samples. Auto ran first, then a fresh WASM-only worker. No provider changes, device-loss events, or runtime errors occurred in the measured runs.
- A camera-based synthetic trial was affected by browser animation throttling. The final comparison therefore fed the same repeated image directly to the worker without `requestAnimationFrame` scheduling. Reported throughput is worker pipeline capacity, not a 30 FPS camera or end-to-end UI benchmark.
- This was one sequential pair of runs. Power mode, thermal state, and unrelated system load were not controlled. Earlier exploratory camera FPS figures are not comparable.

## Results

| Measurement | Auto | WASM |
|---|---:|---:|
| Measured duration | 300.05 s | 300.33 s |
| Measured frames | 1,070 | 528 |
| Pipeline updates/s | 3.57 | 1.76 |
| Detector session | WebGPU requested, WASM ops possible | WASM |
| Pose session | WebGPU requested, WASM ops possible | WASM |
| Worker total median / P95 | 265.70 / 355.30 ms | 554.95 / 629.20 ms |
| Capture-to-result median / P95 | 266.30 / 355.80 ms | 556.55 / 640.90 ms |

Auto delivered about twice the throughput in this environment. The capture-to-result measurement ends when the result reaches the main thread; it excludes final UI paint and actual camera acquisition delay.

| Stage | Auto median / P95 (ms) | WASM median / P95 (ms) |
|---|---:|---:|
| Read pixels | 9.30 / 13.00 | 11.90 / 18.90 |
| Detector preprocessing | 69.85 / 96.50 | 91.80 / 103.40 |
| Detector run | 75.30 / 96.80 | 174.80 / 204.10 |
| Detector decoding | 0.00 / 0.10 | 0.00 / 0.10 |
| Pose preprocessing | 33.50 / 47.20 | 43.50 / 50.80 |
| Pose run | 76.00 / 124.90 | 229.60 / 253.90 |
| Pose decoding | 0.30 / 1.10 | 0.20 / 1.40 |

These are independent per-stage distributions; their medians and percentiles should not be summed as if they were one frame. CPU preprocessing remains material, so accelerating the model alone cannot remove all latency.

## Output comparison

Both modes detected one person and returned all 26 landmarks in the same HALPE26 order on the identical test image. Comparing final outputs:

- Maximum coordinate difference: 0.00006092 source pixels; mean: 0.00005339 pixels.
- Maximum absolute model-score difference: 0.000003338.

This establishes near-identical outputs on this fixture only. It is not numerical parity with the official OpenCV/MMPose implementation, nor a motion or patient-data accuracy study.

## Functional validation

- 18 automated tests passed, including capability absence/rejection, GPU session and inference failures, independent per-model fallback, WASM errors, bounded retry, direct/promise device handles, canceled watchers, and timing-window reset/warm-up behavior.
- A synthetic camera stayed open with one live track while an injected GPU-loss event replaced its worker with WASM. The overlay was invalidated and results resumed. Injecting another loss ended with an error and released the stream instead of creating a retry loop.
- No physical GPU reset was performed; device loss was simulated through the actual worker message boundary.
- Production preview initialized Auto with WebGPU-requested sessions, then switched to explicit WASM. A real image inference in production WASM returned one person and 26 clear keypoints at score threshold 0.3.
- Tests, TypeScript checks, lint, and production build passed. No new dependencies were installed for this change.

## Recheck before acceptance

Run `npm test`, `npm run lint`, and `npm run build`. On the target device, compare Auto and WASM through Debug using the same camera, resolution, scene, and run length. Stop the camera before switching; ignore the first three frames and inspect both frame age and update rate. Keep the preview visible during camera-rate tests to avoid browser throttling.

The 10 updates/s target is still unmet in this controlled worker test. Physical-camera behavior, Android Chrome, iPhone Safari, sustained temperature, and battery usage require separate device measurements. If Auto is slower on a target device, use the Debug WASM baseline rather than claiming acceleration from API support alone.
