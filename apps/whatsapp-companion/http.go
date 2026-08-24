package companion

import (
	"encoding/json"
	"net/http"
)

type sendRequest struct {
	ChatJID          string    `json:"chatJid"`
	ClientDeliveryID string    `json:"clientDeliveryId"`
	Shape            WireShape `json:"shape"`
}

func (s *Session) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /ready", s.handleReady)
	mux.HandleFunc("POST /send", s.handleSend)
	return mux
}

func (s *Session) handleReady(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"paired":    s.IsPaired(),
		"connected": s.IsConnected(),
		"loggedIn":  s.IsLoggedIn(),
		"ready":     s.Ready(),
	})
}

func (s *Session) handleSend(w http.ResponseWriter, r *http.Request) {
	var req sendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return
	}
	id, err := s.Send(r.Context(), req.ChatJID, req.Shape)
	if err != nil {
		status := http.StatusBadRequest
		if err == ErrNotLoggedIn || err == ErrPairingRequired {
			status = http.StatusServiceUnavailable
		}
		writeJSON(w, status, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"messageId": id})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
