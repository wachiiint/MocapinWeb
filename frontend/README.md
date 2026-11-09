# Realtime RTMPose camera demo

The page opens a webcam and draws actual HALPE26 keypoints from RTMDet-Nano + RTMPose-s. Inference runs in a Web Worker using Auto (WebGPU with WASM fallback) or explicit WASM. Nothing is uploaded. After the experimental checks pass, the user can explicitly record camera video and download it together with a local quality report.

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

For Android testing over Wi-Fi, use the HTTPS setup below; `npm run dev -- --host` alone serves HTTP and does not enable camera access from a LAN IP.

**Auto** is the default. It requests an actual WebGPU adapter inside the worker, without browser-name detection. If unavailable, it loads WASM directly. When available, each model requests WebGPU with WASM operators allowed. The Debug labels deliberately say **WebGPU requested · WASM ops possible**, not that every operation runs on GPU. This follows the [ONNX Runtime WebGPU setup](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html).

If GPU session creation or inference fails, only that model is recreated on WASM and retried once. File-fetch and output-layout errors remain explicit errors. If the GPU device is lost, the camera may remain open while the old worker is terminated and a new WASM-only worker takes over. Old overlays are cleared; a second recovery request ends with an error instead of looping. Static images are reprocessed after recovery.

Choose **Debug → Runtime Mode → WASM** for a CPU baseline. Switching requires the camera to be stopped and processing to be finished; it clears existing results and starts a new worker. WASM stays at one thread. No startup performance benchmark, automatic fastest-provider selection, additional package, or cross-origin-isolation header is added. Initialization runs one zero-input probe per model to verify tensor layout. WebGPU outputs are then checked against WASM on actual input frames as described below.

GPU-capable startup can load a larger runtime binary than WASM-only startup. Auto uses conditional imports, so a device without a GPU adapter takes the WASM entry directly. Model files, input sizes, preprocessing, thresholds, and detector frequency are the same in both modes.

## Auto output verification — S22 investigation

A physical Samsung S22 test on 2026-11-09 reported normal live camera progress but zero detected people in Auto. On the same public MMDeploy image, WASM detected one person and 26 points in landscape, portrait and mirrored portrait; WebGPU-requested sessions detected zero in all three. This isolates a provider-dependent output discrepancy for this model/device path. It does not identify a particular GPU operator, driver defect or affect all Android devices.

Auto now verifies each WebGPU model against a temporary WASM session using **the identical preprocessed input tensor**, before trusting a positive output. Detector checks compare person counts and one-to-one boxes/scores; pose checks compare all 26 decoded coordinates/raw scores in the shared crop. Verification is per model, so a detector mismatch does not automatically disable a pose session that agrees with WASM. No camera image is saved or uploaded for this check, and no browser-name blacklist or new model/package is added.

A mismatch adopts the already-created WASM session, releases the GPU session, increments the runtime revision and reports the fallback reason in Debug. A positive match keeps GPU, marks verification passed and releases the temporary WASM session; subsequent frames do not run a reference check. An empty scene on both detectors is **inconclusive**, not an error or proof of GPU correctness. The model stays pending, uses the WASM result and reuses its reference session until a positive result can be checked. Pose outputs with no positive response likewise remain unverified. WASM reference failures remain explicit errors; GPU exceptions retain the original bounded fallback behaviour. Stopping/replacing the worker resets verification, and closing the runtime releases both active and pending sessions.

Engineering parity tolerances live in [runtime-output.ts](src/pose-check/runtime-output.ts), version `runtime-parity-v1`: detector box coordinates within 1 model-input pixel and raw score difference at most 0.01; pose coordinates within 0.5 model-input pixels and raw score difference at most 0.001. These are conservative provider-consistency tolerances, not clinical thresholds, confidence percentages or a guarantee that either model is correct. Malformed tensor layouts still report errors. Non-finite GPU values fail verification; non-finite reference values report an explicit reference error.

