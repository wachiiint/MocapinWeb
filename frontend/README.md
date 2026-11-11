# Frontend

React + TypeScript + Vite. The app checks camera readiness, records video locally,
and supports coordinated recording on two phones. Pose inference runs in the browser.

<a id="model-files"></a>

## Local frontend development

For the shared Windows/Linux workflow, follow [the Docker setup](../backend/api/README.md).
It builds the frontend, Go API and model assets inside Docker. The local tools
below are needed only when developing the frontend outside Docker.

Use Node 24 and npm. From the repository root:

```powershell
cd frontend
npm ci
npm run prepare:models
npm run build
```

On Linux, replace `npm run prepare:models` with `bash ./prepare-models.sh`
(requires `curl`, `unzip`, `sha256sum`). Preparation downloads pinned models into
`public/` and reuses matching files. Model files are ignored by Git.

Open the Cloudflare Tunnel HTTPS URL from the Docker setup to sign up, log in
and use the cameras. After frontend changes, rebuild the API image as described
in that guide.

`npm run dev` starts Vite for frontend development. It does not serve or proxy
the Go authentication API.

## Recording

1. Log in. If **ดาวน์โหลด** appears, click it and wait for the models to be ready.
2. Choose **1 กล้อง** or **2 กล้อง**, then click **เปิดกล้อง** and allow camera access.
3. Follow the readiness checklist. After required checks pass for two seconds,
   a five-second countdown starts automatically.
4. Click **หยุดอัด**, preview the result and download the video and quality report.
5. Use **ล้างวิดีโอเพื่ออัดใหม่** before starting another round.

For two cameras, log in with the same account at the same URL on both phones.
Create a pairing code on the primary phone and enter it on the other. Both
cameras must be ready before the shared countdown. If it is cancelled, correct
the problem and press **เริ่มนับใหม่** on the primary. Stopping on either phone
requests both recorders to stop. Download the video, quality JSON and timing
JSON on each phone, then clear both results. Keep both pages visible.
See [the camera protocol](../backend/api/CAMERA_PROTOCOL.md) for details.

## Quality checks and runtime

Readiness requires one person, sufficient person size and brightness, fresh
camera/pose results, and 21 required landmarks inside the image. The model still
returns all 26 HALPE26 points; the nose, eyes and ears are excluded from readiness.
Clipping, backlighting and blur are warnings and do not block recording.
Quality problems during recording are logged without automatically stopping it.
Current settings are in [quality-config.ts](src/pose-check/quality-config.ts).

Phones and unidentified devices start with WASM; tablets/desktops start with Auto.
Auto checks WebGPU output against WASM on the same input and falls back to WASM
when needed. The verification is shared across devices.
Open **Debug** to change runtime, inspect scores/timings,
or test a still image. Stop the camera before changing runtime.

## Limits

- Video and reports stay in browser memory. Download before clearing, refreshing
  or closing the page. There is no video upload or unsaved-recording recovery.
- Saved video has no audio or skeleton overlay. Mirroring affects the preview only.
- Quality checks are experimental engineering checks, not clinical measurements
  or a diagnosis. Scores are not accuracy percentages; performance depends on the device.

## Checks

From `frontend`:

```powershell
npm test
npm run lint
npm run build
```

For development tools, see the [frame benchmark](quality-benchmark.ts),
[reference comparison](compare-reference.ts) and
[report schema](src/pose-check/recording-report.ts).
