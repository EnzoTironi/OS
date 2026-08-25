package main

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	companion "github.com/EnzoTironi/OS/apps/whatsapp-companion"
	waLog "go.mau.fi/whatsmeow/util/log"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}
}

func run(args []string) error {
	command := "serve"
	if len(args) > 0 {
		command = args[0]
	}
	cfg := configFromEnv()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	session, err := companion.Open(ctx, cfg)
	if err != nil {
		return err
	}
	defer session.Close()

	switch command {
	case "serve":
		return serve(ctx, cfg, session)
	case "pair":
		return pair(ctx, cfg, session)
	default:
		return fmt.Errorf("unknown command %q (serve|pair)", command)
	}
}

func configFromEnv() companion.Config {
	listen := strings.TrimSpace(os.Getenv("ZOEN_WHATSAPP_LISTEN_ADDR"))
	if listen == "" {
		listen = "127.0.0.1:8081"
	}
	return companion.Config{
		DatabaseURL:          strings.TrimSpace(os.Getenv("ZOEN_WHATSAPP_DATABASE_URL")),
		AuthorityDatabaseURL: firstNonEmpty(os.Getenv("ZOEN_DATABASE_URL"), os.Getenv("DATABASE_URL")),
		IngressURL:           strings.TrimSpace(os.Getenv("ZOEN_WHATSAPP_INGRESS_URL")),
		IngressSecret:        strings.TrimSpace(os.Getenv("ZOEN_WHATSAPP_INGRESS_SECRET")),
		ListenAddr:           listen,
		QRFile:               strings.TrimSpace(os.Getenv("ZOEN_WHATSAPP_QR_FILE")),
		DropLog:              os.Stderr,
		Log:                  waLog.Stdout("companion", "INFO", false),
	}
}

func serve(ctx context.Context, cfg companion.Config, session *companion.Session) error {
	if session.IsPaired() {
		if err := session.Connect(); err != nil {
			return err
		}
	}
	server := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           session.Handler(),
		BaseContext:       func(net.Listener) context.Context { return ctx },
		ReadHeaderTimeout: 5 * time.Second,
	}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()
	err := server.ListenAndServe()
	if err == http.ErrServerClosed {
		return nil
	}
	return err
}

func pair(ctx context.Context, cfg companion.Config, session *companion.Session) error {
	// Keep QR ctx until Disconnect. Canceling it on a QR event drops stream 515 reconnect.
	qrCtx, qrCancel := context.WithCancel(context.Background())
	defer qrCancel()
	events, err := session.BeginPairing(qrCtx)
	if err != nil {
		return err
	}
	fmt.Fprintln(os.Stderr, "scan the QR on the WhatsApp Business app (Aparelhos conectados). code is not logged.")
	for event := range events {
		switch event.Kind {
		case "code":
			if err := writeQRFile(cfg.QRFile, event.Code); err != nil {
				return err
			}
		case "success":
			if err := session.WaitUntilConnected(ctx, 45*time.Second); err != nil {
				qrCancel()
				return err
			}
			fmt.Fprintln(os.Stderr, "paired; holding process for stream 515 reconnect")
			<-ctx.Done()
			qrCancel()
			return nil
		case "timeout":
			return fmt.Errorf("companion: pairing timed out")
		case "error":
			if event.Err != nil {
				return event.Err
			}
			return fmt.Errorf("companion: pairing error")
		}
		select {
		case <-ctx.Done():
			qrCancel()
			return ctx.Err()
		default:
		}
	}
	return nil
}

func writeQRFile(path, code string) error {
	if strings.TrimSpace(path) == "" || code == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(code), 0o600)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