Debug displays pending/passed verification and the provider/fallback reason for each model. Reference runs are included in the detector/pose run timings and can make the first frames substantially slower. Until a positive frame is verified, empty scenes also pay the additional reference-inference cost. The existing one-second freshness rule and two-second readiness hold are unchanged: a slow result is still hidden and cannot authorise recording. This change fixes silent provider disagreement, not mobile throughput. S22 WASM reference timings were roughly 0.9–1.1 seconds, so live-camera freshness/performance needs a separate device recheck.

The development-only `/pose-diagnostic.html` page uses the existing worker and public MMDeploy sample image without accessing the webcam. Reload it and confirm the marker **Runtime fix: same-frame WASM verification v1** before retesting S22. It now shows verification and fallback reasons as well as counts. Expected on this failing device: Auto changes the mismatching model to WASM and returns the reference detections. Post-change desktop browser checks retained WebGPU with verification passed and returned one person/26 points in all three image layouts. A separate browser regression simulated a successful GPU result containing zero people while running the actual WASM detector on the same input tensor: both the verification result and subsequent frame detected one person; the runtime stayed on WASM with one reference creation and one release of each session. Actual S22 confirmation after this code change is still pending. The diagnostic HTML/photo are temporary investigation artifacts and are not included in the production index build; remove them after collecting the device recheck. The earlier raw WebGPU result of zero is retained as user-provided evidence, not relabelled as a passing mobile test.

## Timing definitions

The **Processing timings** panel in Debug is collapsed by default and can be opened or closed independently of the experimental quality criteria. It shows the latest wall-clock milliseconds plus median and nearest-rank P95 over the last 60 measured camera frames. The first three frames after camera start, worker replacement, or a model-session revision are excluded. Switching runtime or starting a new camera run resets statistics. Still images only update the latest values.

- **Read pixels:** drawing the bitmap into the worker canvas and reading RGBA pixels.
- **Detector / pose preprocessing, run, decoding:** measured separately; run times include CPU/GPU transfer and readback, not just GPU kernel execution.
- **Worker total:** all worker frame processing. The existing **Inference Time** value excludes the read-pixels stage.
- **Frame age:** main-thread capture start through main-thread receipt of the result; it includes bitmap creation and messaging, but not final React paint or photon-to-screen latency.

## Current limits

- Experimental framing, lighting, sharpness, continuity and recording-readiness checks are implemented. Thresholds have not been validated against the official reference, downstream model, or a device acceptance dataset. No clinical results are calculated. Local recording is implemented; uploading is not.
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

Default model filenames and detector threshold live in `src/pose-check/halpe26.ts`. Versioned quality criteria live in [quality-config.ts](src/pose-check/quality-config.ts). Model changes require a developer change, not a user-facing upload.

## Experimental quality gate (B and C)

On 2026-11-08 the developer requested implementation of B/C while deferring Phase A testing. This changes development order only: official image parity, the physical-camera baseline and independent testing remain open. Earlier synthetic performance results predate these extra pixel checks.

The existing worker reuses local RGBA pixels; no extra model, package, worker, or upload is added. [Pixel analysis](src/pose-check/quality-pixels.ts) resamples the detected person's rectangle to a fixed 128 × 128 grayscale grid with bilinear interpolation. It reports mean luminance, a rounded-luminance histogram, and the variance of the interior four-neighbour Laplacian. Background luminance uses a separate 128 × 128 whole-image grid excluding the person rectangle. These rectangles include clothing and some background; they are not segmentation masks. Uniform clothing, texture, resampling, exposure, and noisy images can affect sharpness and lighting warnings. Sharpness cannot determine whether a lens or motion caused blur.

With no person, multiple people, an unusable rectangle, or insufficient background, dependent checks return `unknown`. Unknown never qualifies for Ready. [Quality checks](src/pose-check/quality-checks.ts) require one person, exactly 26 sufficiently scored in-frame points, box/point edge margins and minimum box height/width. Low-confidence coordinates leave framing unknown. Both feet are included through all 26 HALPE26 points. A high score does not establish actual visibility; posture and facing direction are instructions, not verified orientation classifications.

All defaults below are experimental engineering values, not clinical criteria:

