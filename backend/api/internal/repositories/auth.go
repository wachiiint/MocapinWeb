package repositories

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"mocapin/api/internal/models"
	"mocapin/api/internal/usecases"
)

type Auth struct{ db *pgxpool.Pool }

func NewAuth(db *pgxpool.Pool) *Auth { return &Auth{db: db} }

// Both login and reset lock the account row, preventing a stale password from
// creating a new session after a concurrent reset has committed.
func (r *Auth) LockAccount(ctx context.Context, username string) (usecases.AccountTransaction, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin login: %w", err)
	}
	var user models.User
	var encoded string
	err = tx.QueryRow(ctx, "SELECT id::text,username,password_hash FROM accounts WHERE username=$1 FOR UPDATE", username).Scan(&user.ID, &user.Username, &encoded)
	if errors.Is(err, pgx.ErrNoRows) {
		tx.Rollback(ctx)
		return nil, models.ErrCredentials
	}
	if err != nil {
		tx.Rollback(ctx)
		return nil, fmt.Errorf("fetch account: %w", err)
	}
	return &accountTransaction{Tx: tx, user: user, encoded: encoded}, nil
}

type accountTransaction struct {
	pgx.Tx
	user    models.User
	encoded string
}

func (t *accountTransaction) Account() (models.User, string) { return t.user, t.encoded }
func (t *accountTransaction) AddSession(ctx context.Context, hash []byte, expires time.Time) error {
	_, err := t.Exec(ctx, "DELETE FROM sessions WHERE account_id=$1::text::bigint AND expires_at<=now()", t.user.ID)
	if err == nil {
		_, err = t.Exec(ctx, "INSERT INTO sessions(token_hash,account_id,expires_at) VALUES($1,$2::text::bigint,$3)", hash, t.user.ID, expires)
	}
	if err != nil {
		return fmt.Errorf("insert session: %w", err)
	}
	return nil
}
func (r *Auth) FindSession(ctx context.Context, hash []byte) (models.Auth, error) {
	var result models.Auth
	err := r.db.QueryRow(ctx, `SELECT a.id::text,a.username,s.expires_at FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.expires_at>now()`, hash).Scan(&result.User.ID, &result.User.Username, &result.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return result, models.ErrCredentials
	}
	if err != nil {
		return result, fmt.Errorf("find session: %w", err)
	}
	return result, nil
}
func (r *Auth) DeleteSession(ctx context.Context, hash []byte) error {
	_, err := r.db.Exec(ctx, "DELETE FROM sessions WHERE token_hash=$1", hash)
	if err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}
func (r *Auth) Create(ctx context.Context, username, encoded string) error {
	_, err := r.db.Exec(ctx, "INSERT INTO accounts(username,password_hash) VALUES($1,$2)", username, encoded)
	if err != nil {
		return fmt.Errorf("create account (username may already exist): %w", err)
	}
	return nil
}
func (r *Auth) Reset(ctx context.Context, username, encoded string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin reset: %w", err)
	}
	defer tx.Rollback(ctx)
	var id string
	if err = tx.QueryRow(ctx, "SELECT id::text FROM accounts WHERE username=$1 FOR UPDATE", username).Scan(&id); err != nil {
		return fmt.Errorf("find reset account: %w", err)
	}
	if _, err = tx.Exec(ctx, "UPDATE accounts SET password_hash=$1 WHERE id=$2::text::bigint", encoded, id); err != nil {
		return fmt.Errorf("update password: %w", err)
	}
	if _, err = tx.Exec(ctx, "DELETE FROM sessions WHERE account_id=$1::text::bigint", id); err != nil {
		return fmt.Errorf("revoke sessions: %w", err)
	}
	return tx.Commit(ctx)
}
