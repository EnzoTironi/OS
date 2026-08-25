package companion

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waCompanionReg"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"
)

var (
	ErrPairingRequired = errors.New("companion: device pairing required")
	ErrAlreadyPaired   = errors.New("companion: device already paired")
	ErrNotLoggedIn     = errors.New("companion: client is not logged in")
	ErrDatabaseURL     = errors.New("companion: ZOEN_WHATSAPP_DATABASE_URL required")
	ErrAuthorityStore  = errors.New("companion: ZOEN_WHATSAPP_DATABASE_URL must be distinct from ZOEN_DATABASE_URL")
)

type Config struct {
	DatabaseURL          string
	AuthorityDatabaseURL string
	IngressURL           string
	ListenAddr           string
	QRFile               string
	DropLog              io.Writer
	Log                  waLog.Logger
}

type PairingEvent struct {
	Kind    string
	Code    string
	Timeout time.Duration
	Err     error
}

type Session struct {
	ctx       context.Context
	client    *whatsmeow.Client
	device    *store.Device
	container *sqlstore.Container
	ingress   string
	dropLog   io.Writer
	http      *http.Client
	lidPN     lidPNLookup
	handlerID uint32

	closeOnce sync.Once
	closeErr  error
}

func ValidateConfig(cfg Config) error {
	if strings.TrimSpace(cfg.DatabaseURL) == "" {
		return ErrDatabaseURL
	}
	authority := strings.TrimSpace(cfg.AuthorityDatabaseURL)
	if authority != "" && strings.TrimSpace(cfg.DatabaseURL) == authority {
		return ErrAuthorityStore
	}
	return nil
}

func Open(ctx context.Context, cfg Config) (*Session, error) {
	if ctx == nil {
		return nil, errors.New("companion: context required")
	}
	if err := ValidateConfig(cfg); err != nil {
		return nil, err
	}
	var dbLog waLog.Logger
	if cfg.Log != nil {
		dbLog = cfg.Log.Sub("Database")
	}
	container, err := sqlstore.New(ctx, "pgx", cfg.DatabaseURL, dbLog)
	if err != nil {
		return nil, fmt.Errorf("companion: open whatsmeow store: %w", err)
	}
	device, err := container.GetFirstDevice(ctx)
	if err != nil {
		_ = container.Close()
		return nil, fmt.Errorf("companion: load whatsmeow device: %w", err)
	}
	configureCompanionDeviceProps()
	client := whatsmeow.NewClient(device, cfg.Log)
	client.QRClientType = whatsmeow.PairClientChrome
	session := &Session{
		ctx:       ctx,
		client:    client,
		device:    device,
		container: container,
		ingress:   strings.TrimSpace(cfg.IngressURL),
		dropLog:   cfg.DropLog,
		http:      &http.Client{Timeout: 15 * time.Second},
	}
	session.handlerID = client.AddEventHandlerWithSuccessStatus(session.handleEvent)
	return session, nil
}

func configureCompanionDeviceProps() {
	store.SetOSInfo("Linux", [3]uint32(store.GetWAVersion()))
	store.DeviceProps.PlatformType = waCompanionReg.DeviceProps_CHROME.Enum()
}

func (s *Session) IsPaired() bool {
	return s != nil && s.device != nil && s.device.ID != nil
}

func (s *Session) PairedJID() string {
	if !s.IsPaired() {
		return ""
	}
	return s.device.ID.ToNonAD().String()
}

func (s *Session) IsConnected() bool {
	return s != nil && s.client != nil && s.client.IsConnected()
}

func (s *Session) IsLoggedIn() bool {
	return s != nil && s.client != nil && s.client.IsLoggedIn()
}

func (s *Session) Ready() bool {
	return s.IsPaired() && s.IsConnected() && s.IsLoggedIn()
}

func (s *Session) Connect() error {
	if s == nil || s.client == nil {
		return errors.New("companion: session is nil")
	}
	if !s.IsPaired() {
		return ErrPairingRequired
	}
	if err := s.client.Connect(); err != nil {
		return fmt.Errorf("companion: connect: %w", err)
	}
	if !s.client.WaitForConnection(10 * time.Second) {
		return errors.New("companion: connected socket did not become authenticated before timeout")
	}
	return nil
}

func (s *Session) BeginPairing(ctx context.Context) (<-chan PairingEvent, error) {
	if s == nil || s.client == nil {
		return nil, errors.New("companion: session is nil")
	}
	if s.IsPaired() {
		return nil, ErrAlreadyPaired
	}
	if ctx == nil {
		ctx = context.Background()
	}
	qr, err := s.client.GetQRChannel(ctx)
	if err != nil {
		return nil, fmt.Errorf("companion: pairing channel: %w", err)
	}
	if err := s.client.Connect(); err != nil {
		s.client.Disconnect()
		return nil, fmt.Errorf("companion: pairing connect: %w", err)
	}
	out := make(chan PairingEvent)
	go func() {
		defer close(out)
		for item := range qr {
			event := PairingEvent{
				Kind:    item.Event,
				Code:    item.Code,
				Timeout: item.Timeout,
				Err:     item.Error,
			}
			select {
			case out <- event:
			case <-ctx.Done():
				return
			}
		}
	}()
	return out, nil
}

