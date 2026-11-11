package handlers

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"mocapin/api/internal/models"
	"mocapin/api/internal/usecases"
)

const cookieName = "__Host-mocapin_session"

type loginInput struct{ Body models.Login }
type authInput struct {
	Cookie string `header:"Cookie"`
}
type authOutput struct {
	SetCookie string `header:"Set-Cookie"`
	Body      models.Auth
}
type logoutOutput struct {
	SetCookie string `header:"Set-Cookie"`
}

func cookie(token string, expires time.Time, age int) string {
	return (&http.Cookie{Name: cookieName, Value: token, Path: "/", Secure: true, HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: age, Expires: expires}).String()
}
func token(header string) string {
	request := http.Request{Header: http.Header{"Cookie": []string{header}}}
	value, err := request.Cookie(cookieName)
	if err != nil {
		return ""
	}
	return value.Value
}
func authError(err error) error {
	if errors.Is(err, models.ErrCredentials) {
		return huma.Error401Unauthorized("ชื่อบัญชีหรือรหัสผ่านไม่ถูกต้อง หรือการเข้าสู่ระบบหมดอายุ")
	}
	return huma.Error503ServiceUnavailable("ระบบยังไม่พร้อม กรุณาลองใหม่")
}
func RegisterAuth(api huma.API, service *usecases.AuthService) {
	huma.Register(api, huma.Operation{OperationID: "login", Method: "POST", Path: "/api/auth/login", MaxBodyBytes: 4096}, func(ctx context.Context, input *loginInput) (*authOutput, error) {
		result, value, err := service.Login(ctx, input.Body)
		if err != nil {
			return nil, authError(err)
		}
		return &authOutput{Body: result, SetCookie: cookie(value, result.ExpiresAt, 604800)}, nil
	})
	huma.Register(api, huma.Operation{OperationID: "me", Method: "GET", Path: "/api/auth/me"}, func(ctx context.Context, input *authInput) (*authOutput, error) {
		result, err := service.Me(ctx, token(input.Cookie))
		if err != nil {
			return nil, authError(err)
		}
		return &authOutput{Body: result}, nil
	})
	huma.Register(api, huma.Operation{OperationID: "logout", Method: "POST", Path: "/api/auth/logout", DefaultStatus: 204}, func(ctx context.Context, input *authInput) (*logoutOutput, error) {
		if err := service.Logout(ctx, token(input.Cookie)); err != nil {
			return nil, authError(err)
		}
		return &logoutOutput{SetCookie: cookie("", time.Unix(1, 0), -1)}, nil
	})
}
