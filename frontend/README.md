# Realtime RTMPose camera demo

The page opens a webcam and draws actual HALPE26 keypoints from RTMDet-Nano + RTMPose-s. Inference runs in a Web Worker using Auto (WebGPU with WASM fallback) or explicit WASM. No image, video, or pose result is uploaded or recorded.

## Run locally

Use Node 24 and npm. From the repository root:

```powershell
cd frontend
npm install
npm run prepare:models
npm run dev
```

Open the local URL printed by Vite in Chrome. Wait for the default models to load, click **Start Camera**, and allow camera access. **Stop Camera** releases the stream. Select another camera while stopped. **Mirror preview** flips the image and skeleton together without changing source coordinates.

**Test Still Image** runs the same detector and pose pipeline on a local JPEG or PNG without opening a webcam. Use **Clear Image** to reset it. This selects an image, never a model file.

The page reports people detected, clear keypoints out of 26, camera frame rate, pose updates per second, inference duration, and source dimensions. Expand **Debug** for runtime selection, stage timings, landmark scores, and the experimental score threshold. Scores are not accuracy percentages.

## Auto and WASM

**Auto** is the default. It requests an actual WebGPU adapter inside the worker, without browser-name detection. If unavailable, it loads WASM directly. When available, each model requests WebGPU with WASM operators allowed. The Debug labels deliberately say **WebGPU requested · WASM ops possible**, not that every operation runs on GPU. This follows the [ONNX Runtime WebGPU setup](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html).

If GPU session creation or inference fails, only that model is recreated on WASM and retried once. File-fetch and output-layout errors remain explicit errors. If the GPU device is lost, the camera may remain open while the old worker is terminated and a new WASM-only worker takes over. Old overlays are cleared; a second recovery request ends with an error instead of looping. Static images are reprocessed after recovery.

Choose **Debug → Runtime Mode → WASM** for a CPU baseline. Switching requires the camera to be stopped and processing to be finished; it clears existing results and starts a new worker. WASM stays at one thread. No startup performance benchmark, automatic fastest-provider selection, additional package, or cross-origin-isolation header is added. Initialization does run one zero-input probe per model to verify the actual tensor layout.

GPU-capable startup can load a larger runtime binary than WASM-only startup. Auto uses conditional imports, so a device without a GPU adapter takes the WASM entry directly. Model files, input sizes, preprocessing, thresholds, and detector frequency are the same in both modes.

## Timing definitions

Debug shows the latest wall-clock milliseconds plus median and nearest-rank P95 over the last 60 measured camera frames. The first three frames after camera start, worker replacement, or a model-session revision are excluded. Switching runtime or starting a new camera run resets statistics. Still images only update the latest values.

- **Read pixels:** drawing the bitmap into the worker canvas and reading RGBA pixels.
- **Detector / pose preprocessing, run, decoding:** measured separately; run times include CPU/GPU transfer and readback, not just GPU kernel execution.
- **Worker total:** all worker frame processing. The existing **Inference Time** value excludes the read-pixels stage.
- **Frame age:** main-thread capture start through main-thread receipt of the result; it includes bitmap creation and messaging, but not final React paint or photon-to-screen latency.

## Current limits

- This step provides live pose visibility, not a recording-readiness decision. Lighting, blur, backlighting, and framing-margin rules are not implemented yet. No clinical results are calculated.
- With multiple people, detection counts everyone above the detector threshold, but pose runs only on the largest bounding box. The UI warns about the extra people.
- Only one frame can be in flight. Frames arriving while inference runs are skipped; they do not accumulate in a queue.
- The loop checks decoded frame counts, so a stalled video source is not repeatedly treated as new input. Camera overlays older than one second are hidden. Static-image results remain until cleared.
- The target is 10 pose updates/s, not a guarantee. Auto and WASM must be compared on the target device; GPU support alone does not prove faster results. Mobile compatibility and physical-camera behavior still need device testing.

## Default models

`npm run prepare:models` downloads the official archives once, checks pinned SHA-256 hashes, and installs `public/rtmdet-nano.onnx` and `public/rtmpose-s-halpe26.onnx`. Matching existing assets are reused. No downloads run during `npm install`. Run model preparation after a fresh checkout and before building; weights are ignored by Git.

