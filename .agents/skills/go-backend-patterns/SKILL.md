---
name: go-backend-patterns
description: >-
  Idiomatic Go architecture, 4-layer separation (Chi + Huma), Redis claim-check queues, and clinical config scoring patterns for backend/api/. Activate when creating or modifying Go handlers, usecases, repositories, or gateways.
---

# Go Backend Patterns Skill (`backend/api/`)

Adapted from `affaan-m/ECC` (`backend-patterns` and `golang-patterns`) and tailored to our **Go (Chi + Huma) + PostgreSQL + Redis + RustFS (S3)** architecture ([docs/architect.md](../../../docs/architect.md)) and clinical rules ([docs/clinical-rules.md](../../../docs/clinical-rules.md)).

---

## 1. Strict 4-Layer Flow (`handlers` -> `usecases` -> `repositories` / `gateways`)

Every feature in `backend/api/internal/` follows one clear path without skipping layers or adding premature abstractions:

### Layer 1: `handlers/` (HTTP Transport Only)
- Register typed routes with Huma on the Chi router.
- Validate request path/query/body via struct tags, pass `ctx` and DTOs to `usecases/`, and map domain errors to HTTP status codes.
- **Zero SQL, zero Redis calls, zero clinical math.**

```go
func (h *RecordingHandler) ConfirmUpload(
	ctx context.Context,
	input *ConfirmUploadInput,
) (*ConfirmUploadOutput, error) {
	rec, err := h.usecase.StartProcessing(ctx, input.RecordingID)
	if err != nil {
		if errors.Is(err, models.ErrNotFound) {
			return nil, huma.Error404NotFound("recording not found")
		}
		return nil, huma.Error500InternalServerError("failed to start recording job")
	}
	return &ConfirmUploadOutput{Body: rec}, nil
}
```

### Layer 2: `usecases/` (Business & Clinical Scoring)
- Define small consumer interfaces for only the repository/gateway methods needed.
- Verify uploaded files exist in object storage (`HEAD`), update PostgreSQL status (`processing`), and push a claim-check job to Redis.
- When consuming worker results, apply clinical cutoffs and MDC/MCID bands loaded from `config/clinical/` (e.g., `AWGS_2025_v1.yaml`).

```go
type RecordingRepo interface {
	GetByID(ctx context.Context, id string) (*models.Recording, error)
	UpdateStatus(ctx context.Context, id string, status models.RecordingStatus) error
}

type ObjectStorageGateway interface {
	ObjectExists(ctx context.Context, key string) (bool, error)
}

type JobQueueGateway interface {
	EnqueuePoseJob(ctx context.Context, job models.PoseJob) error
}
```

### Layer 3: `repositories/` (PostgreSQL Only)
- Execute parameterized SQL queries with `ctx`.
- Prevent N+1 queries by using explicit `JOIN` or `WHERE id = ANY($1)` batch queries.
- Wrap errors with context: `fmt.Errorf("query recording %s: %w", id, err)`.

### Layer 4: `gateways/` (Redis & S3 Object Storage)
- **Claim-Check Pattern**: Redis job payloads must only contain keys and patient scaling numbers (`recording_id`, `video_keys`, `calibration_key`, `height_cm`, `weight_kg`). Never put video bytes or large JSON blobs in Redis.
- S3 gateway generates short-lived presigned `PUT` (upload) and `GET` (doctor replay) URLs.

---

## 2. Clinical Rules Implementation Checklist

Whenever writing code in `usecases/` that processes metrics from the Python `pose-engine` result queue:

1. **Config-Driven Thresholds**: Read cutoffs and MDC/MCID noise bands from the parsed `config/clinical/*.yaml` struct injected at startup. Never write magic clinical numbers (`0.8`, `12`, `1.32`) in `.go` files.
2. **Store Both Metric Layers**:
   - Composite score (e.g., SPPB `0-12`)
   - Continuous biomechanical metric (e.g., 5STS duration in `s`, gait speed in `m/s`, joint ROM in `deg`)
   - Associated `MDC` and `MCID` bounds for progress views.
3. **Never Label Sarcopenia from Video**: Video/pose metrics produce outcome tracking and referral risk levels (`see_doctor_probability`, `confidence_pct`, or `urgent_risk_level`), never a sarcopenia diagnosis.

---

## 3. Anti-Bloat & Concurrency Guards

1. **Direct Constructors**: Use plain `NewX(...)` functions returning concrete struct pointers. Avoid Functional Options (`WithTimeout(...)`) unless a struct genuinely has many optional parameters.
2. **Graceful Background Consumers**: The Redis result-queue consumer goroutine started in `cmd/api/` must select on `ctx.Done()` and flush in-flight updates before exiting on `SIGINT`/`SIGTERM`.
