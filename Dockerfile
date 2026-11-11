FROM node:24-bookworm-slim AS frontend
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN sed -i 's/\r$//' prepare-models.sh \
    && bash ./prepare-models.sh \
    && npm run build

FROM golang:1.26-bookworm AS backend
WORKDIR /src/api
COPY backend/api/go.mod backend/api/go.sum ./
RUN go mod download
COPY backend/api/cmd ./cmd
COPY backend/api/internal ./internal
COPY backend/api/migrations ./migrations
ENV CGO_ENABLED=0
RUN go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api \
    && go build -trimpath -ldflags="-s -w" -o /out/accounts ./cmd/accounts

FROM debian:bookworm-slim AS runtime
WORKDIR /app
COPY --from=backend /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=backend /out/api /out/accounts ./
COPY --from=frontend /src/frontend/dist ./frontend
ENV APP_LISTEN_ADDR=0.0.0.0:8080
ENV APP_FRONTEND_DIR=/app/frontend
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/app/api"]
