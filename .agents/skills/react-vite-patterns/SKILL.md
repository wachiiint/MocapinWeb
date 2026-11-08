---
name: react-vite-patterns
description: >-
  Performance, state, and data-fetching patterns for our React + TypeScript + Vite SPA. Activate when building or refactoring React components, camera recording flows, presigned S3 uploads, or job polling in frontend/.
---

# React + Vite SPA Patterns Skill

Adapted from `vercel-labs/react-best-practices` specifically for our **React + TypeScript + Vite + Tailwind (shadcn/ui)** single-page application ([docs/architect.md](../../../docs/architect.md)). All Next.js / SSR / Server Component rules have been stripped.

---

## 1. Parallel Async & Presigned Upload Flow (No Waterfalls)

When uploading 2+ camera videos or fetching independent resources, never `await` inside a sequential loop.

```tsx
// GOOD: Request presigned URLs once, then upload all camera blobs in parallel
async function uploadRecordingVideos(
  uploadTargets: Array<{ url: string; blob: Blob }>
) {
  await Promise.all(
    uploadTargets.map(async ({ url, blob }) => {
      const res = await fetch(url, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": blob.type || "video/mp4" },
      });
      if (!res.ok) {
        throw new Error(`Upload failed with status ${res.status}`);
      }
    })
  );
}
```

---

## 2. Derived State During Render (No `useEffect` Syncing)

Never store values in `useState` and sync them via `useEffect` if they can be computed directly from existing props or state.

```tsx
// BAD: Extra state + cascading re-render
const [isReadyToRecord, setIsReadyToRecord] = useState(false);
useEffect(() => {
  setIsReadyToRecord(lightingOk && framingOk && personCount === 1);
}, [lightingOk, framingOk, personCount]);

// GOOD: Compute during render
const isReadyToRecord = lightingOk && framingOk && personCount === 1;
```

---

## 3. Safe Polling for Recording Lifecycle (`processing -> done / failed`)

After notifying the Go API that video upload is complete, poll cleanly and stop immediately on terminal status (`done` or `failed`) or component unmount.

```tsx
useEffect(() => {
  if (!recordingId || status === "done" || status === "failed") return;

  const controller = new AbortController();
  const timer = window.setInterval(async () => {
    try {
      const res = await fetch(`/api/recordings/${recordingId}/status`, {
        signal: controller.signal,
        credentials: "include",
      });
      if (!res.ok) return;
      const data: { status: "processing" | "done" | "failed" } = await res.json();
      setStatus(data.status);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("Polling error:", err);
      }
    }
  }, 3000);

  return () => {
    controller.abort();
    window.clearInterval(timer);
  };
}, [recordingId, status]);
```

---

## 4. Camera Stream & Pose-Check Cleanup

The in-browser pose check (`frontend/src/pose-check/`) is a live quality gate only. Always release camera hardware tracks (`MediaStreamTrack.stop()`) and cancel `requestAnimationFrame` loops when leaving the recording screen.

```tsx
useEffect(() => {
  let stream: MediaStream | null = null;
  let rafId = 0;

  async function startCamera() {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }

  startCamera();

  return () => {
    cancelAnimationFrame(rafId);
    stream?.getTracks().forEach((track) => track.stop());
  };
}, []);
```

---

## 5. Bundle & Rendering Hygiene

1. **No Barrel Files**: Import directly from `src/components/ui/button` instead of creating `src/components/index.ts`. Barrel files break Vite tree-shaking and slow down dev startup.
2. **Lazy Load Heavy Views**: Wrap the in-browser pose-check runtime and the doctor's 3D/OpenSim replay viewer in `React.lazy(() => import(...))` so patient home screens load instantaneously on mobile connections.
3. **Explicit Conditional Rendering**: Always write `{repCount > 0 ? <RepBadge count={repCount} /> : null}` instead of `{repCount && <RepBadge count={repCount} />}` to prevent rendering a stray `0` in the DOM.
