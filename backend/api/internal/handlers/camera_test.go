package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/go-chi/chi/v5"
	"mocapin/api/internal/models"
	"mocapin/api/internal/usecases"
)

const cameraOrigin = "https://camera.example"

type cameraTestAuth struct {
	revoked atomic.Bool
	offline atomic.Bool
}

func (a *cameraTestAuth) Me(_ context.Context, credential string) (models.Auth, error) {
	if a.offline.Load() {
		return models.Auth{}, errors.New("database offline")
	}
	if credential == "" || a.revoked.Load() {
		return models.Auth{}, models.ErrCredentials
	}
	id := "account-a"
	if credential == "other-account" {
		id = "account-b"
	}
	return models.Auth{User: models.User{ID: id}, ExpiresAt: time.Now().Add(time.Hour)}, nil
}

func cameraServer(t *testing.T) (string, *cameraTestAuth, context.CancelFunc) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	auth, rooms := &cameraTestAuth{}, usecases.NewCameraService()
	router := chi.NewRouter()
	router.Use(Security(cameraOrigin))
	router.Method("GET", "/api/camera/ws", CameraWebSocket(ctx, cameraOrigin, auth, rooms))
	server := httptest.NewServer(router)
	t.Cleanup(func() { cancel(); rooms.Close(); server.Close() })
	return "ws" + strings.TrimPrefix(server.URL, "http") + "/api/camera/ws", auth, cancel
}

func cameraDial(t *testing.T, address, credential string) *websocket.Conn {
	t.Helper()
	headers := http.Header{"Origin": {cameraOrigin}, "Cookie": {cookieName + "=" + credential}}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, address, &websocket.DialOptions{HTTPHeader: headers})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.CloseNow() })
	if cameraRead(t, conn).Type != "connected" {
		t.Fatal("missing greeting")
	}
	return conn
}

func cameraRead(t *testing.T, conn *websocket.Conn) models.CameraEvent {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	var event models.CameraEvent
	if err := wsjson.Read(ctx, conn, &event); err != nil {
		t.Fatal(err)
	}
	return event
}

func cameraSend(t *testing.T, conn *websocket.Conn, command models.CameraCommand) models.CameraEvent {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := wsjson.Write(ctx, conn, command); err != nil {
		t.Fatal(err)
	}
	for {
		event := cameraRead(t, conn)
		if event.RequestID == command.RequestID {
			return event
		}
	}
}

func TestCameraHandshakeSecurity(t *testing.T) {
	address, auth, _ := cameraServer(t)
	for _, test := range []struct {
		name, origin, credential, suffix string
		status                           int
	}{
		{"missing origin", "", "valid", "", 403},
		{"foreign origin", "https://evil.example", "valid", "", 403},
		{"missing cookie", cameraOrigin, "", "", 401},
		{"query credentials", cameraOrigin, "valid", "?token=secret", 400},
	} {
		t.Run(test.name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			headers := http.Header{"Origin": {test.origin}, "Cookie": {cookieName + "=" + test.credential}}
			conn, response, err := websocket.Dial(ctx, address+test.suffix, &websocket.DialOptions{HTTPHeader: headers})
			if conn != nil {
				conn.CloseNow()
			}
			if err == nil || response == nil || response.StatusCode != test.status || response.Header.Get("Cache-Control") != "no-store" {
				t.Fatalf("handshake: response=%v error=%v", response, err)
			}
		})
	}
	auth.offline.Store(true)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_, response, err := websocket.Dial(ctx, address, &websocket.DialOptions{HTTPHeader: http.Header{"Origin": {cameraOrigin}, "Cookie": {cookieName + "=valid"}}})
	if err == nil || response == nil || response.StatusCode != 503 {
		t.Fatal("database outage accepted handshake")
	}
}

