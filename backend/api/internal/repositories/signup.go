package repositories

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"mocapin/api/internal/models"
)

func (r *Auth) Register(ctx context.Context, input models.Registration, encoded string, hash []byte, expiry time.Time) (models.User, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return models.User{}, fmt.Errorf("begin registration: %w", err)
	}
	defer tx.Rollback(ctx)
	user := models.User{Username: input.Phone}
	err = tx.QueryRow(ctx, "INSERT INTO accounts(username,password_hash) VALUES($1,$2) RETURNING id::text", input.Phone, encoded).Scan(&user.ID)
	if err != nil {
		return models.User{}, registrationError(err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO patient_profiles(account_id,full_name,phone,age_years,sex,height_cm,weight_kg)
 VALUES($1::text::bigint,$2,$3,$4,$5,$6,$7)`, user.ID, input.FullName, input.Phone, input.AgeYears, input.Sex, input.HeightCM, input.WeightKG)
	if err != nil {
		return models.User{}, registrationError(err)
	}
	_, err = tx.Exec(ctx, "INSERT INTO sessions(token_hash,account_id,expires_at) VALUES($1,$2::text::bigint,$3)", hash, user.ID, expiry)
	if err != nil {
		return models.User{}, fmt.Errorf("insert registration session: %w", err)
	}
	if err = tx.Commit(ctx); err != nil {
		return models.User{}, fmt.Errorf("commit registration: %w", err)
	}
	return user, nil
}
func registrationError(err error) error {
	var databaseError *pgconn.PgError
	if errors.As(err, &databaseError) && databaseError.Code == "23505" {
		return models.ErrAccountExists
	}
	return fmt.Errorf("insert registered account/profile: %w", err)
}
