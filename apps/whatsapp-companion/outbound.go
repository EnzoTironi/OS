package companion

import (
	"encoding/json"
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

func buildWireMessage(shape WireShape) (*waE2E.Message, error) {
	switch shape.Kind {
	case "", "text":
		if strings.TrimSpace(shape.Text) == "" {
			return nil, fmt.Errorf("companion: empty text")
		}
		return &waE2E.Message{Conversation: proto.String(shape.Text)}, nil
	case "cta_url":
		if !strings.HasPrefix(strings.ToLower(shape.URL), "https://") {
			return nil, fmt.Errorf("companion: cta_url requires https")
		}
		params, err := json.Marshal(map[string]string{
			"display_text": "Open",
			"url":          shape.URL,
			"merchant_url": shape.URL,
		})
		if err != nil {
			return nil, err
		}
		return &waE2E.Message{
			ViewOnceMessage: &waE2E.FutureProofMessage{
				Message: &waE2E.Message{
					InteractiveMessage: &waE2E.InteractiveMessage{
						Body: &waE2E.InteractiveMessage_Body{Text: proto.String(shape.Text)},
						InteractiveMessage: &waE2E.InteractiveMessage_NativeFlowMessage_{
							NativeFlowMessage: &waE2E.InteractiveMessage_NativeFlowMessage{
								Buttons: []*waE2E.InteractiveMessage_NativeFlowMessage_NativeFlowButton{{
									Name:             proto.String("cta_url"),
									ButtonParamsJSON: proto.String(string(params)),
								}},
							},
						},
					},
				},
			},
		}, nil
	case "quick_reply":
		if len(shape.Buttons) == 0 || len(shape.Buttons) > 3 {
			return nil, fmt.Errorf("companion: quick_reply needs 1..3 buttons")
		}
		buttons := make([]*waE2E.InteractiveMessage_NativeFlowMessage_NativeFlowButton, 0, len(shape.Buttons))
		for _, button := range shape.Buttons {
			params, err := json.Marshal(map[string]string{
				"display_text": button.Label,
				"id":           button.CallbackData,
			})
			if err != nil {
				return nil, err
			}
			buttons = append(buttons, &waE2E.InteractiveMessage_NativeFlowMessage_NativeFlowButton{
				Name:             proto.String("quick_reply"),
				ButtonParamsJSON: proto.String(string(params)),
			})
		}
		return &waE2E.Message{
			InteractiveMessage: &waE2E.InteractiveMessage{
				Body: &waE2E.InteractiveMessage_Body{Text: proto.String(shape.Text)},
				InteractiveMessage: &waE2E.InteractiveMessage_NativeFlowMessage_{
					NativeFlowMessage: &waE2E.InteractiveMessage_NativeFlowMessage{
						Buttons: buttons,
					},
				},
			},
		}, nil
	case "list", "carousel":
		return &waE2E.Message{Conversation: proto.String(shape.Text)}, nil
	default:
		return nil, fmt.Errorf("companion: unknown wire shape %q", shape.Kind)
	}
}
