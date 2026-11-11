package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"mocapin/api/internal/models"
	"mocapin/api/internal/usecases"
)

type cameraAuth interface {
	Me(context.Context, string) (models.Auth, error)
}

// CameraWebSocket uses Chi directly because a protocol upgrade is not a JSON response.
func CameraWebSocket(lifecycle context.Context, origin string, auth cameraAuth, cameras *usecases.CameraService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Origin") != origin {
			http.Error(w, "untrusted origin", http.StatusForbidden)
			return
		}
		if r.URL.RawQuery != "" {
			http.Error(w, "query parameters are not supported", http.StatusBadRequest)
			return
		}
		credential := token(r.Header.Get("Cookie"))
		check, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		identity, err := auth.Me(check, credential)
		cancel()
		if err != nil {
			status := http.StatusServiceUnavailable
			if errors.Is(err, models.ErrCredentials) {
				status = http.StatusUnauthorized
			}
			http.Error(w, http.StatusText(status), status)
			return
		}
		peer, err := cameras.Open(identity.User.ID)
		if err != nil {
			http.Error(w, "camera connection limit reached", http.StatusTooManyRequests)
			return
		}
		defer cameras.Disconnect(peer)
		// The exact public Origin was checked above; Host may be loopback behind the tunnel.
		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: []string{origin}})
		if err != nil {
			return
		}
		defer conn.CloseNow()
		ctx, stop := context.WithCancel(lifecycle)
		defer stop()
		conn.SetReadLimit(4096)
		serveCamera(ctx, conn, auth, credential, identity.User.ID, cameras, peer)
	})
}

func serveCamera(ctx context.Context, conn *websocket.Conn, auth cameraAuth, credential, account string, cameras *usecases.CameraService, peer *usecases.CameraPeer) {
	ctx, cancel := context.WithCancel(ctx)
	incoming := make(chan models.CameraCommand)
	finished := make(chan struct{})
	go func() {
		defer close(finished)
		defer close(incoming)
		for {
			kind, data, err := conn.Read(ctx)
			if err != nil {
				return
			}
			if kind != websocket.MessageText {
				return
			}
			var command models.CameraCommand
			decoder := json.NewDecoder(bytes.NewReader(data))
			decoder.DisallowUnknownFields()
			if decoder.Decode(&command) != nil {
				return
			}
			if decoder.Decode(new(any)) != io.EOF {
				return
			}
			if len(command.RoomID) > 32 || len(command.MemberID) > 32 || len(command.TakeID) > 32 || len(command.Code) > 6 || len(command.Type) > 32 {
				return
			}
			select {
			case incoming <- command:
			case <-ctx.Done():
				return
			}
		}
	}()
	defer func() { cancel(); conn.CloseNow(); <-finished }()
	for {
		select {
		case <-ctx.Done():
			return
		case command, ok := <-incoming:
			if !ok {
				return
			}
			// Recheck every command, including heartbeats, to observe logout/reset/expiry.
			check, done := context.WithTimeout(ctx, 2*time.Second)
			identity, err := auth.Me(check, credential)
			done()
			if err != nil || identity.User.ID != account {
				code := "auth_unavailable"
				if errors.Is(err, models.ErrCredentials) || (err == nil && identity.User.ID != account) {
					code = "unauthorized"
				}
				writeCamera(ctx, conn, models.CameraEvent{Type: "error", RequestID: command.RequestID, Error: code})
				return
			}
			cameras.Handle(peer, command)
		case event, ok := <-peer.Events():
			if !ok || !writeCamera(ctx, conn, event) {
				return
			}
		}
	}
}

func writeCamera(ctx context.Context, conn *websocket.Conn, event models.CameraEvent) bool {
	write, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	return wsjson.Write(write, conn, event) == nil
}
