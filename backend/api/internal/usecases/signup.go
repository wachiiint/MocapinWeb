package usecases

import (
	"context"
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"mocapin/api/internal/models"
)

var phonePattern = regexp.MustCompile(`^0[0-9]{9}$`)

type SignupRepository interface {
	Register(context.Context, models.Registration, string, []byte, time.Time) (models.User, error)
}
type SignupService struct{ repo SignupRepository }

func NewSignupService(repo SignupRepository) *SignupService { return &SignupService{repo: repo} }

func (s *SignupService) Signup(ctx context.Context, input models.Registration) (models.Auth, string, error) {
	input.FullName = strings.TrimSpace(input.FullName)
	input.Phone = normalizePhone(input.Phone)
	if !utf8.ValidString(input.FullName) || utf8.RuneCountInString(input.FullName) < 1 || utf8.RuneCountInString(input.FullName) > 200 ||
		!phonePattern.MatchString(input.Phone) || input.AgeYears < 1 || input.AgeYears > 32767 ||
		(input.Sex != "male" && input.Sex != "female") || !positiveFinite(input.HeightCM) || !positiveFinite(input.WeightKG) ||
		!utf8.ValidString(input.Password) || utf8.RuneCountInString(input.Password) < 6 || utf8.RuneCountInString(input.Password) > 128 {
		return models.Auth{}, "", models.ErrRegistration
	}
	encoded, err := HashPassword(input.Password)
	if err != nil {
		return models.Auth{}, "", fmt.Errorf("hash registration password: %w", err)
	}
	token, hash, expiry, err := newSession()
	if err != nil {
		return models.Auth{}, "", err
	}
	// A password is never passed to the database repository in plain text.
	input.Password = ""
	user, err := s.repo.Register(ctx, input, encoded, hash, expiry)
	if err != nil {
		return models.Auth{}, "", err
	}
	return models.Auth{User: user, ExpiresAt: expiry}, token, nil
}

func normalizePhone(value string) string {
	return strings.NewReplacer(" ", "", "-", "").Replace(strings.TrimSpace(value))
}
func positiveFinite(value float64) bool {
	return value > 0 && !math.IsInf(value, 0) && !math.IsNaN(value)
}
