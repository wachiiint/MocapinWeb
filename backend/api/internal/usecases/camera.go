package usecases

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"sync"
	"time"

	"mocapin/api/internal/models"
)

const cameraHeartbeatTimeout = 3 * time.Second

type cameraMember struct {
	id      string
	peer    *CameraPeer
	ready   bool
	readyAt time.Time
}

type cameraRoom struct {
	id, account, code string
	codeExpires       time.Time
	seq               uint64
	members           [2]*cameraMember
	absentSince       time.Time
	take              *models.CameraTake
	prepareBy         time.Time
}

type cameraAttempts struct {
	since time.Time
	count int
}

// CameraPeer is one authenticated socket; its private identity is never broadcast.
type CameraPeer struct {
	account, roomID string
	lastSeen        time.Time
	events          chan models.CameraEvent
	closed          bool
	replies         map[string]models.CameraEvent
	requests        []string
}

func (p *CameraPeer) Events() <-chan models.CameraEvent { return p.events }

// CameraService owns temporary pairing state in this API process.
type CameraService struct {
	mu     sync.Mutex
	rooms  map[string]*cameraRoom // account ID -> the account's only room
	peers  map[*CameraPeer]bool
	failed map[string]cameraAttempts
	now    func() time.Time
}

func NewCameraService() *CameraService {
	return &CameraService{rooms: make(map[string]*cameraRoom), peers: make(map[*CameraPeer]bool), failed: make(map[string]cameraAttempts), now: time.Now}
}

func (s *CameraService) Open(account string) (*CameraPeer, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	count := 0
	for p := range s.peers {
		if p.account == account {
			count++
		}
	}
	if account == "" || count >= 4 || len(s.peers) >= 4096 {
		return nil, errors.New("camera connection limit reached")
	}
	p := &CameraPeer{account: account, lastSeen: s.now(), events: make(chan models.CameraEvent, 32), replies: make(map[string]models.CameraEvent)}
	s.peers[p] = true
	s.send(p, models.CameraEvent{Type: "connected"})
	return p, nil
}

func (s *CameraService) Disconnect(p *CameraPeer) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.disconnect(p)
}

func (s *CameraService) disconnect(p *CameraPeer) {
	if p.closed {
		return
	}
	p.closed = true
	delete(s.peers, p)
	close(p.events)
	if room := s.rooms[p.account]; room != nil {
		wasMember := false
		for _, member := range room.members {
			if member != nil && member.peer == p {
				member.peer = nil
				member.ready = false
				wasMember = true
			}
		}
		if !s.hasPeers(room) && room.absentSince.IsZero() {
			room.absentSince = s.now()
		}
		if wasMember {
			s.interruptTake(room)
			if room.take != nil && (room.take.Phase == "recording" || room.take.Phase == "stopping") {
				room.take.Incomplete = true
			}
		}
		s.broadcast(room)
	}
}

func (s *CameraService) Handle(p *CameraPeer, command models.CameraCommand) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if p.closed {
		return
	}
	if command.RequestID == "" || len(command.RequestID) > 64 {
		s.send(p, models.CameraEvent{Type: "error", Error: "invalid_request"})
		return
	}
	if reply, ok := p.replies[command.RequestID]; ok {
		s.send(p, reply)
		return
	}
	p.lastSeen = s.now()
	reply := s.command(p, command)
	reply.RequestID = command.RequestID
	if len(p.requests) == 64 {
		delete(p.replies, p.requests[0])
		p.requests = p.requests[1:]
	}
	p.requests = append(p.requests, command.RequestID)
	p.replies[command.RequestID] = reply
	s.send(p, reply)
}

