package companion

import (
	"context"
	"strings"
	"testing"
	"time"

	"go.mau.fi/whatsmeow/proto/waCompanionReg"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
)

func TestValidateConfigRejectsEmptyAndAuthorityCollision(t *testing.T) {
	t.Parallel()
	if err := ValidateConfig(Config{}); err != ErrDatabaseURL {
		t.Fatalf("empty: %v", err)
	}
	err := ValidateConfig(Config{
		DatabaseURL:          "postgres://whatsmeow",
		AuthorityDatabaseURL: "postgres://whatsmeow",
	})
	if err != ErrAuthorityStore {
		t.Fatalf("collision: %v", err)
	}
	if err := ValidateConfig(Config{
		DatabaseURL:          "postgres://whatsmeow",
		AuthorityDatabaseURL: "postgres://zoen",
	}); err != nil {
		t.Fatal(err)
	}
}

func TestConfigureCompanionDevicePropsUsesChromeQRClient(t *testing.T) {
	configureCompanionDeviceProps()
	if store.DeviceProps.GetOs() != "Linux" {
		t.Fatalf("os = %q, want Linux", store.DeviceProps.GetOs())
	}
	if store.DeviceProps.GetPlatformType() != waCompanionReg.DeviceProps_CHROME {
		t.Fatalf("platform = %v, want CHROME", store.DeviceProps.GetPlatformType())
	}
	want := store.GetWAVersion()
	got := store.DeviceProps.GetVersion()
	if got.GetPrimary() != want[0] || got.GetSecondary() != want[1] || got.GetTertiary() != want[2] {
		t.Fatalf("companion version = %d.%d.%d, want %v", got.GetPrimary(), got.GetSecondary(), got.GetTertiary(), want)
	}
}

func TestPairedJIDEmptyWhenUnpaired(t *testing.T) {
	t.Parallel()
	var session *Session
	if session.PairedJID() != "" || session.IsPaired() || session.Ready() {
		t.Fatal("nil session must not be ready")
	}
}

func TestNormalizeInboundDropsFromMe(t *testing.T) {
	t.Parallel()
	event := textEvent("wamid.me", "5531888888888@s.whatsapp.net", "5531888888888@s.whatsapp.net", "oi", true, false)
	_, accept, err := normalizeInboundMessage(event)
	if err != nil {
		t.Fatal(err)
	}
	if accept {
		t.Fatal("FromMe must drop")
	}
}

func TestNormalizeInboundGroupUsesSpeaker(t *testing.T) {
	t.Parallel()
	event := textEvent("wamid.g", "120363000000000000@g.us", "5531888888888@s.whatsapp.net", "oi", false, true)
	got, accept, err := normalizeInboundMessage(event)
	if err != nil {
		t.Fatal(err)
	}
	if !accept {
		t.Fatal("group text must accept")
	}
	if got.ChatJID != "120363000000000000@g.us" {
		t.Fatalf("chat=%q", got.ChatJID)
	}
	if got.SenderJID != "5531888888888@s.whatsapp.net" {
		t.Fatalf("sender=%q", got.SenderJID)
	}
	if strings.Contains(got.SenderJID, "@g.us") {
		t.Fatal("speaker must not be the group")
	}
}

func TestLIDMapHitAndMiss(t *testing.T) {
	t.Parallel()
	lid := "123456789012345@lid"
	phone := "5531888888888@s.whatsapp.net"
	hit, chat := enrichInboundPersonRefs(context.Background(), lid, "", lid, false, func(context.Context, types.JID) (types.JID, error) {
		return types.NewJID("5531888888888", types.DefaultUserServer), nil
	})
	if hit != phone || chat != phone {
		t.Fatalf("hit alt=%q chat=%q", hit, chat)
	}
	miss, missChat := enrichInboundPersonRefs(context.Background(), lid, "", lid, false, func(context.Context, types.JID) (types.JID, error) {
		return types.JID{}, nil
	})
	if miss != "" {
		t.Fatalf("miss invented phone %q", miss)
	}
	if missChat != lid {
		t.Fatalf("miss chat=%q", missChat)
	}
}

func TestParseOutboundChatJID(t *testing.T) {
	t.Parallel()
	group, err := parseOutboundChatJID("120363000000000000@g.us")
	if err != nil {
		t.Fatal(err)
	}
	if group.Server != types.GroupServer {
		t.Fatalf("server=%q", group.Server)
	}
	if _, err := parseOutboundChatJID("status@broadcast"); err == nil {
		t.Fatal("broadcast must fail closed")
	}
}

func TestBuildCTAURLRejectsNonHTTPS(t *testing.T) {
	t.Parallel()
	if _, err := buildWireMessage(WireShape{Kind: "cta_url", Text: "x", URL: "zoen-rich://nope"}); err == nil {
		t.Fatal("zoen-rich must fail")
	}
	msg, err := buildWireMessage(WireShape{Kind: "cta_url", Text: "open", URL: "https://zoen.example/s"})
	if err != nil {
		t.Fatal(err)
	}
	if msg.GetViewOnceMessage().GetMessage().GetInteractiveMessage().GetNativeFlowMessage().GetButtons()[0].GetName() != "cta_url" {
		t.Fatal("expected cta_url button")
	}
}

func textEvent(id, chat, sender, body string, fromMe, group bool) *events.Message {
	chatJID, _ := types.ParseJID(chat)
	senderJID, _ := types.ParseJID(sender)
	return &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Chat:     chatJID,
				Sender:   senderJID,
				IsFromMe: fromMe,
				IsGroup:  group,
			},
			ID:        types.MessageID(id),
			Timestamp: time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC),
		},
		Message: &waE2E.Message{Conversation: strPtr(body)},
	}
}