| Criterion | Default |
|---|---|
| Raw keypoint score | At least 0.3 for each of 26 points |
| Box and point margin | At least 0.03 of each source dimension |
| Person height / width | At least 0.45 / 0.12 of the source dimension |
| Person luminance | At least 45 on a 0–255 scale |
| Bright-pixel clipping | At most 0.20 of rounded person samples at luminance 245 or above |
| Possible backlighting | Background minus person luminance above 55 while person luminance is below 120 |
| Sharpness | Laplacian variance at least 35 on the fixed analysis grid |
| Camera interruption / pose freshness | At most 1,000 ms each |
| Continuous passing time | At least 2,000 ms |

Open **Debug**, then expand **Experimental quality criteria and results** to change every quality threshold, inspect `pass / fail / unknown`, reason codes and measured values, or reset defaults. Base version is `video-quality-experimental-v1`; non-default values are labelled session overrides and are not saved across reloads. The readiness evaluator uses the entire config snapshot in its continuity key, so any change restarts the hold. Debug allows stricter freshness limits and longer holds, but cannot extend freshness beyond one second or shorten the hold below two seconds.

[Readiness](src/pose-check/readiness.ts) is independent of React and accepts a monotonic timestamp for deterministic tests. Status is **Camera Off**, **Loading Models**, **Checking**, **Needs Adjustment**, **Ready — Experimental**, or **Error**. Every check must pass across new inference results for two seconds; reusing a result on watchdog ticks does not advance the passing time. Any failed/unknown check resets the hold. Stale/missing results return Checking, clear the overlay and prohibit recording eligibility. Camera progress is sampled separately from inference results. A failed camera-progress check also removes the overlay and prevents Ready. Timers run every 100 ms while the page is scheduled, so visible invalidation occurs on the next tick. Hiding the page cancels eligibility; switching runtime, session revision, camera generation, model recovery, stopping the camera and config changes reset continuity. Long scheduling gaps also restart the hold.

The main advice and all issues use stable reason codes sorted as error → person count → framing/size → lighting → blur → keypoints → performance. UI text is English. Clear Keypoints shows the count out of 26. The status warns Keypoints Incomplete without listing landmark names; individual raw scores remain available in Debug. Still images show quality results but never become Ready or permit recording. `canStartRecording` is exposed by the evaluator; the recorder rechecks eligibility at the actual automatic recording start. Ready only means these experimental checks currently pass; it does not certify the entire clip, clinical suitability or downstream model success.

### B/C verification and manual follow-up

Automated cases cover threshold boundaries, no/multiple people, out-of-frame feet, weak landmarks, small people, simultaneous issues and priority, dark/clipped/backlit regions, smooth/textured images, fixed analysis resolution, mirrored framing, unknown data, the two-second hold, repeated result reuse, stale pose versus camera stalls, camera/model/config resets, hidden pages and still-image restrictions. Existing preprocessing/runtime tests remain included.

Browser smoke testing used a generated uniform 128 × 128 PNG through the actual Auto worker: zero people, Needs Adjustment, dependent checks unknown, and recording Not Allowed. Debug editing/reset and model startup were checked. This is not a physical-camera, readiness-in-motion, performance, or independent-person acceptance test.

Still required: let another person test B/C on a physical desktop Chrome camera. Try good framing, hidden feet, all frame edges, moving farther away, entering/leaving the scene, additional people, dark light, bright clipping, backlighting and blur. Verify warnings disappear after correction, a new two-second hold is required, and Ready is lost for camera interruptions, slow inference, backgrounding, stop/restart, runtime switching and recovery. Record device, browser, settings, actual outputs and failures. Finish Phase A separately before treating the quality thresholds as validated. Phase D is now implemented as described below. Phase E calibration/mobile acceptance remains pending.

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

Then measure a physical camera in desktop Chrome for at least five minutes per runtime, with the preview visible. Record device/browser, source resolution, actual runtime labels and fallback events, camera FPS, inference updates/s, and frame-age/stage median and P95. Debug's statistics cover only the last 60 measured frames; they are not a five-minute aggregate. The existing synthetic worker report must not be used as a physical-camera baseline. Phase A acceptance remains pending even though B/C implementation was subsequently requested.

