package handlers

import (
	"net/http"
	"strings"
)

// Public origin is explicit because TLS terminates at Cloudflare, not Go.
func Security(origin string) func(http.Handler) http.Handler {
	protection := http.NewCrossOriginProtection()
	// The caller validates origin as an HTTPS origin before registering handlers.
	if err := protection.AddTrustedOrigin(origin); err != nil {
		panic(err)
	}
	return func(next http.Handler) http.Handler {
		protected := protection.Handler(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/api/") {
				w.Header().Set("Cache-Control", "no-store")
				w.Header().Set("X-Content-Type-Options", "nosniff")
				if r.Method != "GET" && r.Method != "HEAD" && r.Header.Get("Origin") != origin {
					http.Error(w, "untrusted origin", 403)
					return
				}
			}
			protected.ServeHTTP(w, r)
		})
	}
}
