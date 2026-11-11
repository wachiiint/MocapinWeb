package usecases

import (
	"fmt"
	"sync"
	"testing"
	"time"

	"mocapin/api/internal/models"
)

func cameraPeer(t *testing.T, service *CameraService, account string) *CameraPeer {
	t.Helper()
	peer, err := service.Open(account)
	if err != nil {
		t.Fatal(err)
	}
	<-peer.Events()
	return peer
}

func cameraCommand(t *testing.T, service *CameraService, peer *CameraPeer, command models.CameraCommand) models.CameraEvent {
	t.Helper()
	service.Handle(peer, command)
	for event := range peer.Events() {
		if event.RequestID == command.RequestID {
			return event
		}
	}
	t.Fatal("connection closed before reply")
	return models.CameraEvent{}
}

func TestCameraPairingIsolationAndDuplicateCommands(t *testing.T) {
	s := NewCameraService()
	defer s.Close()
	a := cameraPeer(t, s, "account-a")
	b := cameraPeer(t, s, "account-a")
	other := cameraPeer(t, s, "account-b")
	create := models.CameraCommand{Type: "create", RequestID: "create-1"}
	room := cameraCommand(t, s, a, create)
	if room.Type != "membership" || room.Role != "primary" || len(room.Code) != 6 || room.MemberID == "" {
		t.Fatalf("invalid room: %+v", room)
	}
	duplicate := cameraCommand(t, s, a, create)
	if duplicate.MemberID != room.MemberID || duplicate.Room.ID != room.Room.ID {
		t.Fatal("duplicate create changed membership")
	}
	if event := cameraCommand(t, s, other, models.CameraCommand{Type: "join", RequestID: "cross-account", Code: room.Code}); event.Error != "invalid_code" {
		t.Fatal("cross-account pairing accepted")
	}
	if event := cameraCommand(t, s, other, models.CameraCommand{Type: "resume", RequestID: "cross-resume", RoomID: room.Room.ID, MemberID: room.MemberID}); event.Error != "room_missing" {
		t.Fatal("cross-account resume accepted")
	}
	joined := cameraCommand(t, s, b, models.CameraCommand{Type: "join", RequestID: "join-1", Code: room.Code})
	if joined.Role != "secondary" || len(joined.Room.Members) != 2 || joined.MemberID == room.MemberID || joined.Code != "" {
		t.Fatalf("invalid secondary: %+v", joined)
	}
	third := cameraPeer(t, s, "account-a")
	if event := cameraCommand(t, s, third, models.CameraCommand{Type: "join", RequestID: "join-2", Code: room.Code}); event.Error != "room_full" {
		t.Fatal("third camera accepted")
	}
	if event := cameraCommand(t, s, third, models.CameraCommand{Type: "create", RequestID: "create-2"}); event.Error != "room_exists" {
		t.Fatal("second account room accepted")
	}
	if event := cameraCommand(t, s, b, models.CameraCommand{Type: "renew-code", RequestID: "renew", RoomID: room.Room.ID}); event.Error != "primary_required" {
		t.Fatal("secondary rotated code")
	}
	if event := cameraCommand(t, s, third, models.CameraCommand{Type: "leave", RequestID: "leave", RoomID: room.Room.ID}); event.Error != "room_missing" {
		t.Fatal("nonmember closed room")
	}
}

