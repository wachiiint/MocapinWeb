# Backend Rules (`backend/`)

This file defines the strict rules for `backend/api/` (Go) and `backend/pose-engine/` (Python). Every agent working on backend code must follow these rules alongside the root [AGENTS.md](../AGENTS.md), [docs/architect.md](../docs/architect.md), and [docs/clinical-rules.md](../docs/clinical-rules.md).

---

## 1. Service & Layer Boundaries

Our backend consists of two separate services defined in [docs/architect.md](../docs/architect.md):

| Folder | Language / Stack | Role | Hard Prohibitions |
| :--- | :--- | :--- | :--- |
| `backend/api/` | Go (`Chi` + `Huma`) | Single public entry point: auth, records, clinical scoring, job dispatch | Never processes raw video files or runs pose models |
| `backend/pose-engine/` | Python (`RTMPose`, `Pose2Sim`, `OpenSim`, `FastAPI /health`) | Stateless worker: pops job from Redis -> processes video from S3 -> pushes raw metrics to Redis | **Never touches PostgreSQL. Never applies clinical cutoffs or diagnosis.** |

### Go API 4-Layer Architecture (`backend/api/internal/`)

Dependencies flow strictly inward: `handlers` -> `usecases` -> `repositories` / `gateways`.

1. **`handlers/` (HTTP Transport)**:
   - Parse and validate HTTP inputs via Huma schemas, call one usecase, and return JSON.
   - **Never** write SQL queries, Redis commands, or clinical scoring math here.
2. **`usecases/` (Business & Clinical Logic)**:
   - Orchestrate repositories and gateways; apply clinical rules loaded from `config/clinical/` (e.g., `AWGS_2025_v1.yaml`).
   - **Never** import `net/http` or leak HTTP status codes into domain logic.
3. **`repositories/` (PostgreSQL Data Access)**:
   - Execute parameterized SQL queries and transactions.
   - **Never** put clinical cutoff rules or business branching inside repositories.
4. **`gateways/` (External Clients: Redis & Object Storage)**:
   - Push/pop Redis queue messages and generate S3 presigned PUT/GET URLs or check object existence (`HEAD`).
   - **Claim-Check Rule**: Redis payloads carry only metadata and object storage keys (`recording_id`, `video_keys`, `calibration_key`, `height`, `weight`) — **never raw video bytes**.

---

## 2. Idiomatic Go Rules (`backend/api/`)

Adapted from `golang-patterns` and `backend-patterns` with anti-overengineering guards:

1. **Simplicity Over Cleverness (No Premature Abstraction)**:
   - Construct structs directly (`NewRecordingUsecase(repo, queue, storage)`). Do **not** build Functional Options (`WithXYZ()`), generic base repositories, or DI frameworks unless explicitly requested.
2. **Accept Small Interfaces, Return Concrete Structs**:
   - Define narrow interfaces in the consumer package (`usecases/`) only where needed for unit testing mocks. Functions should return concrete structs (`*RecordingService`).
3. **Context Propagation**:
   - Every blocking function (DB queries, Redis operations, S3 calls) must accept `ctx context.Context` as its first parameter and respect cancellation/timeouts.
4. **Explicit Error Wrapping & Domain Errors**:
   - Always wrap errors with context: `fmt.Errorf("fetch recording %s: %w", id, err)`.
   - Map domain sentinel errors (e.g., `ErrNotFound`, `ErrInvalidState`) to HTTP status codes only inside `handlers/`.
5. **Safe Concurrency**:
   - Never spawn fire-and-forget goroutines in HTTP handlers. Background workers (such as the Redis result-queue consumer) must manage lifecycle cleanly using `context.Context` cancellation and `errgroup` or `sync.WaitGroup`.

---

## 3. Python Pose Engine Rules (`backend/pose-engine/`)

1. **Stateless Worker Design**:
   - Each job downloads videos from S3 to a temporary working directory, runs the pipeline (1-camera 2D or 2+ camera 3D Pose2Sim + OpenSim), uploads outputs (`.trc`, `.mot`, `overlay.mp4`) to S3, pushes raw metrics to the Redis result queue, and cleans up temporary files.
2. **Raw Metrics Only**:
   - Output pure biomechanical numbers (rep counts, timing in seconds, 2D/3D joint angles in degrees, ROM, and raw compensation flags).
   - **Never** classify sarcopenia or read clinical cutoff configs inside `pose-engine/`.
3. **FastAPI Is for `/health` Only**:
   - All job ingestion happens via the Redis job queue, never via HTTP POST to the Python worker.

---

## 4. Clinical Guardrails (Mandatory)

1. **No Magic Clinical Numbers**: Every cutoff, MDC, and MCID value must come from the versioned YAML config in `config/clinical/` ([docs/clinical-rules.md](../docs/clinical-rules.md)).
2. **Two-Layer Metrics**: Always store and return both the **composite score** (e.g., SPPB `0-12`) and the **continuous value** (e.g., 5STS seconds, gait speed `m/s`, joint angle degrees) plus its **MDC/MCID** band.
3. **Diagnosis != Outcome Tracking**: Video and pose metrics track mobility outcomes; they must never label a patient as sarcopenic.
