package usecases

import (
	"strings"
	"testing"
)

func TestPasswordsAndNormalization(t *testing.T) {
	for _, name := range []string{"ab", "bad name", "ผู้ใช้", strings.Repeat("a", 65)} {
		if _, err := NormalizeUsername(name); err == nil {
			t.Fatalf("accepted username %q", name)
		}
	}
	if name, err := NormalizeUsername(" A.Test_1 "); err != nil || name != "a.test_1" {
		t.Fatal("username normalization failed")
	}
	password := " รหัสผ่านที่ยาวเพียงพอ "
	first, err := HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	second, err := HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	if first == second || !VerifyPassword(first, password) || VerifyPassword(first, strings.TrimSpace(password)) {
		t.Fatal("salt or exact password comparison failed")
	}
	for _, encoded := range []string{"", first + "$extra", strings.Replace(first, "m=19456", "m=999999999", 1)} {
		if VerifyPassword(encoded, password) {
			t.Fatal("invalid hash accepted")
		}
	}
	for _, value := range []string{"short", strings.Repeat("x", 129), string([]byte{0xff})} {
		if _, err := HashPassword(value); err == nil {
			t.Fatal("invalid password accepted")
		}
	}
}

func TestPasswordLengthBounds(t *testing.T) {
	for _, password := range []string{strings.Repeat("x", 6), strings.Repeat("x", 128), strings.Repeat("ก", 6)} {
		encoded, err := HashPassword(password)
		if err != nil {
			t.Fatalf("password within length bounds rejected: %v", err)
		}
		if !VerifyPassword(encoded, password) {
			t.Fatal("password within length bounds did not verify")
		}
	}
	for _, password := range []string{strings.Repeat("x", 5), strings.Repeat("ก", 5), strings.Repeat("x", 129)} {
		if _, err := HashPassword(password); err == nil {
			t.Fatal("password outside length bounds accepted")
		}
	}
}
