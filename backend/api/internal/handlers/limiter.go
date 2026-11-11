package handlers

import (
	"net"
	"net/http"
	"sync"
	"time"
)

type attempt struct {
	count int
	until time.Time
}

// One process serves the test installation. Entries expire and the map is bounded.
func LimitLogin(next http.Handler) http.Handler {
	var mu sync.Mutex
	entries := map[string]attempt{}
	slots := make(chan struct{}, 4)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if (r.URL.Path != "/api/auth/login" && r.URL.Path != "/api/auth/signup") || r.Method != "POST" {
			next.ServeHTTP(w, r)
			return
		}
		ip, _, _ := net.SplitHostPort(r.RemoteAddr)
		// Deployment restricts host ingress to loopback; Cloudflare overwrites this header at its edge.
		if edge := net.ParseIP(r.Header.Get("CF-Connecting-IP")); edge != nil {
			ip = edge.String()
		}
		now := time.Now()
		mu.Lock()
		for key, value := range entries {
			if !now.Before(value.until) {
				delete(entries, key)
			}
		}
		value := entries[ip]
		blocked := value.count >= 10 || (value.count == 0 && len(entries) >= 4096)
		if !blocked {
			if value.count == 0 {
				value.until = now.Add(time.Minute)
			}
			value.count++
			entries[ip] = value
		}
		mu.Unlock()
		if blocked {
			w.Header().Set("Retry-After", "60")
			http.Error(w, "too many attempts", 429)
			return
		}
		select {
		case slots <- struct{}{}:
			defer func() { <-slots }()
			next.ServeHTTP(w, r)
		default:
			w.Header().Set("Retry-After", "1")
			http.Error(w, "busy", 429)
		}
	})
}