func TestCameraCodeExpiryAndAccountRateLimit(t *testing.T) {
	s := NewCameraService()
	defer s.Close()
	now := time.Now()
	s.now = func() time.Time { return now }
	a, b := cameraPeer(t, s, "a"), cameraPeer(t, s, "a")
	room := cameraCommand(t, s, a, models.CameraCommand{Type: "create", RequestID: "create"})
	for i := 0; i < 10; i++ {
		event := cameraCommand(t, s, b, models.CameraCommand{Type: "join", RequestID: fmt.Sprintf("bad-%d", i), Code: "wrong"})
		if event.Error != "invalid_code" {
			t.Fatalf("attempt %d: %+v", i, event)
		}
	}
	s.Disconnect(b)
	b = cameraPeer(t, s, "a")
	if event := cameraCommand(t, s, b, models.CameraCommand{Type: "join", RequestID: "limited", Code: room.Code}); event.Error != "rate_limited" {
		t.Fatal("reconnect bypassed account rate limit")
	}
	now = now.Add(10 * time.Minute)
	if event := cameraCommand(t, s, b, models.CameraCommand{Type: "join", RequestID: "expired", Code: room.Code}); event.Error != "invalid_code" {
		t.Fatal("expired code accepted")
	}
	renewed := cameraCommand(t, s, a, models.CameraCommand{Type: "renew-code", RequestID: "renew", RoomID: room.Room.ID})
	if renewed.CodeExpiresAt == nil || !renewed.CodeExpiresAt.After(now) {
		t.Fatal("code not renewed")
	}
	if event := cameraCommand(t, s, b, models.CameraCommand{Type: "join", RequestID: "join", Code: renewed.Code}); event.Type != "membership" {
		t.Fatalf("renewed code rejected: %+v", event)
	}
}

func TestCameraHeartbeatResumeAndIdleCleanup(t *testing.T) {
	s := NewCameraService()
	defer s.Close()
	now := time.Now()
	s.now = func() time.Time { return now }
	a, b := cameraPeer(t, s, "a"), cameraPeer(t, s, "a")
	primary := cameraCommand(t, s, a, models.CameraCommand{Type: "create", RequestID: "create"})
	secondary := cameraCommand(t, s, b, models.CameraCommand{Type: "join", RequestID: "join", Code: primary.Code})
	now = now.Add(3 * time.Second)
	cameraCommand(t, s, a, models.CameraCommand{Type: "heartbeat", RequestID: "hb"})
	s.Sweep()
	if a.closed || !b.closed || s.snapshot(s.rooms["a"]).Members[1].Connected {
		t.Fatal("heartbeat did not expire only missing phone")
	}
	b2 := cameraPeer(t, s, "a")
	resumed := cameraCommand(t, s, b2, models.CameraCommand{Type: "resume", RequestID: "resume", RoomID: primary.Room.ID, MemberID: secondary.MemberID})
	if resumed.MemberID != secondary.MemberID || resumed.Role != "secondary" {
		t.Fatal("resume lost membership")
	}
	b3 := cameraPeer(t, s, "a")
	cameraCommand(t, s, b3, models.CameraCommand{Type: "resume", RequestID: "resume", RoomID: primary.Room.ID, MemberID: secondary.MemberID})
	if !b2.closed || b3.closed {
		t.Fatal("resume did not replace old socket")
	}
	if event := cameraCommand(t, s, b3, models.CameraCommand{Type: "resume", RequestID: "twice", RoomID: primary.Room.ID, MemberID: primary.MemberID}); event.Error != "already_joined" {
		t.Fatal("changed membership on active socket")
	}
	s.Disconnect(a)
	cameraCommand(t, s, b3, models.CameraCommand{Type: "leave", RequestID: "leave", RoomID: primary.Room.ID})
	now = now.Add(30 * time.Minute)
	s.Sweep()
	if len(s.rooms) != 0 {
		t.Fatal("abandoned room retained")
	}
	fresh := cameraPeer(t, s, "a")
	if event := cameraCommand(t, s, fresh, models.CameraCommand{Type: "resume", RequestID: "stale", RoomID: primary.Room.ID, MemberID: primary.MemberID}); event.Error != "room_missing" {
		t.Fatal("resumed expired room")
	}
}

func TestCameraPrimaryLeaveAndSlowConsumer(t *testing.T) {
	s := NewCameraService()
	defer s.Close()
	a, b := cameraPeer(t, s, "a"), cameraPeer(t, s, "a")
	room := cameraCommand(t, s, a, models.CameraCommand{Type: "create", RequestID: "create"})
	cameraCommand(t, s, b, models.CameraCommand{Type: "join", RequestID: "join", Code: room.Code})
	cameraCommand(t, s, a, models.CameraCommand{Type: "leave", RequestID: "leave", RoomID: room.Room.ID})
	if b.roomID != "" || s.rooms["a"] != nil {
		t.Fatal("primary leave did not close room")
	}
	for i := 0; i < 40; i++ {
		s.Handle(b, models.CameraCommand{Type: "heartbeat", RequestID: fmt.Sprint(i)})
	}
	if !b.closed {
		t.Fatal("slow consumer remained connected")
	}
}

