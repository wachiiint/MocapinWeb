# Two-camera pairing protocol

The API provides authenticated pairing, readiness and coordinated local capture.
When both cameras are ready, the primary automatically requests a shared take;
both confirm preparation before a **5-second** countdown. Videos stay on each
phone. This does not provide remote video preview or frame-accurate 3D alignment.

## Connection and security

Connect to `wss://<APP_PUBLIC_ORIGIN host>/api/camera/ws` from the same origin.
The browser sends its existing HttpOnly session cookie automatically. The server
requires an exact `Origin` match, validates the session before upgrading, and
revalidates it on every command. Query parameters are rejected. Never send login
tokens, passwords, video, images or pose frames in messages.

The endpoint uses Chi directly for the HTTP upgrade; application rules remain in
`internal/usecases`. `github.com/coder/websocket` v1.8.15 implements WebSocket
framing, cancellation and connection cleanup. Go's standard `net/http` and the
existing Chi/Huma packages do not implement that protocol. No paid relay, npm
package, service or database migration is needed for this slice.

Handshake failures: 401 invalid session, 403 wrong/missing Origin, 400 query
parameters, 429 connection capacity, 503 authentication storage unavailable.
There are at most four sockets per account and 4096 sockets/rooms per API process.
Exactly two members may join a room, and each account owns at most one room.

## Client messages

Send one JSON object per text message, at most 4096 bytes. Unknown fields, binary
messages, malformed JSON or oversized fields close the connection. `requestId`
is required, 1–64 bytes, unique for each new operation on a socket. IDs for rooms
and members are 32-character opaque strings; keep them as strings.

| Operation | Message |
| --- | --- |
| Create primary room | `{"type":"create","requestId":"1"}` |
| Join as secondary | `{"type":"join","requestId":"2","code":"012345"}` |
| Restore membership | `{"type":"resume","requestId":"3","roomId":"...","memberId":"..."}` |
| Keep connection alive | `{"type":"heartbeat","requestId":"4"}` |
| Report fresh camera readiness | `{"type":"readiness","requestId":"7","roomId":"...","ready":true}` |
| Leave room | `{"type":"leave","requestId":"5","roomId":"..."}` |
| Renew primary's code | `{"type":"renew-code","requestId":"6","roomId":"..."}` |
| Estimate server clock | `{"type":"clock","requestId":"8","clientTime":123.45}` |
| Request take (primary only) | `{"type":"start","requestId":"9","roomId":"..."}` |
| Confirm local preparation | `{"type":"prepared","requestId":"10","roomId":"...","takeId":"..."}` |
| Cancel preparation/countdown | `{"type":"cancel","requestId":"11","roomId":"...","takeId":"..."}` |
| Report native start accepted | `{"type":"started","requestId":"12","roomId":"...","takeId":"..."}` |
| Stop both cameras | `{"type":"stop","requestId":"13","roomId":"...","takeId":"..."}` |
| Report local completion | `{"type":"finished","requestId":"14","roomId":"...","takeId":"...","complete":true}` |
| Report missing/failed recorder | `{"type":"capture-failed","requestId":"15","roomId":"...","takeId":"..."}` |
| Confirm local result cleared | `{"type":"clear","requestId":"16","roomId":"...","takeId":"..."}` |

The UI supplies its own cryptographically random 32-hex `memberId` in `create`
and `join`, saving it in account-scoped session storage before sending. Those
operations restore the same membership if the first reply was lost, even before
the client knows the room ID. A supplied member ID must decode to 16 bytes and
must differ from the other role's identity. Omit it in legacy test clients to
let the server generate an identity, which requires receiving the first reply
before restoration is possible. The browser never exposes this ID in the UI.

Send a heartbeat every second with a fresh request ID. Duplicate IDs replay the
cached reply without repeating mutations; the last 64 replies per socket are
retained. Replayed requests do not refresh liveness. A reused ID with a different
payload still replays the original reply. Capture commands after `start` require
the current `takeId`, preventing late stop/finish/clear commands from changing a
new take. The server derives the sender's role from its socket membership.

