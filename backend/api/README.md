# Login development

Go 1.26 + Chi + Huma + PostgreSQL. Each login creates an independent seven-day
session. Passwords use salted Argon2id; session tokens are stored only as SHA-256
digests. Public signup stores a patient profile and signs the user in immediately.
Doctor roles, OTP, pairing and video upload are not included.

## Prepare tools and database

Run these yourself if missing. Docker Desktop may require a reboot and must be
running before Compose commands work:

```powershell
winget install --exact --id Docker.DockerDesktop
winget install --exact --id Cloudflare.cloudflared
```

From the repository root, copy `.env.example`, replace its sample password, start
PostgreSQL and apply the migration **once**, after the health check is healthy:

```powershell
Copy-Item .env.example .env
notepad .env
docker compose up -d postgres
docker compose ps
Get-Content -Raw backend/api/migrations/001_auth.sql | docker compose exec -T postgres psql -U mocapin -d mocapin -v ON_ERROR_STOP=1
```

The migration is transactional. Running it again fails without changing tables.
Add new numbered migrations for future changes. The named volume survives
container restarts. Do not use `docker compose down -v` unless erasing data is
intended. PostgreSQL is exposed only on loopback. Go runs on the host.

## Build and expose the app

From `frontend`:

```powershell
npm ci
npm run build
```

In another terminal, start Quick Tunnel (the API can start afterwards):

```powershell
cloudflared tunnel --url http://127.0.0.1:8080
```

Keep it open and copy the HTTPS origin. In `backend/api`:

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

Set `DATABASE_URL` to match the root `.env` password; URL-encode special password
characters. Use host port `55432` for this project's database; its container
port remains `5432`. `sslmode=disable` is only for loopback development. Set
`APP_PUBLIC_ORIGIN` to the tunnel's exact HTTPS origin without a trailing slash.
`APP_FRONTEND_DIR=../../frontend/dist` is relative to the API working directory.
The API does not auto-load dotenv files. Load this terminal's environment without
printing secrets, then create an account and run Go:

```powershell
foreach ($taskLine in Get-Content .env.local) {
  if ($taskLine.Trim() -and -not $taskLine.Trim().StartsWith('#')) {
    $taskPair = $taskLine.Split('=', 2)
    [Environment]::SetEnvironmentVariable($taskPair[0].Trim(), $taskPair[1].Trim(), 'Process')
  }
}
go run ./cmd/accounts create-user tester
go run ./cmd/api
```

Passwords are entered twice with hidden input, never command-line arguments.
Usernames normalize to lowercase: 3–64 ASCII letters, digits, dots, underscores
and hyphens. Passwords contain 6–128 Unicode characters; whitespace is preserved.
In another terminal with the same env loaded:

```powershell
go run ./cmd/accounts reset-password tester
```

Reset changes the password and revokes all sessions in one transaction. Login and
reset lock the same account row, preventing old-password login races.

Go serves the built frontend and `/api` on `127.0.0.1:8080`; expose only this port
through cloudflared, not PostgreSQL or the Vite dev server. Login throttling trusts
Cloudflare's edge-supplied `CF-Connecting-IP` header; local processes are trusted
in this development setup. Quick Tunnel needs no account token. Its URL changes
when restarted: update `APP_PUBLIC_ORIGIN`, restart Go, and login again. Browser
cookies/model caches stay scoped to the old origin; database accounts survive.
The computer, Docker, Go and tunnel must stay running. Use synthetic test data.

## Contract

For an existing database, apply `migrations/002_patient_profiles.sql` once from
the repository root before starting the updated API:

```powershell
Get-Content -Raw backend/api/migrations/002_patient_profiles.sql | docker compose exec -T postgres psql -U mocapin -d mocapin -v ON_ERROR_STOP=1
```

On a fresh database apply both numbered migrations in order. Existing CLI-created
accounts keep working without a profile. Registration uses a Thai-format phone
number (10 digits starting with 0) as the username; spaces and hyphens are removed.
The login endpoint accepts formatted phone numbers as well as legacy usernames.
Duplicate phone/account identifiers return 409. Required profile fields are
full name, phone, age in whole years, sex (`male` or `female`), positive finite
height in centimetres, positive finite weight in kilograms, and password.
Account, profile and session are committed together; profile/session failures
roll back the account. Existing accounts and their sessions are preserved.
Signup validates input format; this phase does not verify ownership with OTP.
Age is the entered age at profile creation, not a derived current age.

| Request | Successful response |
|---|---|
| POST `/api/auth/login`, JSON `{username,password}` | 200 `{user:{id,username},expiresAt}` and cookie |
| POST `/api/auth/signup`, JSON `{fullName,phone,ageYears,sex,heightCm,weightKg,password}` | 201, same auth body and cookie |
| GET `/api/auth/me`, cookie | 200 `{user:{id,username},expiresAt}` |
| POST `/api/auth/logout`, cookie | 204 and expired cookie |

IDs are strings; dates are UTC RFC 3339. POST requests require `Origin` equal to
`APP_PUBLIC_ORIGIN`, including test clients. Wrong credentials/invalid sessions
return 401; schema errors 422; origin failures 403; throttling 429; database
failures 503. Auth responses use `Cache-Control: no-store`.

The cookie is `__Host-mocapin_session`, with `Secure; HttpOnly; SameSite=Lax;
Path=/; Max-Age=604800` and no Domain. Tokens are not returned in JSON or logs.
Logout revokes only its own session; expiry is absolute, not sliding.
Expired rows are removed on the account's next login; no cleanup worker is added.
Login and signup share limits: ten attempts/minute/IP, four concurrent password checks, a bounded
4096-IP map. Limits reset on process restart; multi-instance use needs a shared
limiter later.

## Verification and physical acceptance

The two-camera pairing slice is documented in
[CAMERA_PROTOCOL.md](CAMERA_PROTOCOL.md): authenticated WebSocket pairing,
presence, membership restoration and automatic coordinated recording with a
five-second countdown. No database migration is needed for pairing rooms.

From `backend/api`:

```powershell
go test ./...
go vet ./...
$env:TEST_DATABASE_URL = $env:DATABASE_URL
go test ./internal/repositories -run TestPostgresLifecycle -count=1 -v
```

The PostgreSQL test creates a random isolated schema and drops only that schema;
it needs schema-creation permission. Without `TEST_DATABASE_URL`, it explicitly
skips. From `frontend`, run `npm test`, `npm run lint`, and `npm run build`.

On Android Chrome and iPhone Safari using different networks, verify:

1. Both phones login to one account; reopening/reloading preserves their sessions.
2. Logout on one leaves the other usable; restarting Go preserves sessions.
3. Password reset invalidates both sessions and rejects the old password.
4. Simulated expiry during a synthetic recording preserves recording and video/
   report downloads, but blocks new rounds until login. Do not refresh or navigate
   away while files exist only in browser memory.
5. Network failure shows retry controls without losing local recording data.
6. Keyboard navigation, password visibility, errors and narrow layouts work.

The client checks session at startup, tab foregrounding and each minute; known
expiry is checked every second. Expiry blocks new countdowns without disposing
the recorder or download URLs. Logout is disabled until recording stops and
the user explicitly clears the result. Upload is a future phase.

Chi/Huma follow the repo stack; pgx provides PostgreSQL, x/crypto Argon2id, and
x/term hidden input. No npm dependency was added. Owners should add/update
Anti-Slop tags after review. Agents do not commit or push.
