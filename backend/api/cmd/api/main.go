package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"mocapin/api/internal/handlers"
	"mocapin/api/internal/repositories"
	"mocapin/api/internal/usecases"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}
func run() error {
	origin := os.Getenv("APP_PUBLIC_ORIGIN")
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return fmt.Errorf("APP_PUBLIC_ORIGIN must be an HTTPS origin without a trailing slash")
	}
	if os.Getenv("DATABASE_URL") == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	db, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		return fmt.Errorf("invalid DATABASE_URL configuration")
	}
	defer db.Close()
	check, cancel := context.WithTimeout(ctx, 5*time.Second)
	err = db.Ping(check)
	cancel()
	if err != nil {
		return fmt.Errorf("database unavailable: %w", err)
	}
	dummy, err := usecases.HashPassword("dummy-password-not-an-account")
	if err != nil {
		return err
	}
	router := chi.NewRouter()
	router.Use(handlers.Security(origin), handlers.LimitLogin)
	config := huma.DefaultConfig("Mocapin Auth", "1.0.0")
	config.CreateHooks = nil
	config.Transformers = nil
	config.OpenAPIPath = ""
	config.DocsPath = ""
	config.SchemasPath = ""
	api := humachi.New(router, config)
	repo := repositories.NewAuth(db)
	auth := usecases.NewAuthService(repo, dummy)
	handlers.RegisterAuth(api, auth)
	handlers.RegisterSignup(api, usecases.NewSignupService(repo))
	cameras := usecases.NewCameraService()
	defer cameras.Close()
	router.Method("GET", "/api/camera/ws", handlers.CameraWebSocket(ctx, origin, auth, cameras))
	router.HandleFunc("/api/*", func(w http.ResponseWriter, r *http.Request) { http.NotFound(w, r) })
	directory := os.Getenv("APP_FRONTEND_DIR")
	if directory == "" {
		directory = "../../frontend/dist"
	}
	if _, err = os.Stat(filepath.Join(directory, "index.html")); err != nil {
		return fmt.Errorf("build frontend first: %w", err)
	}
	router.Handle("/*", http.FileServer(http.Dir(directory)))
	address := os.Getenv("APP_LISTEN_ADDR")
	if address == "" {
		address = "127.0.0.1:8080"
	}
	server := &http.Server{Addr: address, Handler: router, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 120 * time.Second, IdleTimeout: 60 * time.Second}
	failure := make(chan error, 1)
	go func() { failure <- server.ListenAndServe() }()
	log.Printf("Auth and frontend listening on %s", address)
	maintenance := time.NewTicker(time.Second)
	defer maintenance.Stop()
	for {
		select {
		case <-maintenance.C:
			cameras.Sweep()
		case err = <-failure:
			if !errors.Is(err, http.ErrServerClosed) {
				return err
			}
			return nil
		case <-ctx.Done():
			shutdown, done := context.WithTimeout(context.Background(), 10*time.Second)
			defer done()
			return server.Shutdown(shutdown)
		}
	}
}
