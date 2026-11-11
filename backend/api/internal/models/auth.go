package models

import (
	"errors"
	"time"
)

var ErrCredentials = errors.New("invalid credentials")

type User struct {
	ID       string `json:"id"`
	Username string `json:"username"`
}

type Login struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type Auth struct {
	User      User      `json:"user"`
	ExpiresAt time.Time `json:"expiresAt"`
}