## Local video recording and quality report (D)

This extends the original data-only Phase D with a local recorder, as requested and approved by the developer. Use desktop Chrome on localhost or HTTPS. No backend, upload, additional package or new model is involved. Phase A and independent-person acceptance are still pending.

1. Start Camera and wait for **Ready — Experimental**. Every experimental check must pass continuously for at least two seconds.
2. After the existing two-second readiness hold passes, a visible five-second countdown starts automatically. Any failed/unknown check, hidden page, camera loss, session/config reset or long scheduling gap cancels it; recovery starts a full new countdown. Freshness, visibility, camera health and readiness are checked with monotonic time throughout and again at recording start. Only one recording can start. Startup errors require **ลองใหม่** instead of retrying automatically.
3. During recording the elapsed time and **หยุดอัด** remain available. Quality warnings, stale inference, model recovery and page visibility problems are logged without automatically stopping the clip. Quality config changes are disabled until recording finishes; runtime changes already require stopping the camera.
4. Click **หยุดอัด** to finish. Preview the local video and use **ดาวน์โหลดวิดีโอ** and **ดาวน์โหลดรายงาน**. **Stop Camera**, a disconnected camera or an encoder error also finishes the recording and keeps available data with an explicit stop reason. Empty output still provides a report; an error-generated partial file may not be playable.
5. Download what you need, then use **ล้างวิดีโอเพื่ออัดใหม่** before the next automatic countdown. The recorder does not replace a previous clip automatically. Stopping a recording leaves the camera running; stopping the camera releases its tracks.

The recorder uses the existing camera stream: camera pixels, no audio, no skeleton overlay. Mirroring only changes the live preview, not saved pixels. It chooses a browser-supported WebM format (VP9/VP8 where supported), then MP4 or the browser default; the actual type determines the filename extension. The [MediaRecorder stop lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/stop) delivers final data before the stop event; finalization waits for that stop event rather than constructing a file immediately after calling stop.

Video chunks, observed quality frames and download URLs remain in browser memory. They are not persisted across reloads or closing the page, and long recordings can consume substantial memory. Download before clearing or reloading. Clearing/unmounting revokes object URLs, and unmounting disposes the recorder. This demo does not provide crash recovery, a background recorder, automatic uploads or whole-clip acceptance/rejection.

### Quality report contract

[recording-report.ts](src/pose-check/recording-report.ts) defines a versioned, local report with `schemaVersion: 1` and `purpose: experimental-video-quality`. It contains:

- The full config snapshot (including session overrides), config version, source dimensions, actual MIME type, UTC start date, duration and stop reason.
- Observed inference frames: source timestamp, generation, dimensions, boxes, HALPE26 points, pixel metrics, stage timings, runtime revision, config version, all `pass / fail / unknown` checks, status and recording eligibility. Browser keypoints are quality/debug data, not clinical measurement results.
- `capturedOffsetMs` and `observedOffsetMs`, relative to the same `performance.now()` origin used when requesting recording start. Pre-recording frames are excluded, repeated result observations are deduplicated, and input snapshots are copied. This is an inference log, not one pose result for every encoded video frame.
- `issueIntervals`: start/end offsets in milliseconds and stable reason codes. Each reason remains open while continuously present; recovery or recording end closes it. Reasons with identical boundaries are grouped. Different reasons may overlap without losing their individual onset times. Failed and unknown checks are both tracked.
- `PAGE_HIDDEN`, `MODELS_UNAVAILABLE` and `MONITORING_GAP` identify monitoring limitations. A gap longer than the configured freshness limit is marked conservatively from the last observation to the next. Missing observations are never assumed to be good video.

The recorder samples quality every 100 ms and when committed gate/frame inputs or page visibility change. Intervals describe when the browser observed a problem; inference latency and browser scheduling affect those times. Duration ends at the stop request (or observed native stop), while chunk delivery may finish later. The timestamps are approximate wall-duration offsets, not sample-accurate video presentation timestamps or clinical event timings. Camera and model failures remain distinct from temporary quality problems.