## Server messages

- `connected`: socket accepted; does not imply membership or camera readiness.
- `membership`: correlated reply with `requestId`, `memberId`, `role` and `room`.
  Only the primary also receives `code` and `codeExpiresAt` (UTC RFC 3339).
- `state`: broadcast with `room: {id,seq,members:[{role,connected,ready}]}`. Member IDs
  and join codes are never broadcast. Roles are `primary` and `secondary`.
- `ack`: successful heartbeat, with its `requestId`.
- `clock`: echoes `clientTime` and supplies `serverTimeMs` from the API clock.
- `left`: correlated leave reply with `roomId` and `seq`.
- `room_closed`: broadcast when the primary leaves, with `roomId` and `seq`.
- `error`: correlated reply with `requestId` and a machine-readable `error`.

State broadcasts may arrive before the correlated membership reply. Compare
`seq` within the same room and discard older snapshots. Repeated snapshots at
the same sequence are harmless. Closing a room clears both memberships. Leaving
as secondary frees only that slot, so another phone can join with a valid code.

Error codes: `invalid_request`, `unsupported_command`, `room_exists`,
`already_joined`, `invalid_code`, `rate_limited`, `room_full`, `room_missing`,
`member_missing`, `primary_required`, `capacity`, `unavailable`, `unauthorized`,
and `auth_unavailable`. Authentication errors close the socket after the reply;
other errors leave it available for another command. A bad code and a code for
another account both return `invalid_code`, without exposing another account.

## Lifetime and reconnect

Codes have six digits (including leading zeroes) and expire after 10 minutes.
Ten wrong/expired guesses per account per minute block further join attempts
until that window ends. Reconnecting does not reset this counter. Only the
primary can renew a code; renewal does not reset the failed-attempt window.

After 3 seconds without a fresh valid request, the API's one-second maintenance
tick disconnects the socket and broadcasts presence. Transport failure can mark
it disconnected sooner. A disconnected member keeps its slot. Save only your
own membership IDs for reconnect; these IDs authorize restoration within the
same logged-in account and must not be shared or logged.

Reconnect, wait for `connected`, then send `resume` with a fresh request ID.
Successful resume returns the latest snapshot and replaces any old socket for
that member. A different account cannot resume the membership. On `room_missing`
or `member_missing`, discard the saved membership and pair again. Do not replay
queued user actions from a previous socket; the private-ID create/join recovery
described above is the only safe initial-membership retry. Pairing restoration does not imply
that a camera or recorder is ready.

After membership is confirmed, the UI sends `readiness` every second instead of
an ordinary heartbeat, and immediately when its local quality gate changes or
the page is hidden. A ready report requires active login, a live local camera,
MediaRecorder support, ready models, a fresh passing quality gate, a visible
page, and no current recording/result. Only the sending member's status changes.
This is an engineering capture-quality gate, not a clinical assessment.

The API expires readiness after 3 seconds without a new readiness report,
independently of normal heartbeats, and clears it on disconnect or restoration.
Readiness changes are broadcast with a new sequence number; unchanged reports
refresh their expiry and receive `ack` without a broadcast. The patient panel
announces the other camera's readiness and announces both ready only when both
members report ready and the local gate still passes. No notification permission
or sound is needed; these are persistent in-page messages with polite screen
reader announcements. Readiness alone does not mean a recorder has started.

## Coordinated capture

Room snapshots optionally include `take: {id,phase,startAtMs,captures,incomplete}`.
Phases are `preparing`, `countdown`, `recording`, `stopping`, `finished`, and
`cancelled`. The two capture slots are primary then secondary, with values
`idle`, `prepared`, `recording`, `finished`, `failed`, or `cleared`.

