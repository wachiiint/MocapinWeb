package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/term"
	"mocapin/api/internal/repositories"
	"mocapin/api/internal/usecases"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}
func run() error {
	if len(os.Args) != 3 || (os.Args[1] != "create-user" && os.Args[1] != "reset-password") {
		return fmt.Errorf("usage: go run ./cmd/accounts create-user|reset-password USERNAME")
	}
	username, err := usecases.NormalizeUsername(os.Args[2])
	if err != nil {
		return err
	}
	fmt.Print("Password: ")
	first, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Println()
	if err != nil {
		return fmt.Errorf("read password: %w", err)
	}
	fmt.Print("Confirm password: ")
	second, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Println()
	if err != nil {
		return fmt.Errorf("confirm password: %w", err)
	}
	if string(first) != string(second) {
		return fmt.Errorf("passwords do not match")
	}
	encoded, err := usecases.HashPassword(string(first))
	clear(first)
	clear(second)
	if err != nil {
		return err
	}
	if os.Getenv("DATABASE_URL") == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	db, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		return fmt.Errorf("invalid DATABASE_URL configuration")
	}
	defer db.Close()
	repo := repositories.NewAuth(db)
	if os.Args[1] == "create-user" {
		err = repo.Create(ctx, username, encoded)
	} else {
		err = repo.Reset(ctx, username, encoded)
	}
	if err != nil {
		return err
	}
	fmt.Println("Account updated.")
	return nil
}
