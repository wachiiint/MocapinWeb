package models

import "time"

// CameraCommand carries coordination metadata only, never media or login credentials.
type CameraCommand struct {
	Type       string   `json:"type"`
	RequestID  string   `json:"requestId"`
	RoomID     string   `json:"roomId,omitempty"`
	MemberID   string   `json:"memberId,omitempty"`
	Code       string   `json:"code,omitempty"`
	Ready      *bool    `json:"ready,omitempty"`
	TakeID     string   `json:"takeId,omitempty"`
	Complete   *bool    `json:"complete,omitempty"`
	ClientTime *float64 `json:"clientTime,omitempty"`
}

type CameraMember struct {
	Role      string `json:"role"`
	Connected bool   `json:"connected"`
	Ready     bool   `json:"ready"`
}

type CameraRoom struct {
	ID      string         `json:"id"`
	Seq     uint64         `json:"seq"`
	Members []CameraMember `json:"members"`
	Take    *CameraTake    `json:"take,omitempty"`
}

type CameraTake struct {
	ID         string    `json:"id"`
	Phase      string    `json:"phase"`
	StartAtMs  float64   `json:"startAtMs"`
	Captures   [2]string `json:"captures"`
	Incomplete bool      `json:"incomplete"`
}

type CameraEvent struct {
	Type          string      `json:"type"`
	RequestID     string      `json:"requestId,omitempty"`
	Error         string      `json:"error,omitempty"`
	Room          *CameraRoom `json:"room,omitempty"`
	RoomID        string      `json:"roomId,omitempty"`
	Seq           uint64      `json:"seq,omitempty"`
	MemberID      string      `json:"memberId,omitempty"`
	Role          string      `json:"role,omitempty"`
	Code          string      `json:"code,omitempty"`
	CodeExpiresAt *time.Time  `json:"codeExpiresAt,omitempty"`
	ClientTime    *float64    `json:"clientTime,omitempty"`
	ServerTimeMs  *float64    `json:"serverTimeMs,omitempty"`
}
