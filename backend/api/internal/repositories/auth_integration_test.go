package repositories

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"mocapin/api/internal/models"
	"mocapin/api/internal/usecases"
)

// This test creates and drops only its own random schema in TEST_DATABASE_URL.
func TestPostgresLifecycle(t *testing.T) {
	target := os.Getenv("TEST_DATABASE_URL")
	if target == "" {
		t.Skip("set TEST_DATABASE_URL to run against PostgreSQL")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	db, err := pgxpool.New(ctx, target)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var id [8]byte
	if _, err = rand.Read(id[:]); err != nil {
		t.Fatal(err)
	}
	schema := "auth_test_" + hex.EncodeToString(id[:])
	quoted := pgx.Identifier{schema}.Sanitize()
	if _, err = db.Exec(ctx, "CREATE SCHEMA "+quoted); err != nil {
		t.Fatal(err)
	}
	defer func() {
		cleanup, done := context.WithTimeout(context.Background(), 5*time.Second)
		defer done()
		if _, err := db.Exec(cleanup, "DROP SCHEMA "+quoted+" CASCADE"); err != nil {
			t.Error(err)
		}
	}()
	config, err := pgxpool.ParseConfig(target)
	if err != nil {
		t.Fatal(err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schema
	scoped, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	defer scoped.Close()
	sql, err := os.ReadFile("../../migrations/001_auth.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = scoped.Exec(ctx, string(sql)); err != nil {
		t.Fatal(err)
	}
	profileSQL, err := os.ReadFile("../../migrations/002_patient_profiles.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = scoped.Exec(ctx, string(profileSQL)); err != nil {
		t.Fatal(err)
	}
	hash, _ := usecases.HashPassword("a-long-test-password")
	repo := NewAuth(scoped)
	service := usecases.NewAuthService(repo, hash)
	if err = repo.Create(ctx, "tester", hash); err != nil {
		t.Fatal(err)
	}
	if err = repo.Create(ctx, "tester", hash); err == nil {
		t.Fatal("duplicate username allowed")
	}
	_, a, err := service.Login(ctx, models.Login{Username: "tester", Password: "a-long-test-password"})
	if err != nil {
		t.Fatal(err)
	}
	_, b, err := service.Login(ctx, models.Login{Username: "tester", Password: "a-long-test-password"})
	if err != nil {
		t.Fatal(err)
	}
	if err = service.Logout(ctx, a); err != nil {
		t.Fatal(err)
	}
	if _, err = service.Me(ctx, b); err != nil {
		t.Fatal("other session was revoked")
	}
	if _, err = scoped.Exec(ctx, "UPDATE sessions SET created_at=now()-interval '2 days', expires_at=now()-interval '1 day'"); err != nil {
		t.Fatal(err)
	}
	if _, err = service.Me(ctx, b); err == nil {
		t.Fatal("expired session accepted")
	}
	_, b, err = service.Login(ctx, models.Login{Username: "tester", Password: "a-long-test-password"})
	if err != nil {
		t.Fatal(err)
	}
	next, _ := usecases.HashPassword("a-different-test-password")
	if err = repo.Reset(ctx, "tester", next); err != nil {
		t.Fatal(err)
	}
	if _, err = service.Me(ctx, b); err == nil {
		t.Fatal("reset kept a session")
	}
	if _, _, err = service.Login(ctx, models.Login{Username: "tester", Password: "a-long-test-password"}); err == nil {
		t.Fatal("old password accepted")
	}
	if _, _, err = service.Login(ctx, models.Login{Username: "tester", Password: "a-different-test-password"}); err != nil {
		t.Fatal(err)
	}
	t.Run("registration is atomic and supports phone login", func(t *testing.T) {
		signup := usecases.NewSignupService(repo)
		input := models.Registration{FullName: "ผู้ใช้ ทดสอบ", Phone: "081-234-5678", AgeYears: 68, Sex: "female", HeightCM: 160.5, WeightKG: 55, Password: "123456"}
		result, token, err := signup.Signup(ctx, input)
		if err != nil {
			t.Fatal(err)
		}
		if result.User.Username != "0812345678" {
			t.Fatal("phone username not normalized")
		}
		if _, err = service.Me(ctx, token); err != nil {
			t.Fatal("signup did not persist session")
		}
		if _, _, err = service.Login(ctx, models.Login{Username: input.Phone, Password: input.Password}); err != nil {
			t.Fatal(err)
		}
		if _, _, err = signup.Signup(ctx, input); err == nil {
			t.Fatal("duplicate registration accepted")
		}
		var count int
		var name, phone string
		var height float64
		if err = scoped.QueryRow(ctx, "SELECT full_name,phone,height_cm FROM patient_profiles WHERE account_id=$1::text::bigint", result.User.ID).Scan(&name, &phone, &height); err != nil {
			t.Fatal(err)
		}
		if name != input.FullName || phone != "0812345678" || height != 160.5 {
			t.Fatal("profile did not round-trip")
		}
		if err = scoped.QueryRow(ctx, "SELECT count(*) FROM accounts WHERE username='0812345678'").Scan(&count); err != nil || count != 1 {
			t.Fatal("duplicate left account rows")
		}
		// Force a profile uniqueness conflict after account insert; the new account must roll back.
		if _, err = scoped.Exec(ctx, "UPDATE patient_profiles SET phone='0899999999' WHERE phone='0812345678'"); err != nil {
			t.Fatal(err)
		}
		input.Phone = "0899999999"
		if _, _, err = signup.Signup(ctx, input); err == nil {
			t.Fatal("profile uniqueness conflict accepted")
		}
		if err = scoped.QueryRow(ctx, "SELECT count(*) FROM accounts WHERE username='0899999999'").Scan(&count); err != nil || count != 0 {
			t.Fatal("profile failure left an orphan account")
		}
	})
}
