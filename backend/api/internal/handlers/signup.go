package handlers

import (
	"context"
	"errors"

	"github.com/danielgtaylor/huma/v2"
	"mocapin/api/internal/models"
	"mocapin/api/internal/usecases"
)

type signupInput struct{ Body models.Registration }

func RegisterSignup(api huma.API, service *usecases.SignupService) {
	huma.Register(api, huma.Operation{OperationID: "signup", Method: "POST", Path: "/api/auth/signup", DefaultStatus: 201, MaxBodyBytes: 4096}, func(ctx context.Context, input *signupInput) (*authOutput, error) {
		result, value, err := service.Signup(ctx, input.Body)
		if errors.Is(err, models.ErrAccountExists) {
			return nil, huma.Error409Conflict("เบอร์โทรศัพท์นี้มีบัญชีแล้ว กรุณาเข้าสู่ระบบ")
		}
		if errors.Is(err, models.ErrRegistration) {
			return nil, huma.Error422UnprocessableEntity("กรุณาตรวจข้อมูลสมัครสมาชิก")
		}
		if err != nil {
			return nil, authError(err)
		}
		return &authOutput{Body: result, SetCookie: cookie(value, result.ExpiresAt, 604800)}, nil
	})
}