func (s *CameraService) command(p *CameraPeer, c models.CameraCommand) models.CameraEvent {
	fail := func(code string) models.CameraEvent { return models.CameraEvent{Type: "error", Error: code} }
	if c.MemberID != "" {
		decoded, err := hex.DecodeString(c.MemberID)
		if err != nil || len(decoded) != 16 {
			return fail("invalid_request")
		}
	}
	room := s.rooms[p.account]
	switch c.Type {
	case "clock":
		if c.ClientTime == nil || *c.ClientTime < 0 {
			return fail("invalid_request")
		}
		serverTime := float64(s.now().UnixMicro()) / 1000
		return models.CameraEvent{Type: "clock", ClientTime: c.ClientTime, ServerTimeMs: &serverTime}
	case "start", "prepared", "cancel", "started", "stop", "finished", "capture-failed", "clear":
		return s.captureCommand(room, p, c)
	case "create":
		if room != nil {
			if p.roomID == "" && c.MemberID != "" && room.members[0].id == c.MemberID {
				return s.restore(room, p, 0)
			}
			return fail("room_exists")
		}
		if len(s.rooms) >= 4096 {
			return fail("capacity")
		}
		id, err := cameraID()
		if err != nil {
			return fail("unavailable")
		}
		code, err := cameraCode()
		if err != nil {
			return fail("unavailable")
		}
		room = &cameraRoom{id: id, account: p.account, code: code, codeExpires: s.now().Add(10 * time.Minute)}
		s.rooms[p.account] = room
		return s.attach(room, p, 0, c.MemberID)
	case "join":
		if p.roomID != "" {
			return fail("already_joined")
		}
		if room != nil && room.members[1] != nil && c.MemberID != "" && room.members[1].id == c.MemberID {
			return s.restore(room, p, 1)
		}
		if room != nil && c.MemberID == room.members[0].id {
			return fail("invalid_request")
		}
		attempts := s.failed[p.account]
		if s.now().Sub(attempts.since) >= time.Minute {
			attempts = cameraAttempts{since: s.now()}
		}
		if attempts.count >= 10 || (attempts.count == 0 && len(s.failed) >= 4096) {
			return fail("rate_limited")
		}
		if room == nil || c.Code != room.code || !s.now().Before(room.codeExpires) {
			attempts.count++
			s.failed[p.account] = attempts
			return fail("invalid_code")
		}
		if room.members[1] != nil {
			return fail("room_full")
		}
		return s.attach(room, p, 1, c.MemberID)
	case "resume":
		if p.roomID != "" {
			return fail("already_joined")
		}
		if room == nil || room.id != c.RoomID {
			return fail("room_missing")
		}
		for i, member := range room.members {
			if member != nil && member.id == c.MemberID {
				return s.restore(room, p, i)
			}
		}
		return fail("member_missing")
	case "heartbeat":
		return models.CameraEvent{Type: "ack"}
	case "readiness":
		if c.Ready == nil {
			return fail("invalid_request")
		}
		if room == nil || room.id != c.RoomID || p.roomID != room.id {
			return fail("room_missing")
		}
		for _, member := range room.members {
			if member != nil && member.peer == p {
				changed := member.ready != *c.Ready
				member.ready = *c.Ready
				member.readyAt = s.now()
				if changed {
					if !member.ready {
						s.interruptTake(room)
					}
					s.broadcast(room)
				}
				return models.CameraEvent{Type: "ack"}
			}
		}
		return fail("member_missing")
	case "leave", "renew-code":
		if room == nil || room.id != c.RoomID || p.roomID != room.id {
			return fail("room_missing")
		}
		if c.Type == "leave" && room.take != nil && room.take.Phase != "cancelled" && room.take.Phase != "finished" {
			return fail("capture_busy")
		}
		if c.Type == "renew-code" {
			if room.members[0].peer != p {
				return fail("primary_required")
			}
			code, err := cameraCode()
			if err != nil {
				return fail("unavailable")
			}
			room.code = code
			room.codeExpires = s.now().Add(10 * time.Minute)
			return s.membership(room, room.members[0], 0)
		}
		return s.leave(room, p)
	default:
		return fail("unsupported_command")
	}
}

func cameraID() (string, error) {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", fmt.Errorf("generate camera identity: %w", err)
	}
	return hex.EncodeToString(bytes[:]), nil
}

func cameraCode() (string, error) {
	value, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", fmt.Errorf("generate camera code: %w", err)
	}
	return fmt.Sprintf("%06d", value.Int64()), nil
}