### D verification

Automated tests cover continuous/overlapping issues, recovery, unknown data, config/frame snapshots, frame deduplication, monotonic timestamps, hidden pages, scheduling gaps, stop closure, expired Ready clicks, encoder startup failure, quality warnings during recording, final-chunk ordering, camera end, recorder errors, empty output and disposal.

A browser test used the real React app and native MediaRecorder with a synthetic 640 × 480 canvas camera and deterministic model outputs. It reached Ready, started recording, continued after a simulated missing landmark, stopped, and exposed playback/download links. The downloaded JSON described a 10,016.6 ms WebM/VP9 recording, 150 observed inference frames, and one issue interval from 4,803.8 ms to recording end with `FRAMING_UNKNOWN` and `KEYPOINTS`. A second recording simulated camera loss: the clip finalized with `camera-ended`, retained a native-decodable 640 × 480 video and report, and returned the camera UI to Error. The unmodified application also initialized its real models and kept Start Recording disabled while Camera Off. No physical webcam or patient video was recorded in these tests. The temporary simulation page was removed after verification.

Still required: have another person test recording, playback, both downloads, repeated runs, Stop Camera, real device disconnects, backgrounding, actual model recovery and long-session memory use on a physical desktop Chrome camera. Test unsupported recording formats/browser behavior and mobile devices separately. Complete Phase A before relying on the thresholds.

## Threshold evaluation and device acceptance (E)

The [Phase E validation guide](../docs/video-quality-validation.md) defines independent labelling, calibration/acceptance separation, model-team decisions and the physical Android Chrome/iPhone Safari test matrix. The implementation is a single-frame benchmark; it does not make a whole-video decision or replace Phase A.

From `frontend`, run:

```powershell
node quality-benchmark.ts --synthetic
node quality-benchmark.ts labelled-dataset.json candidate-config.json
```

The CLI reports bad samples incorrectly passed and good samples incorrectly warned about, with separate calibration/acceptance and synthetic/human summaries. Related source groups cannot cross splits. Missing classes produce `null` rates; unknown checks never pass. Candidate configs are evaluated without changing application defaults. Real samples can use frame entries from a downloaded D report after independent human labelling; see the guide for the exact contract.

The [synthetic report](../docs/quality-benchmark-2026-11-09.json) covers 22 generated-image/pose cases, all matching their expected engineering decisions. These are regression fixtures with supplied pose geometry, not official inference outputs or real-device acceptance evidence. No default threshold was tuned from them. Human-labelled calibration/acceptance data, model-team video specifications/downstream clip trials, and physical mobile speed/thermal/continuity testing remain pending. Phase E is therefore not fully accepted.

## Verification

### Team testing status — 2026-11-08

The developer reports trying the current demo personally. The exact device, scenarios, and measurements were not recorded in this update. **Independent testing by another person is still required.** Do not treat this self-test as completion of Phase A or device acceptance.

The next tester should check still-image alignment, camera start/stop, mirroring, no-person and multiple-person warnings, stale overlays, and Auto/WASM behavior. Record tester, date, device/browser, scenarios, expected/actual results, and any failures. The official same-image reference comparison and five-minute physical-camera baseline per runtime remain pending separately.

### Comparing reference outputs

Use the dependency-free [comparison CLI](compare-reference.ts) with Node 24:

```powershell
node compare-reference.ts reference.json browser.json
```

Each JSON file must contain `schemaVersion: 1`, lowercase `imageSha256`, `detectorSha256`, and `poseSha256` hashes, integer source `width`/`height`, `coordinateSpace: "source-unmirrored"`, `mode: "end-to-end"` or `"shared-box"`, and a non-empty `provenance` string. Include the reference commit/configuration or browser runtime details in provenance. Both runs must use identical image/model hashes, dimensions, and mode. Values must come from actual runs; the CLI does not generate official reference results or export browser results.

