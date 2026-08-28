import type { Google } from "./config.ts";

function page(body: string): string {
  return `<!doctype html><html lang="pt"><meta charset="utf-8"><title>Zoen</title><body>${body}</body></html>`;
}

export function onboardStart(google: Google): string {
  if (google.kind === "unset") {
    return page("<p>Google is not planted.</p>");
  }
  return page(
    "<p>Confirmar este WhatsApp e continuar.</p>" +
      '<form method="post" action="/api/auth/sign-in/social">' +
      '<input type="hidden" name="provider" value="google">' +
      '<input type="hidden" name="callbackURL" value="/onboard/done">' +
      '<button type="submit">Continuar</button>' +
      "</form>",
  );
}

export function onboardDone(): string {
  return page("<p>Volta pro Zap.</p>");
}

export function devicePage(): string {
  return page(
    "<p>Digite o código do aparelho.</p>" +
      '<form method="get" action="/device">' +
      '<input name="user_code" autocomplete="off">' +
      '<button type="submit">Continuar</button>' +
      "</form>",
  );
}
