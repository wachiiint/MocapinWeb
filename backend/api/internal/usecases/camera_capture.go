package usecases

import (
	"time"

	"mocapin/api/internal/models"
)

func (s *CameraService) bothReady(room *cameraRoom) bool {
	for _, member := range room.members {
		if member == nil || member.peer == nil || !member.ready || s.now().Sub(member.readyAt) >= cameraHeartbeatTimeout {
			return false
		}
	}
	return true
}

func (s *CameraService) interruptTake(room *cameraRoom) {
	if room.take == nil {
		return
	}
	if room.take.Phase == "preparing" || room.take.Phase == "countdown" {
		room.take.Phase = "cancelled"
	}
}

func (s *CameraService) captureCommand(room *cameraRoom, peer *CameraPeer, command models.CameraCommand) models.CameraEvent {
	fail := func(code string) models.CameraEvent { return models.CameraEvent{Type: "error", Error: code} }
	if room == nil || room.id != command.RoomID || peer.roomID != room.id {
		return fail("room_missing")
	}
	slot := -1
	for i, member := range room.members {
		if member != nil && member.peer == peer {
			slot = i
		}
	}
	if slot < 0 {
		return fail("member_missing")
	}
	take := room.take
	if command.Type == "start" {
		if slot != 0 {
			return fail("primary_required")
		}
		if take != nil && take.Phase != "cancelled" {
			return fail("capture_busy")
		}
		if !s.bothReady(room) {
			return fail("not_ready")
		}
		id, err := cameraID()
		if err != nil {
			return fail("unavailable")
		}
		room.take = &models.CameraTake{ID: id, Phase: "preparing", Captures: [2]string{"idle", "idle"}}
		room.prepareBy = s.now().Add(3 * time.Second)
		s.broadcast(room)
		return models.CameraEvent{Type: "ack"}
	}
	if take == nil || take.ID != command.TakeID {
		return fail("stale_take")
	}
	switch command.Type {
	case "prepared":
		if take.Phase != "preparing" {
			return models.CameraEvent{Type: "ack"}
		}
		if !s.bothReady(room) {
			take.Phase = "cancelled"
			break
		}
		take.Captures[slot] = "prepared"
		if take.Captures[0] == "prepared" && take.Captures[1] == "prepared" {
			take.StartAtMs = float64(s.now().Add(5*time.Second).UnixMicro()) / 1000
			take.Phase = "countdown"
		}
	case "cancel":
		if take.Phase == "preparing" || take.Phase == "countdown" {
			take.Phase = "cancelled"
		}
	case "started":
		if take.Captures[slot] == "recording" {
			return models.CameraEvent{Type: "ack"}
		}
		now := float64(s.now().UnixMicro()) / 1000
		if (take.Phase != "countdown" && take.Phase != "recording") || take.Captures[slot] != "prepared" || now < take.StartAtMs-1000 || now > take.StartAtMs+3000 {
			return fail("stale_take")
		}
		take.Captures[slot] = "recording"
		take.Phase = "recording"
	case "stop":
		if take.Phase == "preparing" || take.Phase == "countdown" {
			take.Phase = "cancelled"
		} else if take.Phase == "recording" {
			take.Phase = "stopping"
		}
	case "finished", "capture-failed":
		if take.Captures[slot] == "finished" || take.Captures[slot] == "failed" || take.Captures[slot] == "cleared" {
			return models.CameraEvent{Type: "ack"}
		}
		if command.Type == "capture-failed" && (take.Phase == "preparing" || take.Phase == "countdown") {
			take.Phase = "cancelled"
			break
		}
		if take.Phase != "recording" && take.Phase != "stopping" {
			return fail("stale_take")
		}
		if command.Type == "finished" {
			take.Captures[slot] = "finished"
		} else {
			take.Captures[slot] = "failed"
		}
		if command.Complete == nil || !*command.Complete {
			take.Incomplete = true
		}
		s.finishTake(take)
	case "clear":
		if take.Phase != "finished" && take.Phase != "cancelled" {
			return fail("capture_busy")
		}
		if take.Captures[slot] == "cleared" {
			return models.CameraEvent{Type: "ack"}
		}
		take.Captures[slot] = "cleared"
		if take.Phase == "finished" && take.Captures[0] == "cleared" && take.Captures[1] == "cleared" {
			room.take = nil
		}
	}
	s.broadcast(room)
	return models.CameraEvent{Type: "ack"}
}

func (s *CameraService) finishTake(take *models.CameraTake) {
	for _, state := range take.Captures {
		if state != "finished" && state != "failed" {
			return
		}
	}
	take.Phase = "finished"
}

func (s *CameraService) sweepTake(room *cameraRoom, now time.Time) {
	take := room.take
	if take == nil {
		return
	}
	if take.Phase == "preparing" && !now.Before(room.prepareBy) {
		take.Phase = "cancelled"
		s.broadcast(room)
	}
	if take.StartAtMs > 0 && float64(now.UnixMicro())/1000 >= take.StartAtMs+3000 && (take.Phase == "countdown" || take.Phase == "recording" || take.Phase == "stopping") {
		changed := false
		for i, state := range take.Captures {
			if state == "prepared" || state == "idle" {
				take.Captures[i] = "failed"
				take.Incomplete = true
				changed = true
			}
		}
		if changed {
			s.finishTake(take)
			s.broadcast(room)
		}
	}
}