func TestCameraConcurrentCreationAndPresence(t *testing.T) {
	s := NewCameraService()
	defer s.Close()
	a, b := cameraPeer(t, s, "a"), cameraPeer(t, s, "a")
	var wait sync.WaitGroup
	for _, p := range []*CameraPeer{a, b} {
		wait.Go(func() { s.Handle(p, models.CameraCommand{Type: "create", RequestID: "create"}); s.Sweep() })
	}
	wait.Wait()
	if len(s.rooms) != 1 || len(s.snapshot(s.rooms["a"]).Members) != 1 {
		t.Fatal("concurrent create made two rooms")
	}
}

func TestCameraLimitsSurviveRoomReplacement(t *testing.T) {
	s := NewCameraService()
	defer s.Close()
	a, b := cameraPeer(t, s, "a"), cameraPeer(t, s, "a")
	s.Handle(a, models.CameraCommand{Type: "create"})
	if event := <-a.Events(); event.Error != "invalid_request" || len(s.rooms) != 0 {
		t.Fatal("request without ID created room")
	}
	room := cameraCommand(t, s, a, models.CameraCommand{Type: "create", RequestID: "create"})
	for i := 0; i < 10; i++ {
		cameraCommand(t, s, b, models.CameraCommand{Type: "join", RequestID: fmt.Sprint(i), Code: "wrong"})
	}
	cameraCommand(t, s, a, models.CameraCommand{Type: "leave", RequestID: "leave", RoomID: room.Room.ID})
	room = cameraCommand(t, s, a, models.CameraCommand{Type: "create", RequestID: "replacement"})
	if event := cameraCommand(t, s, b, models.CameraCommand{Type: "join", RequestID: "limited", Code: room.Code}); event.Error != "rate_limited" {
		t.Fatal("room replacement bypassed account throttle")
	}
	cameraPeer(t, s, "a")
	cameraPeer(t, s, "a")
	if _, err := s.Open("a"); err == nil {
		t.Fatal("unbounded sockets per account")
	}
	newAPI := NewCameraService()
	defer newAPI.Close()
	newPeer := cameraPeer(t, newAPI, "a")
	if event := cameraCommand(t, newAPI, newPeer, models.CameraCommand{Type: "resume", RequestID: "restart", RoomID: room.Room.ID, MemberID: room.MemberID}); event.Error != "room_missing" {
		t.Fatal("API restart retained ephemeral room")
	}
}

func TestCameraRestoreWhenInitialReplyIsLost(t *testing.T) {
	s := NewCameraService()
	defer s.Close()
	a := cameraPeer(t, s, "a")
	primaryID := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	room := cameraCommand(t, s, a, models.CameraCommand{Type: "create", RequestID: "create", MemberID: primaryID})
	wrong := cameraPeer(t, s, "a")
	if event := cameraCommand(t, s, wrong, models.CameraCommand{Type: "join", RequestID: "collide", MemberID: primaryID, Code: room.Code}); event.Error != "invalid_request" {
		t.Fatal("two roles shared a member identity")
	}
	s.Disconnect(wrong)
	s.Disconnect(a)
	a = cameraPeer(t, s, "a")
	restored := cameraCommand(t, s, a, models.CameraCommand{Type: "create", RequestID: "retry-create", MemberID: primaryID})
	if restored.Type != "membership" || restored.Room.ID != room.Room.ID || restored.MemberID != primaryID {
		t.Fatal("lost create reply stranded primary")
	}
	b := cameraPeer(t, s, "a")
	secondaryID := "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	joined := cameraCommand(t, s, b, models.CameraCommand{Type: "join", RequestID: "join", MemberID: secondaryID, Code: room.Code})
	s.Disconnect(b)
	b = cameraPeer(t, s, "a")
	restored = cameraCommand(t, s, b, models.CameraCommand{Type: "join", RequestID: "retry-join", MemberID: secondaryID, Code: room.Code})
	if restored.Type != "membership" || restored.MemberID != joined.MemberID || len(restored.Room.Members) != 2 {
		t.Fatal("lost join reply stranded secondary")
	}
	third := cameraPeer(t, s, "a")
	if event := cameraCommand(t, s, third, models.CameraCommand{Type: "create", RequestID: "bad-id", MemberID: "bad"}); event.Error != "invalid_request" {
		t.Fatal("invalid client identity accepted")
	}
}

