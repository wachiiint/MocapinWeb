package handlers

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"
	"mocapin/api/internal/models"
	"mocapin/api/internal/usecases"
)

type signupRepo struct {
	input   models.Registration
	encoded string
	hash    []byte
	called  int
}

func (r *signupRepo) Register(_ context.Context, input models.Registration, encoded string, hash []byte, _ time.Time) (models.User, error) {
	r.called++
	if r.called > 1 {
		return models.User{}, models.ErrAccountExists
	}
	r.input = input
	r.encoded = encoded
	r.hash = hash
	return models.User{ID: "2", Username: input.Phone}, nil
}
func TestSignupValidationAndCookie(t *testing.T) {
	repo := &signupRepo{}
	router := chi.NewRouter()
	config := huma.DefaultConfig("signup", "1")
	config.CreateHooks = nil
	config.OpenAPIPath = ""
	config.DocsPath = ""
	config.SchemasPath = ""
	RegisterSignup(humachi.New(router, config), usecases.NewSignupService(repo))
	body := `{"fullName":" ผู้ใช้ ทดสอบ ","phone":"081-234-5678","ageYears":68,"sex":"female","heightCm":160.5,"weightKg":55,"password":"123456"}`
	out := request(router, "POST", "/api/auth/signup", body, "")
	if out.Code != 201 {
		t.Fatalf("signup: %d %s", out.Code, out.Body)
	}
	var auth models.Auth
	if err := json.Unmarshal(out.Body.Bytes(), &auth); err != nil {
		t.Fatal(err)
	}
	if auth.User.Username != "0812345678" || len(repo.hash) != 32 || repo.input.Password != "" || !usecases.VerifyPassword(repo.encoded, "123456") {
		t.Fatal("profile normalization or hashing failed")
	}
	if repo.input.FullName != "ผู้ใช้ ทดสอบ" || !out.Result().Cookies()[0].HttpOnly {
		t.Fatal("invalid profile or session cookie")
	}
	if request(router, "POST", "/api/auth/signup", body, "").Code != 409 {
		t.Fatal("duplicate should return conflict")
	}
	for _, invalid := range []string{`{}`, `{"fullName":" ","phone":"0812345678","ageYears":68,"sex":"female","heightCm":160,"weightKg":55,"password":"123456"}`, `{"fullName":"Tester","phone":"invalid000","ageYears":68,"sex":"male","heightCm":160,"weightKg":55,"password":"123456"}`} {
		if out := request(router, "POST", "/api/auth/signup", invalid, ""); out.Code != 422 {
			t.Fatalf("invalid signup: %d %s", out.Code, out.Body)
		}
	}
	if repo.called != 2 {
		t.Fatal("invalid inputs reached storage")
	}
}
