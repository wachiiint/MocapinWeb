# Backend API

Go + Chi + Huma + PostgreSQL. Handles accounts, sessions, two-camera coordination
and serving the built frontend. Video upload and server-side motion analysis
are not implemented.

## Requirements

Install Docker with Compose and `cloudflared`. On Windows use Docker Desktop
with Linux containers; on Linux use Docker Engine with the Compose plugin.
The commands below work in PowerShell and Bash from the repository root.
Go and Node are built inside Docker, so host installations are optional.

## First setup

1. Start a tunnel in a separate terminal and keep it running:

   ```sh
   cloudflared tunnel --url http://127.0.0.1:8080
   ```

2. Copy the root [.env.example](../../.env.example) to `.env` using your editor.
   Reuse an existing `.env`. Choose `POSTGRES_PASSWORD` and set `APP_PUBLIC_ORIGIN`
   to the tunnel's exact HTTPS origin without a trailing slash. Keep the existing
   database password when reusing a Compose volume. Docker Compose reads this
   root file; `backend/api/.env.local` is for native Go development only.
   Use a fresh terminal when switching from native Go: exported environment
   variables can override `.env` values.

3. Start PostgreSQL and wait for its status to become `healthy`:

   ```sh
   docker compose config --quiet
   docker compose up -d postgres
   docker compose ps
   ```

4. For a fresh database, apply both migrations once, in order:

   ```sh
   docker compose exec -T postgres psql -U mocapin -d mocapin -v ON_ERROR_STOP=1 -f /migrations/001_auth.sql
   docker compose exec -T postgres psql -U mocapin -d mocapin -v ON_ERROR_STOP=1 -f /migrations/002_patient_profiles.sql
   ```

   For an existing database, run only migrations not already applied. They are
   mounted read-only inside PostgreSQL; no shell-specific piping is needed.
   There is no automatic migration runner; rerunning an applied migration fails.

5. Build and start the app:

   ```sh
   docker compose up --build -d api
   docker compose logs -f api
   ```

   The first build downloads base images, npm/Go dependencies and the pinned
   camera models. Matching local models in `frontend/public` are reused.
   Open the tunnel's HTTPS URL and sign up through the app. Use Ctrl+C to stop
   following logs; the containers keep running.

## Everyday commands

After code changes, rebuild and replace the API container:

```sh
docker compose up --build -d api
```

When a tunnel restart changes the URL, update `APP_PUBLIC_ORIGIN` in the root
`.env`, then run the command above and log in at the new URL. Use `up` to apply
environment changes; `docker compose restart` alone keeps the old configuration.

Stop the app with `docker compose down`. Database data remains in the named
volume. **`docker compose down -v` deletes the database volume.** Keep Docker and
the tunnel running during use. API restarts clear pairing rooms; pair again.
Videos stay in browser memory, so download them before refreshing the page.

## Accounts and connections

Run the action you need from the repository root:

- Create a test account: `docker compose exec api /app/accounts create-user tester`
- Reset its password: `docker compose exec api /app/accounts reset-password tester`

The CLI prompts for the password with hidden input. Reset revokes every session
for that account; logout revokes only the current session. Public signup uses
the web form and does not require CLI account creation.

The API listens on port 8080 inside its container; the host publishes it only at
`127.0.0.1:8080` for the tunnel. PostgreSQL remains available at host port 55432
for local development; the API connects to `postgres:5432` inside Compose.
Compose passes the database password separately through `PGPASSWORD`, so it does
not need URL encoding. Native Go settings are in [.env.example](.env.example).
POST requests require an `Origin` matching `APP_PUBLIC_ORIGIN`.

See [the camera protocol](CAMERA_PROTOCOL.md) and [the frontend guide](../../frontend/README.md)
for pairing messages, camera controls and recording behaviour.

## Checks

Build the Go tooling stage, then run checks in temporary containers:

```sh
docker build --target backend -t mocapin-api-check .
docker run --rm mocapin-api-check go test ./...
docker run --rm mocapin-api-check go vet ./...
```

The PostgreSQL integration test skips without `TEST_DATABASE_URL`. It needs an
explicit test-database connection and permission to create/drop its own schema.
Local frontend checks are listed in [the frontend guide](../../frontend/README.md#checks).
