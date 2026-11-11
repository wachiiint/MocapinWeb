package handlers

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"
	"mocapin/api/internal/models"
	"mocapin/api/internal/usecases"
)

type memoryRepo struct {
	encoded  string
	sessions map[string]models.Auth
	fail     bool
}
type memoryTx struct {
	repo    *memoryRepo
	pending models.Auth
	hash    []byte
}

func (r *memoryRepo) LockAccount(_ context.Context, name string) (usecases.AccountTransaction, error) {
	if r.fail {
		return nil, errors.New("offline")
	}
	if name != "tester" {
		return nil, models.ErrCredentials
	}
	return &memoryTx{repo: r}, nil
}
func (t *memoryTx) Account() (models.User, string) {
	return models.User{ID: "1", Username: "tester"}, t.repo.encoded
}
func (t *memoryTx) AddSession(_ context.Context, hash []byte, expiry time.Time) error {
	t.hash = hash
	t.pending = models.Auth{User: models.User{ID: "1", Username: "tester"}, ExpiresAt: expiry}
	return nil
}
func (t *memoryTx) Commit(context.Context) error {
	t.repo.sessions[string(t.hash)] = t.pending
	return nil
}
func (t *memoryTx) Rollback(context.Context) error { return nil }
func (r *memoryRepo) FindSession(_ context.Context, hash []byte) (models.Auth, error) {
	if r.fail {
		return models.Auth{}, errors.New("offline")
	}
	value, ok := r.sessions[string(hash)]
	if !ok || !value.ExpiresAt.After(time.Now()) {
		return models.Auth{}, models.ErrCredentials
	}
	return value, nil
}
func (r *memoryRepo) DeleteSession(_ context.Context, hash []byte) error {
	delete(r.sessions, string(hash))
	return nil
}
func setup(t *testing.T) (http.Handler, *memoryRepo) {
	t.Helper()
	hash, err := usecases.HashPassword("a-long-test-password")
	if err != nil {
		t.Fatal(err)
	}
	repo := &memoryRepo{encoded: hash, sessions: map[string]models.Auth{}}
	router := chi.NewRouter()
	config := huma.DefaultConfig("test", "1")
	config.CreateHooks = nil
	config.Transformers = nil
	config.OpenAPIPath = ""
	config.DocsPath = ""
	config.SchemasPath = ""
	RegisterAuth(humachi.New(router, config), usecases.NewAuthService(repo, hash))
	return router, repo
}
func request(handler http.Handler, method, path, body, value string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if value != "" {
		req.Header.Set("Cookie", value)
	}
	out := httptest.NewRecorder()
	handler.ServeHTTP(out, req)
	return out
}
func TestIndependentSessionsAndExpiry(t *testing.T) {
	router, repo := setup(t)
	login := func() *http.Cookie {
		out := request(router, "POST", "/api/auth/login", `{"username":" TESTER ","password":"a-long-test-password"}`, "")
		if out.Code != 200 {
			t.Fatalf("login: %d %s", out.Code, out.Body)
		}
		return out.Result().Cookies()[0]
	}
	a, b := login(), login()
	if a.Value == b.Value || !a.Secure || !a.HttpOnly || a.SameSite != http.SameSiteLaxMode || a.Path != "/" || a.MaxAge != 604800 {
		t.Fatal("unsafe or repeated cookie")
	}
	hash := sha256.Sum256([]byte(a.Value))
	if _, ok := repo.sessions[string(hash[:])]; !ok {
		t.Fatal("token must be hashed")
	}
	if strings.Contains(request(router, "GET", "/api/auth/me", "", a.String()).Body.String(), a.Value) {
		t.Fatal("token leaked in body")
	}
	if out := request(router, "POST", "/api/auth/logout", "", a.String()); out.Code != 204 || out.Result().Cookies()[0].MaxAge != -1 {
		t.Fatal("logout must clear cookie")
	}
	if request(router, "GET", "/api/auth/me", "", a.String()).Code != 401 {
		t.Fatal("first session survived logout")
	}
	if request(router, "GET", "/api/auth/me", "", b.String()).Code != 200 {
		t.Fatal("logout revoked another device")
	}
	for key, value := range repo.sessions {
		value.ExpiresAt = time.Now().Add(-time.Second)
		repo.sessions[key] = value
	}
	if request(router, "GET", "/api/auth/me", "", b.String()).Code != 401 {
		t.Fatal("expired session accepted")
	}
}
func TestCredentialAndStorageFailures(t *testing.T) {
	router, repo := setup(t)
	for _, body := range []string{`{"username":"tester","password":"wrong"}`, `{"username":"missing","password":"wrong"}`} {
		out := request(router, "POST", "/api/auth/login", body, "")
		if out.Code != 401 || len(out.Result().Cookies()) != 0 {
			t.Fatalf("credential failure: %d", out.Code)
		}
	}
	if len(repo.sessions) != 0 {
		t.Fatal("invalid password created a session")
	}
	repo.fail = true
	if request(router, "POST", "/api/auth/login", `{"username":"tester","password":"a-long-test-password"}`, "").Code != 503 {
		t.Fatal("database failure must be distinguishable from credentials")
	}
}
func TestLoginLimiterDoesNotBlockSessionChecks(t *testing.T) {
	handler := LimitLogin(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }))
	for i := 0; i < 11; i++ {
		out := request(handler, "POST", "/api/auth/login", "", "")
		if i < 10 && out.Code != 204 || i == 10 && out.Code != 429 {
			t.Fatalf("attempt %d: %d", i, out.Code)
		}
	}
	if request(handler, "GET", "/api/auth/me", "", "").Code != 204 {
		t.Fatal("limiter must not block me")
	}
}

func TestOriginProtectionAndCachePolicy(t *testing.T) {
	handler := Security("https://test.trycloudflare.com")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) }))
	for _, origin := range []string{"", "https://evil.example", "https://test.trycloudflare.com"} {
		req := httptest.NewRequest("POST", "http://localhost/api/auth/login", nil)
		req.Header.Set("Origin", origin)
		out := httptest.NewRecorder()
		handler.ServeHTTP(out, req)
		expected := 403
		if origin == "https://test.trycloudflare.com" {
			expected = 204
		}
		if out.Code != expected || out.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("origin %q: %d, %v", origin, out.Code, out.Header())
		}
	}
	req := httptest.NewRequest("GET", "http://localhost/api/auth/me", nil)
	out := httptest.NewRecorder()
	handler.ServeHTTP(out, req)
	if out.Code != 204 || out.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("session reads should not be cached")
	}
}
func TestPublicAuthShape(t *testing.T) {
	router, _ := setup(t)
	out := request(router, "POST", "/api/auth/login", `{"username":"tester","password":"a-long-test-password"}`, "")
	var value map[string]json.RawMessage
	if err := json.Unmarshal(out.Body.Bytes(), &value); err != nil {
		t.Fatal(err)
	}
	if len(value) != 2 || value["user"] == nil || value["expiresAt"] == nil {
		t.Fatalf("unexpected response: %s", out.Body)
	}
}
