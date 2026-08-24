package companion

import (
	"context"
	"errors"
	"strings"
	"time"

	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
)

const groupJIDMarker = "@g.us"

type Inbound struct {
	MessageID    string `json:"messageId"`
	ChatJID      string `json:"chatJid"`
	SenderJID    string `json:"senderJid"`
	SenderAltJID string `json:"senderAltJid"`
	IsGroup      bool   `json:"isGroup"`
	FromMe       bool   `json:"fromMe"`
	Body         string `json:"body"`
	ObservedAt   string `json:"observedAt"`
	CallbackData string `json:"callbackData,omitempty"`
}

type lidPNLookup func(context.Context, types.JID) (types.JID, error)

func normalizeInboundMessage(event *events.Message) (Inbound, bool, error) {
	if event == nil || event.Message == nil {
		return Inbound{}, false, errors.New("companion: malformed message event")
	}
	if event.Info.IsFromMe {
		return Inbound{}, false, nil
	}
	messageID := strings.TrimSpace(string(event.Info.ID))
	chatRef := strings.TrimSpace(event.Info.Chat.String())
	senderRef := strings.TrimSpace(event.Info.Sender.String())
	if messageID == "" || chatRef == "" || senderRef == "" || event.Info.Timestamp.IsZero() {
		return Inbound{}, false, errors.New("companion: message event missing source identity or timestamp")
	}
	if strings.Contains(strings.ToLower(senderRef), groupJIDMarker) {
		return Inbound{}, false, errors.New("companion: group JID is not a speaker")
	}
	body := strings.TrimSpace(event.Message.GetConversation())
	if body == "" {
		body = strings.TrimSpace(event.Message.GetExtendedTextMessage().GetText())
	}
	callback := selectedCallback(event.Message)
	if body == "" && callback == "" {
		return Inbound{}, false, nil
	}
	return Inbound{
		MessageID:    messageID,
		ChatJID:      chatRef,
		SenderJID:    senderRef,
		SenderAltJID: strings.TrimSpace(event.Info.SenderAlt.String()),
		IsGroup:      event.Info.IsGroup,
		FromMe:       false,
		Body:         body,
		ObservedAt:   event.Info.Timestamp.UTC().Format(time.RFC3339Nano),
		CallbackData: callback,
	}, true, nil
}

func selectedCallback(msg *waE2E.Message) string {
	if msg == nil {
		return ""
	}
	if buttons := msg.GetButtonsResponseMessage(); buttons != nil {
		return strings.TrimSpace(buttons.GetSelectedButtonID())
	}
	if reply := msg.GetTemplateButtonReplyMessage(); reply != nil {
		return strings.TrimSpace(reply.GetSelectedID())
	}
	if row := msg.GetListResponseMessage().GetSingleSelectReply(); row != nil {
		return strings.TrimSpace(row.GetSelectedRowID())
	}
	return ""
}

func parseSpeakerJID(raw string) (types.JID, bool) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return types.JID{}, false
	}
	jid, err := types.ParseJID(value)
	if err != nil || jid.IsEmpty() || jid.User == "" {
		return types.JID{}, false
	}
	return jid, true
}

func parsePersonPhone(raw string) (types.JID, bool) {
	jid, ok := parseSpeakerJID(raw)
	if !ok || jid.User == "" {
		return types.JID{}, false
	}
	switch jid.Server {
	case types.DefaultUserServer, types.LegacyUserServer:
		return jid.ToNonAD(), true
	default:
		return types.JID{}, false
	}
}

func parseLID(raw string) (types.JID, bool) {
	jid, ok := parseSpeakerJID(raw)
	if !ok || jid.User == "" || jid.Server != types.HiddenUserServer {
		return types.JID{}, false
	}
	return jid.ToNonAD(), true
}

func enrichPersonAltRef(ctx context.Context, sender, alt string, lookup lidPNLookup) string {
	if phone, ok := parsePersonPhone(alt); ok {
		return phone.String()
	}
	lid, ok := parseLID(sender)
	if !ok || lookup == nil {
		return ""
	}
	if ctx == nil {
		ctx = context.Background()
	}
	pn, err := lookup(ctx, lid)
	if err != nil {
		return ""
	}
	if phone, ok := parsePersonPhone(pn.String()); ok {
		return phone.String()
	}
	return ""
}

func enrichInboundPersonRefs(ctx context.Context, sender, alt, chat string, isGroup bool, lookup lidPNLookup) (string, string) {
	altOut := enrichPersonAltRef(ctx, sender, alt, lookup)
	if isGroup || strings.Contains(strings.ToLower(chat), groupJIDMarker) {
		return altOut, strings.TrimSpace(chat)
	}
	if phone, ok := parsePersonPhone(chat); ok {
		return altOut, phone.String()
	}
	if mapped := enrichPersonAltRef(ctx, chat, "", lookup); mapped != "" {
		if altOut == "" {
			altOut = mapped
		}
		return altOut, mapped
	}
	if altOut != "" {
		if _, isLID := parseLID(chat); isLID || chat == "s.whatsapp.net" {
			return altOut, altOut
		}
	}
	return altOut, strings.TrimSpace(chat)
}

func (s *Session) lookupPNForLID(ctx context.Context, lid types.JID) (types.JID, error) {
	if s != nil && s.lidPN != nil {
		return s.lidPN(ctx, lid)
	}
	if s == nil || s.client == nil || s.client.Store == nil || s.client.Store.LIDs == nil {
		return types.JID{}, nil
	}
	return s.client.Store.LIDs.GetPNForLID(ctx, lid)
}

func (s *Session) applyLIDMap(alt, chat *string, sender string, isGroup bool) {
	if alt == nil || chat == nil {
		return
	}
	ctx := context.Background()
	if s != nil && s.ctx != nil {
		ctx = s.ctx
	}
	*alt, *chat = enrichInboundPersonRefs(ctx, sender, *alt, *chat, isGroup, s.lookupPNForLID)
}
