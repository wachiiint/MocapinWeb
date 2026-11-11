package models

import "errors"

var ErrAccountExists = errors.New("account already exists")
var ErrRegistration = errors.New("invalid registration")

// These values are profile inputs, not calculated clinical measurements.
type Registration struct {
	FullName string  `json:"fullName" minLength:"1" maxLength:"200"`
	Phone    string  `json:"phone" minLength:"10" maxLength:"32"`
	AgeYears int     `json:"ageYears" minimum:"1" maximum:"32767"`
	Sex      string  `json:"sex" enum:"male,female"`
	HeightCM float64 `json:"heightCm" exclusiveMinimum:"0"`
	WeightKG float64 `json:"weightKg" exclusiveMinimum:"0"`
	Password string  `json:"password" minLength:"6" maxLength:"128"`
}