The primary requests `start` automatically only when there is no previous take
and both readiness reports are fresh. Both devices must acknowledge `prepared`
within 3 seconds; the server then sets `startAtMs` to 5 seconds later. Each device
rechecks its own fresh quality gate and visible/live camera before calling the
recorder. A lost check or member during preparation/countdown cancels that take.
Recovery waits for **เริ่มนับใหม่** on the primary, rather than restarting by
surprise. Network loss after recording starts keeps each local recorder running;
an offline stop cannot immediately stop the other phone.

Before advertising ready for coordinated capture, clients collect five clock
samples against `performance.now()` and choose the minimum round trip. Five
samples are refreshed every 20 seconds; estimates expire at 30 seconds. The
half-round-trip uncertainty is an estimate, not a clock-error guarantee. Clients
that disconnect discard their scheduled start and never replay it on reconnect.
The protocol records incomplete/missing captures and retains available local
files. A page reloaded during recording reports its lost recorder as failed;
refresh cannot restore video chunks held only in browser memory.

Either stop button stops its local recorder immediately and requests remote
stop. Local completion is retried after reconnect. Both results must be cleared
before the next automatic round; cancelled rounds require an explicit retry.
Late repeated completion cannot undo a cleared slot. Leaving an active take is
rejected. Each phone downloads `mocapin-<takeId>-cam1|cam2.<native extension>`, its
existing quality report and a separate `-timing.json`. Timing includes common
target, clock samples/uncertainty, local start call and observed native start
event. These events do not identify the first encoded video frame.

Rooms with no connected members are removed after 30 minutes. API restart loses
all rooms; accounts and login sessions remain in PostgreSQL. Expired or revoked
login sessions cannot resume. A full event queue disconnects its slow consumer
instead of blocking the other phone or retaining an unbounded backlog.

## Verification

From `backend/api`, run `go test ./...`, `go test -race ./internal/usecases
./internal/handlers` and `go vet ./...`. Tests exercise real WebSocket handshakes
and frames against an in-process HTTP server, plus concurrent room creation,
account isolation, capacity, duplicate requests, expiry, reconnect, session
revocation, malformed payloads and lifecycle cancellation. These pairing tests
use synthetic authentication data and do not change the application database.

The pairing UI adds no npm dependency. Choose **2 กล้อง**, create a code on the
primary, then enter it on the other phone logged into the same account. Both
show connection status; **เลิกจับคู่** closes the room from primary or frees the
secondary slot. Controls lock while a command is pending or disconnected.
Membership restoration is scoped to the current account and browser tab; a page
reload restores dual mode when a saved membership exists. Do not copy a paired
tab as a way to simulate a second phone: browser tab duplication can copy its
session storage and the same private member identity.

Single-camera recording remains unchanged. Dual mode uses shared preparation and
countdown instead of each phone's independent automatic timer. On a wide screen the camera and pairing
panel sit side by side, stacking on phones. Build frontend and restart Go to load
the updated protocol. Physical Android/iPhone recording acceptance remains
pending on physical Android/iPhone pairs.

Verification on 2026-11-11 passed 104 frontend tests, frontend lint/build,
backend tests with the race detector, and Go vet. The original reproduction
`go test ./internal/usecases -run TestCameraReadyPairCanStartCountdown -count=1 -v`
first failed with `unsupported_command`; it now passes. Regression cases cover
shared five-second preparation/start, cancellation, role checks, late commands,
stop/finish/clear, offline completion retry, and missing recorders after reload.

A temporary React StrictMode harness exercised the production hooks and UI
against the real API through the existing HTTPS tunnel. Two 640x480 synthetic
canvas streams entered the countdown, started native MediaRecorders, stopped
from either side, and produced decodable video with quality/timing downloads.
Both timing files used one take ID/target, five samples each, and captured native
start events. Clearing both allowed another round; a failed check cancelled a
countdown, and explicit retry successfully recorded again. This harness bypassed
real pose input using labelled quality fixtures and was removed afterwards.
No additional model or package was downloaded. This verifies the browser capture
path, not physical Android/iPhone performance, cross-network timing precision,
or encoded-frame synchronization. Actual phone acceptance remains pending.