func TestCameraReadinessExpiresIndependentlyAndResetsOnReconnect(t *testing.T) {
	s := NewCameraService()
	defer s.Close()
	now := time.Now()
	s.now = func() time.Time { return now }
	a, b := cameraPeer(t, s, "a"), cameraPeer(t, s, "a")
	primary := cameraCommand(t, s, a, models.CameraCommand{Type: "create", RequestID: "create"})
	secondary := cameraCommand(t, s, b, models.CameraCommand{Type: "join", RequestID: "join", Code: primary.Code})
	ready := true
	for i, peer := range []*CameraPeer{a, b} {
		cameraCommand(t, s, peer, models.CameraCommand{Type: "readiness", RequestID: fmt.Sprintf("ready-%d", i), RoomID: primary.Room.ID, Ready: &ready})
	}
	view := s.snapshot(s.rooms["a"])
	if !view.Members[0].Ready || !view.Members[1].Ready {
		t.Fatal("paired ready cameras not reported ready")
	}
	ready = false
	cameraCommand(t, s, b, models.CameraCommand{Type: "readiness", RequestID: "not-ready", RoomID: primary.Room.ID, Ready: &ready})
	if s.snapshot(s.rooms["a"]).Members[1].Ready {
		t.Fatal("failed quality check left ready status set")
	}
	ready = true
	cameraCommand(t, s, b, models.CameraCommand{Type: "readiness", RequestID: "ready-again", RoomID: primary.Room.ID, Ready: &ready})
	now = now.Add(3 * time.Second)
	for i, peer := range []*CameraPeer{a, b} {
		cameraCommand(t, s, peer, models.CameraCommand{Type: "heartbeat", RequestID: fmt.Sprintf("hb-%d", i)})
	}
	s.Sweep()
	view = s.snapshot(s.rooms["a"])
	for _, member := range view.Members {
		if member.Ready || !member.Connected {
			t.Fatal("heartbeat incorrectly kept old camera readiness alive")
		}
	}
	cameraCommand(t, s, b, models.CameraCommand{Type: "readiness", RequestID: "ready-later", RoomID: primary.Room.ID, Ready: &ready})
	s.Disconnect(b)
	if s.snapshot(s.rooms["a"]).Members[1].Ready {
		t.Fatal("disconnected camera stayed ready")
	}
	b = cameraPeer(t, s, "a")
	resumed := cameraCommand(t, s, b, models.CameraCommand{Type: "resume", RequestID: "resume", RoomID: primary.Room.ID, MemberID: secondary.MemberID})
	if resumed.Room.Members[1].Ready {
		t.Fatal("reconnect inherited old readiness")
	}
	nonmember := cameraPeer(t, s, "a")
	if event := cameraCommand(t, s, nonmember, models.CameraCommand{Type: "readiness", RequestID: "spoof", RoomID: primary.Room.ID, Ready: &ready}); event.Error != "room_missing" {
		t.Fatal("nonmember published readiness")
	}
	if event := cameraCommand(t, s, b, models.CameraCommand{Type: "readiness", RequestID: "missing-ready", RoomID: primary.Room.ID}); event.Error != "invalid_request" {
		t.Fatal("missing readiness accepted")
	}
}