- Detector: [OpenMMLab RTMPose CPU ONNX bundle](https://download.openmmlab.com/mmpose/v1/projects/rtmpose/rtmpose-cpu.zip), using `rtmpose-ort/rtmdet-nano/end2end.onnx`.
- Pose: [RTMPose-s HALPE26 ONNX SDK archive](https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/onnx_sdk/rtmpose-s_simcc-body7_pt-body7-halpe26_700e-256x192-7f134165_20230605.zip), using its `end2end.onnx`.
- Landmark names and skeleton: [MMPose HALPE26 dataset definition](https://github.com/open-mmlab/mmpose/blob/main/configs/_base_/datasets/halpe26.py).

The hashes pin the retrieved files, not publisher-signed checksums. Check specific checkpoint and dataset terms before redistributing weights or using them in a product; the source repository's license alone does not settle those terms.

Default filenames and engineering thresholds live in `src/pose-check/halpe26.ts`. Model changes require a developer change, not a user-facing upload.

## Inference contract

Transforms follow the pinned archives' `pipeline.json` files:

- Detector: resize within 320 × 320 preserving aspect ratio, pad bottom/right with 114, normalize BGR channels. The exported graph provides NMS-filtered `dets` and `labels`; restore each axis using the actual resize scale.
- Pose: expand the largest box by 1.25, preserve its center, adjust to 192:256 aspect, affine-sample with black borders, and normalize RGB channels.
- Decode `simcc_x [1,26,384]` and `simcc_y [1,26,512]` using per-axis argmax, split ratio 2, and the minimum of the two axis scores. Map through the inverse crop to source pixels. Batch/keypoint metadata may be symbolic; actual output dimensions are checked during inference.

The manual bilinear sampler follows these transforms but has not been proven bit-identical to OpenCV's quantized interpolation. Independent numerical parity with the official MMPose pipeline remains unverified.

### Reference audit — 2026-11-07

A source-level check against [MMDeploy SimCCLabelDecode](https://github.com/open-mmlab/mmdeploy/blob/main/csrc/mmdeploy/codebase/mmpose/simcc_label.cpp) found one decoder discrepancy: non-positive axis responses previously retained an argmax position and clamped negative scores to zero. The decoder now uses the reference's `-1` location on both axes before split-ratio and inverse-crop mapping, and preserves the minimum axis score. The output still contains 26 source-coordinate points in HALPE26 order. A sentinel mapped through a crop can land inside the source image; its non-positive score must not be interpreted as a visible landmark.

Regression tests cover non-positive responses, unequal axis scores, tied maxima, all 26 output indices, and off-center inverse mapping. These are formula checks, not independently generated reference-image outputs. No numerical image parity or physical-camera baseline was completed in this audit: the available Python environment has no OpenCV, NumPy, ONNX Runtime, MMPose, or MMDeploy. No packages or models were downloaded.

Phase A remains open. Before adding quality thresholds, run the identical image and pinned weights through the official deployment pipeline and this application. Record source image/model hashes, reference revision and pipeline configuration, preprocessed tensor differences, person boxes, all named keypoint coordinates and raw scores, and maximum/mean absolute differences. Compare pose with both the same supplied box (to isolate pose preprocessing/decoding) and each detector's own box (end-to-end). Explain interpolation or provider differences before accepting parity.

Then measure a physical camera in desktop Chrome for at least five minutes per runtime, with the preview visible. Record device/browser, source resolution, actual runtime labels and fallback events, camera FPS, inference updates/s, and frame-age/stage median and P95. Debug's statistics cover only the last 60 measured frames; they are not a five-minute aggregate. The existing synthetic worker report must not be used as a physical-camera baseline. Stop for team review before Phase B, as required by the implementation plan.

## Verification

```powershell
npm test
npm run lint
npm run build
```

Automated tests cover channel order and padding, detector filtering and coordinate restoration, crop geometry, SimCC decoding, score/frame-boundary checks, GPU capability detection, independent model fallback, bounded retry, device-loss observation, warm-up exclusion, and the 60-frame statistics window.

Browser verification used the [official MMDeploy sample image](https://github.com/open-mmlab/mmdeploy/blob/main/demo/resources/human-pose.jpg): one person, 26 output landmarks, overlay visually aligned. A temporary synthetic 640 × 480 camera stream checked live overlays, mirroring, no-person/multiple-person warnings, frozen-frame invalidation, denied permission, repeated start/stop, and stream-track release. No physical webcam was accessed during these tests.

The Auto/WASM change also passed synthetic camera recovery and retry-loop checks, plus production-preview initialization in both modes and actual still-image inference on WASM. See the [2026-11-07 performance report](../docs/runtime-performance-2026-11-07.md) for two continuous five-minute worker runs and their limits. Earlier exploratory camera rates used a different test context and are not directly comparable. Physical-camera, Android, and iPhone acceptance tests are still pending.

## Windows cache permissions

Vite's dependency cache is stored in OS temp, separated by account and project path. Restricted accounts that cannot report their identity get a per-process cache. The old shared `node_modules/.vite` cache is no longer used, preventing sandbox-owned cache files from causing `EPERM: unlink` for a developer account.