Supply `people` as source-pixel `{x1,y1,x2,y2,score}` boxes and `keypoints` as `{name,x,y,score}` entries in the exact order and English names from [KEYPOINT_NAMES](src/pose-check/halpe26.ts). Keep raw scores, including non-positive values. End-to-end output has 26 points for the largest person, or an empty keypoint array if no person was detected. Shared-box mode requires 26 points and an identical `suppliedBox` in both files.

The report shows per-point differences, person-count differences, and maximum/mean absolute coordinate and score differences. Boxes are paired by descending area; this does not establish person identity and ties need manual inspection. Missing detections yield unavailable comparisons rather than zero error. Invalid or incompatible inputs exit with an error. No tolerance or automatic pass decision is supplied. Tensor/preprocessing parity and human review remain separate requirements.

```powershell
npm test
npm run lint
npm run build
```

Automated tests cover channel order and padding, detector filtering and coordinate restoration, crop geometry, SimCC decoding, score/frame-boundary checks, GPU capability detection, independent model fallback, bounded retry, device-loss observation, warm-up exclusion, and the 60-frame statistics window.

Browser verification used the [official MMDeploy sample image](https://github.com/open-mmlab/mmdeploy/blob/main/demo/resources/human-pose.jpg): one person, 26 output landmarks, overlay visually aligned. A temporary synthetic 640 × 480 camera stream checked live overlays, mirroring, no-person/multiple-person warnings, frozen-frame invalidation, denied permission, repeated start/stop, and stream-track release. No physical webcam was accessed during these tests.

The Auto/WASM change also passed synthetic camera recovery and retry-loop checks, plus production-preview initialization in both modes and actual still-image inference on WASM. See the [2026-11-07 performance report](../docs/runtime-performance-2026-11-07.md) for two continuous five-minute worker runs and their limits. Earlier exploratory camera rates used a different test context and are not directly comparable. Physical-camera, Android, and iPhone acceptance tests are still pending.

## Android camera over Wi-Fi: HTTPS development

Vite now supports an explicit HTTPS mode using its built-in [server.https option](https://vite.dev/config/server-options#server-https), without an additional npm package. It does not change normal `npm run dev` or production builds. A phone opening `http://YOUR_PC_IP:5173` is not using localhost and normally cannot access the camera; use a trusted HTTPS origin instead ([camera security requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#privacy_and_security)).

### Prepare once on the development computer

This machine already has OpenSSL 3 available. On another machine, `openssl version` must work first; no tools or trust stores are automatically installed by this project. Use an existing OpenSSL 3 installation or obtain one through your team's approved setup process.

From `frontend`, identify the Wi-Fi IPv4 address (`ipconfig` on Windows), then run:

```powershell
npm run prepare:https -- -Address 192.168.1.10
```

Replace the example address with the computer's current Wi-Fi IPv4 address. The helper creates a local development CA if none exists, a 30-day server certificate containing that IP plus localhost/127.0.0.1, and a matching private key. It verifies the signed certificate before reporting success. Existing CA files are reused so a server-certificate renewal/IP change does not require reinstalling an unchanged CA on the phone. A missing half of the CA pair or a CA with less than 30 days remaining stops preparation instead of silently replacing the trusted CA. No Windows or Android trust store is changed.

Generated files in `frontend` are ignored by Git:

- `dev-https-ca.local.crt`: public CA certificate; this is the only file to transfer to the test phone.
- `dev-https-ca-key.local.pem`: private CA key; keep on the development computer.
- `dev-https.local.pem` and `dev-https-key.local.pem`: server certificate/private key; keep on the development computer.
- `dev-https-ca.local.srl`: local signing serial state.

Do not place certificates or keys in `public`, including its subdirectories. Vite's existing default file-deny rules block certificate/key downloads from the project root; HTTPS mode also rejects custom certificate/key paths inside `public`. The CA file must be transferred separately, not exposed by adding an unauthenticated private-key download route.

### Install the public CA on the Android test phone

Transfer **only** `dev-https-ca.local.crt` to the phone using your normal file-transfer method. On the phone, open Settings and search for **Install a certificate** or **CA certificate**. A common path is **Security & privacy → More security settings → Encryption & credentials → Install a certificate → CA certificate**. Manufacturer/Android versions may use different labels. Select the CA certificate category for website trust, rather than a Wi-Fi client credential. The device may require its screen-lock PIN and confirmation. This trusts the local development CA on that test device; use your own test device or obtain the device owner's approval. Managed phones may prohibit user-installed CAs.

Close/reopen Chrome after installation. This manual trust step is required; changing the Vite URL to HTTPS by itself does not make the new CA trusted. A privacy/certificate warning is not successful setup. Check the IP and CA installation rather than bypassing the warning. To remove this development trust after testing, remove the specific Mocapin CA through the device's user credentials/trusted credentials settings; do not clear unrelated credentials.

### Start and open the HTTPS app

```powershell
npm run dev:https -- --host
```

Open `https://YOUR_PC_IP:5173` in Android Chrome, allow the camera and test. Keep the computer and phone on the same Wi-Fi. HTTPS mode uses strict ports: if the existing HTTP server is already using 5173, stop that terminal with Ctrl+C or run both servers on separate ports:

```powershell
npm run dev:https -- --host --port 5174
```

Then open `https://YOUR_PC_IP:5174`. Include **https://**, not http://. If Windows asks about Node network access, allow the intended private development network only. Guest Wi-Fi or client isolation can prevent communication even on the same SSID. The server must remain running; models, inference and recording execute on the phone.

HTTPS mode defaults to `dev-https.local.pem` and `dev-https-key.local.pem`. For custom locations, copy [.env.example](.env.example) to `.env.https.local` and set `DEV_HTTPS_CERT`/`DEV_HTTPS_KEY` to relative-to-frontend or absolute paths. These server-only settings do not use a `VITE_` prefix. Missing, invalid or mismatched files fail startup with guidance instead of falling back to HTTP. Restart Vite after certificate/path changes. If the Wi-Fi IP changes, rerun preparation for the new address, then restart the server. A browser on the development computer also needs to trust the public CA if you want to use its HTTPS page there; the helper does not install that trust automatically.

Verification here used a Node HTTPS client that explicitly trusted the generated CA: the application route and model HEAD request succeeded, the Wi-Fi IP matched the server certificate, and direct key/environment-file requests were denied. Missing certificates, invalid/mismatched keys and paths inside `public` failed startup as expected. Normal HTTP development configuration and production build still worked. Physical Android certificate installation and camera use must be confirmed on the phone; they cannot be certified by these server tests.

## Windows cache permissions

Vite's dependency cache is stored in OS temp, separated by account and project path. Restricted accounts that cannot report their identity get a per-process cache. The old shared `node_modules/.vite` cache is no longer used, preventing sandbox-owned cache files from causing `EPERM: unlink` for a developer account.

The camera UI uses short Thai instructions and a large status/countdown directly below the preview, outside its mirror transform. Technical metrics and all diagnostic issues are available in Debug. Physical desktop/mobile camera, backgrounding, mirrored preview, playback and download acceptance should be rechecked on actual devices.

Automatic-start verification: 63 automated tests pass, including five-second timing, one start per uninterrupted readiness run, failed-check cancellation, session/config key changes and scheduling gaps. A temporary React StrictMode harness exercised the real quality gate, recording hook, controls and native MediaRecorder with a synthetic canvas stream. A failed check cancelled the countdown; recovery restarted at five and recording began 5,020 ms later. Stopping retained a decodable 640 × 480 WebM/VP9 clip (12,877.5 ms), and both video and schema-version-1 JSON downloads succeeded. The completed clip stayed idle rather than starting again. An injected encoder startup failure remained idle until the Thai retry button was pressed; stopping the camera during the next countdown cancelled it. Narrow-viewport UI and mirror-transform separation were inspected. This used deterministic quality fixtures, not real model output or a physical camera; actual mobile camera/backgrounding and wide-screen device acceptance remain pending. The temporary harness was removed.