func TestCameraReadyPairCanStartCountdown(t *testing.T) {
	s := NewCameraService()
	defer s.Close()
	a, b := cameraPeer(t, s, "a"), cameraPeer(t, s, "a")
	room := cameraCommand(t, s, a, models.CameraCommand{Type: "create", RequestID: "create"})
	cameraCommand(t, s, b, models.CameraCommand{Type: "join", RequestID: "join", Code: room.Code})
	ready := true
	for i, peer := range []*CameraPeer{a, b} {
		cameraCommand(t, s, peer, models.CameraCommand{Type: "readiness", RequestID: fmt.Sprintf("ready-%d", i), RoomID: room.Room.ID, Ready: &ready})
	}
	event := cameraCommand(t, s, a, models.CameraCommand{Type: "start", RequestID: "start", RoomID: room.Room.ID})
	if event.Type != "ack" {
		t.Fatalf("both cameras ready but countdown cannot start: type=%s error=%s", event.Type, event.Error)
	}
}

func TestCameraCaptureLifecycleAndStaleCommands(t *testing.T) {
	s := NewCameraService()
	defer s.Close()
	now := time.Now()
	s.now = func() time.Time { return now }
	a, b := cameraPeer(t, s, "a"), cameraPeer(t, s, "a")
	room := cameraCommand(t, s, a, models.CameraCommand{Type: "create", RequestID: "create"})
	cameraCommand(t, s, b, models.CameraCommand{Type: "join", RequestID: "join", Code: room.Code})
	sequence := 0
	request := func(p *CameraPeer, kind, take string) models.CameraEvent {
		sequence++
		yes := true
		return cameraCommand(t, s, p, models.CameraCommand{Type: kind, RequestID: fmt.Sprint(sequence), RoomID: room.Room.ID, TakeID: take, Ready: &yes, Complete: &yes})
	}
	request(a, "readiness", "")
	request(b, "readiness", "")
	if event := request(b, "start", ""); event.Error != "primary_required" {
		t.Fatal("secondary started a take")
	}
	request(a, "start", "")
	take := s.snapshot(s.rooms["a"]).Take
	if take.Phase != "preparing" {
		t.Fatal("start skipped preparation")
	}
	request(a, "prepared", take.ID)
	if s.snapshot(s.rooms["a"]).Take.Phase != "preparing" {
		t.Fatal("started before companion prepared")
	}
	request(b, "prepared", take.ID)
	take = s.snapshot(s.rooms["a"]).Take
	if take.Phase != "countdown" || take.StartAtMs-float64(now.UnixMicro())/1000 != 5000 {
		t.Fatal("countdown is not five seconds")
	}
	for i := 0; i < 5; i++ {
		now = now.Add(time.Second)
		request(a, "readiness", "")
		request(b, "readiness", "")
		s.Sweep()
	}
	request(a, "started", take.ID)
	request(b, "started", take.ID)
	if s.snapshot(s.rooms["a"]).Take.Phase != "recording" {
		t.Fatal("take not recording")
	}
	no := false
	cameraCommand(t, s, b, models.CameraCommand{Type: "readiness", RequestID: "quality-lost", RoomID: room.Room.ID, Ready: &no})
	if s.snapshot(s.rooms["a"]).Take.Phase != "recording" {
		t.Fatal("quality warning stopped recording")
	}
	request(b, "stop", take.ID)
	if s.snapshot(s.rooms["a"]).Take.Phase != "stopping" {
		t.Fatal("secondary could not stop pair")
	}
	request(a, "finished", take.ID)
	request(b, "finished", take.ID)
	request(a, "clear", take.ID)
	request(a, "finished", take.ID)
	if s.snapshot(s.rooms["a"]).Take.Captures[0] != "cleared" {
		t.Fatal("late finish undid clearing")
	}
	request(b, "clear", take.ID)
	if s.snapshot(s.rooms["a"]).Take != nil {
		t.Fatal("next take blocked after both cleared")
	}
	if event := request(a, "stop", take.ID); event.Error != "stale_take" {
		t.Fatal("old stop accepted")
	}
}
