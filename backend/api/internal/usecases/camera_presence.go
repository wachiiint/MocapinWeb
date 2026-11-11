package usecases

import (
	"time"

	"mocapin/api/internal/models"
)

func (s *CameraService) attach(room *cameraRoom, p *CameraPeer, slot int, id string) models.CameraEvent {
	var err error
	if id == "" {
		id, err = cameraID()
	}
	if err != nil {
		if slot == 0 {
			delete(s.rooms, room.account)
		}
		return models.CameraEvent{Type: "error", Error: "unavailable"}
	}
	member := &cameraMember{id: id, peer: p}
	room.members[slot] = member
	p.roomID = room.id
	room.absentSince = time.Time{}
	s.broadcast(room)
	return s.membership(room, member, slot)
}

func (s *CameraService) restore(room *cameraRoom, p *CameraPeer, slot int) models.CameraEvent {
	member := room.members[slot]
	if member.peer != nil {
		s.disconnect(member.peer)
	}
	member.peer = p
	member.ready = false
	member.readyAt = time.Time{}
	p.roomID = room.id
	room.absentSince = time.Time{}
	s.broadcast(room)
	return s.membership(room, member, slot)
}

func (s *CameraService) membership(room *cameraRoom, member *cameraMember, slot int) models.CameraEvent {
	event := models.CameraEvent{Type: "membership", Room: s.snapshot(room), MemberID: member.id, Role: cameraRole(slot)}
	if slot == 0 {
		expiry := room.codeExpires
		event.Code = room.code
		event.CodeExpiresAt = &expiry
	}
	return event
}

func (s *CameraService) leave(room *cameraRoom, p *CameraPeer) models.CameraEvent {
	if room.members[0].peer == p {
		room.seq++
		delete(s.rooms, p.account)
		for _, member := range room.members {
			if member != nil && member.peer != nil {
				member.peer.roomID = ""
				s.send(member.peer, models.CameraEvent{Type: "room_closed", RoomID: room.id, Seq: room.seq})
			}
		}
	} else {
		room.members[1] = nil
		p.roomID = ""
		if !s.hasPeers(room) {
			room.absentSince = s.now()
		}
		s.broadcast(room)
	}
	return models.CameraEvent{Type: "left", RoomID: room.id, Seq: room.seq}
}

func cameraRole(slot int) string {
	if slot == 0 {
		return "primary"
	}
	return "secondary"
}

func (s *CameraService) snapshot(room *cameraRoom) *models.CameraRoom {
	view := &models.CameraRoom{ID: room.id, Seq: room.seq, Members: []models.CameraMember{}}
	if room.take != nil {
		take := *room.take
		view.Take = &take
	}
	for slot, member := range room.members {
		if member != nil {
			view.Members = append(view.Members, models.CameraMember{Role: cameraRole(slot), Connected: member.peer != nil,
				Ready: member.peer != nil && member.ready && s.now().Sub(member.readyAt) < cameraHeartbeatTimeout})
		}
	}
	return view
}

func (s *CameraService) broadcast(room *cameraRoom) {
	room.seq++
	event := models.CameraEvent{Type: "state", Room: s.snapshot(room)}
	for _, member := range room.members {
		if member != nil && member.peer != nil {
			s.send(member.peer, event)
		}
	}
}

func (s *CameraService) send(p *CameraPeer, event models.CameraEvent) {
	if p.closed {
		return
	}
	select {
	case p.events <- event:
	default:
		// A stalled consumer must not block the other phone or grow an unbounded queue.
		s.disconnect(p)
	}
}

func (s *CameraService) hasPeers(room *cameraRoom) bool {
	for _, member := range room.members {
		if member != nil && member.peer != nil {
			return true
		}
	}
	return false
}

// Sweep is driven by the API's existing lifecycle loop, not a detached worker.
func (s *CameraService) Sweep() {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	for peer := range s.peers {
		if now.Sub(peer.lastSeen) >= cameraHeartbeatTimeout {
			s.disconnect(peer)
		}
	}
	for account, room := range s.rooms {
		changed := false
		for _, member := range room.members {
			if member != nil && member.ready && now.Sub(member.readyAt) >= cameraHeartbeatTimeout {
				member.ready = false
				changed = true
			}
		}
		if changed {
			s.interruptTake(room)
			s.broadcast(room)
		}
		s.sweepTake(room, now)
		if !room.absentSince.IsZero() && now.Sub(room.absentSince) >= 30*time.Minute {
			delete(s.rooms, account)
		}
	}
	for account, attempts := range s.failed {
		if now.Sub(attempts.since) >= time.Minute {
			delete(s.failed, account)
		}
	}
}

func (s *CameraService) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for peer := range s.peers {
		s.disconnect(peer)
	}
	clear(s.rooms)
	clear(s.failed)
}