func TestCameraSocketsPairReconnectAndProtectMembership(t *testing.T) {
	address, _, _ := cameraServer(t)
	a, b := cameraDial(t, address, "first-session"), cameraDial(t, address, "second-session")
	room := cameraSend(t, a, models.CameraCommand{Type: "create", RequestID: "create"})
	if room.Type != "membership" || room.Role != "primary" {
		t.Fatalf("create: %+v", room)
	}
	other := cameraDial(t, address, "other-account")
	if event := cameraSend(t, other, models.CameraCommand{Type: "join", RequestID: "join", Code: room.Code}); event.Error != "invalid_code" {
		t.Fatal("different account joined")
	}
	joined := cameraSend(t, b, models.CameraCommand{Type: "join", RequestID: "join", Code: room.Code})
	if joined.Role != "secondary" || len(joined.Room.Members) != 2 {
		t.Fatalf("join: %+v", joined)
	}
	state := cameraRead(t, a)
	if state.Type != "state" || state.MemberID != "" || state.Room.Members[1].Connected != true {
		t.Fatal("invalid peer broadcast")
	}
	b.CloseNow()
	for {
		state = cameraRead(t, a)
		if state.Type == "state" && !state.Room.Members[1].Connected {
			break
		}
	}
	b = cameraDial(t, address, "third-session")
	resumed := cameraSend(t, b, models.CameraCommand{Type: "resume", RequestID: "resume", RoomID: room.Room.ID, MemberID: joined.MemberID})
	if resumed.MemberID != joined.MemberID || resumed.Room.Seq <= joined.Room.Seq {
		t.Fatal("resume did not restore current state")
	}
	if event := cameraSend(t, b, models.CameraCommand{Type: "unknown", RequestID: "unsupported"}); event.Error != "unsupported_command" {
		t.Fatal("unexpected recording command")
	}
}

func TestCameraSocketRevocationAndLifecycle(t *testing.T) {
	t.Run("revoked session", func(t *testing.T) {
		address, auth, _ := cameraServer(t)
		conn := cameraDial(t, address, "valid")
		auth.revoked.Store(true)
		if event := cameraSend(t, conn, models.CameraCommand{Type: "heartbeat", RequestID: "hb"}); event.Error != "unauthorized" {
			t.Fatal("revoked session still active")
		}
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		if _, _, err := conn.Read(ctx); err == nil {
			t.Fatal("revoked connection remained open")
		}
	})
	t.Run("API shutdown", func(t *testing.T) {
		address, _, stop := cameraServer(t)
		conn := cameraDial(t, address, "valid")
		stop()
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		if _, _, err := conn.Read(ctx); err == nil {
			t.Fatal("connection outlived API")
		}
	})
	t.Run("unexpected JSON fields", func(t *testing.T) {
		address, _, _ := cameraServer(t)
		conn := cameraDial(t, address, "valid")
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		if err := conn.Write(ctx, websocket.MessageText, []byte(`{"type":"create","requestId":"x","video":"forbidden"}`)); err != nil {
			t.Fatal(err)
		}
		if _, _, err := conn.Read(ctx); err == nil {
			t.Fatal("unexpected payload accepted")
		}
	})
}

func TestCameraSocketBroadcastsReadinessChanges(t *testing.T) {
	address, _, _ := cameraServer(t)
	a, b := cameraDial(t, address, "session-a"), cameraDial(t, address, "session-b")
	room := cameraSend(t, a, models.CameraCommand{Type: "create", RequestID: "create"})
	cameraSend(t, b, models.CameraCommand{Type: "join", RequestID: "join", Code: room.Code})
	cameraRead(t, a)
	for i, ready := range []bool{true, false} {
		if event := cameraSend(t, b, models.CameraCommand{Type: "readiness", RequestID: fmt.Sprintf("ready-%d", i), RoomID: room.Room.ID, Ready: &ready}); event.Type != "ack" {
			t.Fatalf("readiness rejected: %+v", event)
		}
		state := cameraRead(t, a)
		if state.Type != "state" || state.Room.Members[1].Ready != ready || state.Room.Members[0].Ready {
			t.Fatal("remote readiness does not match its own report")
		}
	}
}
