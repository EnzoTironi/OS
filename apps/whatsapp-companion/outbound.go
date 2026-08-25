package companion

import (
	"fmt"
	"strings"

	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"google.golang.org/protobuf/proto"
)

type WireButton struct {
	Label        string `json:"label"`
	CallbackData string `json:"callbackData"`
}

type WireRow struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

type WireShape struct {
	Kind    string       `json:"kind"`
	Text    string       `json:"text"`
	URL     string       `json:"url,omitempty"`
	Buttons []WireButton `json:"buttons,omitempty"`
	Rows    []WireRow    `json:"rows,omitempty"`
}

func parseChatPresence(state string) (types.ChatPresence, error) {
	switch strings.TrimSpace(state) {
	case "composing":
		return types.ChatPresenceComposing, nil
	case "paused":
		return types.ChatPresencePaused, nil
	default:
		return "", fmt.Errorf("companion: presence state must be composing or paused")
	}
}

func parseOutboundChatJID(raw string) (types.JID, error) {
	session := strings.TrimSpace(raw)
	if session == "" {
		return types.EmptyJID, fmt.Errorf("companion: outbound chat JID required")
	}
	to, err := types.ParseJID(session)
	if err != nil || to.IsEmpty() {
		return types.EmptyJID, fmt.Errorf("companion: invalid outbound session JID")
	}
	to = to.ToNonAD()
	switch to.Server {
	case types.DefaultUserServer, types.LegacyUserServer, types.HiddenUserServer, types.GroupServer:
		return to, nil
	default:
		return types.EmptyJID, fmt.Errorf("companion: unsupported outbound session server %q", to.Server)
	}
}

func conversationText(shape WireShape) (string, error) {
	text := strings.TrimSpace(shape.Text)
	url := strings.TrimSpace(shape.URL)
	if url != "" {
		if !strings.HasPrefix(strings.ToLower(url), "https://") {
			return "", fmt.Errorf("companion: surface URL requires https")
		}
		if text == "" {
			text = url
		} else if !strings.Contains(text, url) {
			text = text + "\n" + url
		}
	}
	if text == "" {
		return "", fmt.Errorf("companion: empty text")
	}
	return text, nil
}

func buildWireMessage(shape WireShape) (*waE2E.Message, error) {
	switch shape.Kind {
	case "", "text", "cta_url", "quick_reply", "list", "carousel":
		text, err := conversationText(shape)
		if err != nil {
			return nil, err
		}
		return &waE2E.Message{Conversation: proto.String(text)}, nil
	default:
		return nil, fmt.Errorf("companion: unknown wire shape %q", shape.Kind)
	}
}
