package usecases

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"mocapin/api/internal/models"
)

type AuthRepository interface {
	LockAccount(context.Context, string) (AccountTransaction, error)
	FindSession(context.Context, []byte) (models.Auth, error)
	DeleteSession(context.Context, []byte) error
}
type AccountTransaction interface {
	Account() (models.User, string)
	AddSession(context.Context, []byte, time.Time) error
	Commit(context.Context) error
	Rollback(context.Context) error
}
type AuthService struct {
	repo  AuthRepository
	dummy string
}

func NewAuthService(repo AuthRepository, dummy string) *AuthService {
	return &AuthService{repo: repo, dummy: dummy}
}
func (s *AuthService) Login(ctx context.Context, input models.Login) (models.Auth, string, error) {
	if phone := normalizePhone(input.Username); phonePattern.MatchString(phone) {
		input.Username = phone
	}
	username, err := NormalizeUsername(input.Username)
	if err != nil || len(input.Password) > 512 {
		return models.Auth{}, "", models.ErrCredentials
	}
	token, hash, expires, err := newSession()
	if err != nil {
		return models.Auth{}, "", err
	}
	account, err := s.repo.LockAccount(ctx, username)
	if err != nil {
		if errors.Is(err, models.ErrCredentials) {
			VerifyPassword(s.dummy, input.Password)
		}
		return models.Auth{}, "", err
	}
	defer account.Rollback(ctx)
	user, encoded := account.Account()
	if !VerifyPassword(encoded, input.Password) {
		return models.Auth{}, "", models.ErrCredentials
	}
	if err = account.AddSession(ctx, hash, expires); err != nil {
		return models.Auth{}, "", err
	}
	if err = account.Commit(ctx); err != nil {
		return models.Auth{}, "", err
	}
	return models.Auth{User: user, ExpiresAt: expires}, token, nil
}

func newSession() (string, []byte, time.Time, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", nil, time.Time{}, fmt.Errorf("generate session token: %w", err)
	}
	token := base64.RawURLEncoding.EncodeToString(bytes)
	hash := sha256.Sum256([]byte(token))
	return token, hash[:], time.Now().UTC().Add(7 * 24 * time.Hour), nil
}
func (s *AuthService) Me(ctx context.Context, token string) (models.Auth, error) {
	if len(token) != 43 {
		return models.Auth{}, models.ErrCredentials
	}
	hash := sha256.Sum256([]byte(token))
	return s.repo.FindSession(ctx, hash[:])
}
func (s *AuthService) Logout(ctx context.Context, token string) error {
	hash := sha256.Sum256([]byte(token))
	return s.repo.DeleteSession(ctx, hash[:])
}