func (s *Session) WaitUntilConnected(ctx context.Context, timeout time.Duration) error {
	if s == nil || s.client == nil {
		return errors.New("companion: session is nil")
	}
	if timeout <= 0 {
		timeout = 45 * time.Second
	}
	if ctx == nil {
		ctx = context.Background()
	}
	waitCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	if s.IsConnected() && s.IsLoggedIn() {
		return nil
	}
	connected := make(chan struct{})
	var once sync.Once
	handlerID := s.client.AddEventHandler(func(evt any) {
		if _, ok := evt.(*events.Connected); ok {
			once.Do(func() { close(connected) })
		}
	})
	defer s.client.RemoveEventHandler(handlerID)
	if s.IsConnected() && s.IsLoggedIn() {
		return nil
	}
	select {
	case <-waitCtx.Done():
		if s.IsConnected() && s.IsLoggedIn() {
			return nil
		}
		return fmt.Errorf("companion: did not become connected after pairing: %w", waitCtx.Err())
	case <-connected:
		return nil
	}
}

func (s *Session) handleEvent(event any) bool {
	switch evt := event.(type) {
	case *events.Disconnected:
		s.note("disconnected")
	case *events.LoggedOut:
		s.note("logged_out on_connect=%v reason=%v", evt.OnConnect, evt.Reason)
	case *events.KeepAliveTimeout:
		s.note("keepalive_timeout")
	case *events.ConnectFailure:
		s.note("connect_failure reason=%v message=%s", evt.Reason, evt.Message)
	case *events.TemporaryBan:
		s.note("temporary_ban %v", evt)
	case *events.StreamReplaced:
		s.note("stream_replaced")
	case *events.OfflineSyncPreview:
		s.note("offline_sync_preview messages=%d", evt.Messages)
	case *events.OfflineSyncCompleted:
		s.note("offline_sync_completed count=%d", evt.Count)
	case *events.Message:
		return s.handleMessage(evt)
	}
	return true
}

func (s *Session) handleMessage(event *events.Message) bool {
	inbound, accept, err := normalizeInboundMessage(event)
	if err != nil {
		s.note(
			"inbound reject id=%s chat=%s err=%v",
			event.Info.ID,
			event.Info.Chat.String(),
			err,
		)
		return false
	}
	if !accept {
		if event.Info.IsFromMe {
			s.noteDroppedFromMe("text")
			return true
		}
		s.note(
			"inbound drop id=%s chat=%s from_me=%v group=%v",
			event.Info.ID,
			event.Info.Chat.String(),
			event.Info.IsFromMe,
			event.Info.IsGroup,
		)
		return true
	}
	s.applyLIDMap(&inbound.SenderAltJID, &inbound.ChatJID, inbound.SenderJID, inbound.IsGroup)
	if s.ingress == "" {
		s.note("inbound skip id=%s ingress_url_empty", inbound.MessageID)
		return true
	}
	if err := s.postInbound(inbound); err != nil {
		s.note("inbound post fail id=%s err=%v", inbound.MessageID, err)
		return false
	}
	s.note(
		"inbound posted id=%s chat=%s body_len=%d",
		inbound.MessageID,
		inbound.ChatJID,
		len(inbound.Body),
	)
	return true
}

func (s *Session) note(format string, args ...any) {
	if s == nil || s.dropLog == nil {
		return
	}
	_, _ = fmt.Fprintf(s.dropLog, "companion: "+format+"\n", args...)
}

func (s *Session) noteDroppedFromMe(kind string) {
	if s == nil || s.dropLog == nil {
		return
	}
	_, _ = fmt.Fprintf(s.dropLog, "dropped from_me %s (production; dedicated bot number required)\n", kind)
}

func (s *Session) postInbound(inbound Inbound) error {
	body, err := json.Marshal(inbound)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(s.ctx, http.MethodPost, s.ingress, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("content-type", "application/json")
	resp, err := s.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("companion: ingress HTTP %d", resp.StatusCode)
	}
	return nil
}

func (s *Session) Send(ctx context.Context, dest string, wireShape WireShape) (string, error) {
	to, err := parseOutboundChatJID(dest)
	if err != nil {
		return "", err
	}
	if s == nil || s.client == nil {
		return "", errors.New("companion: session is nil")
	}
	if !s.client.IsLoggedIn() {
		return "", ErrNotLoggedIn
	}
	msg, err := buildWireMessage(wireShape)
	if err != nil {
		return "", err
	}
	resp, err := s.client.SendMessage(ctx, to, msg)
	if err != nil {
		return "", fmt.Errorf("companion: send: %w", err)
	}
	return string(resp.ID), nil
}

func (s *Session) Close() error {
	if s == nil {
		return nil
	}
	s.closeOnce.Do(func() {
		if s.client != nil {
			if s.handlerID != 0 {
				s.client.RemoveEventHandler(s.handlerID)
			}
			s.client.Disconnect()
		}
		if s.container != nil {
			s.closeErr = s.container.Close()
		}
	})
	return s.closeErr
}

func strPtr(value string) *string {
	return proto.String(value)
}
