import type { Google } from "./config.ts";

function page(body: string): string {
  return `<!doctype html><html lang="pt"><meta charset="utf-8"><title>Zoen</title><body>${body}</body></html>`;
}

const emailSignInScript = `<script>
async function signInEmail(event) {
  event.preventDefault();
  const form = event.target;
  const email = form.email.value;
  const password = form.password.value;
  const res = await fetch("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, callbackURL: "/onboard/done" }),
    credentials: "include",
  });
  if (!res.ok) {
    const text = await res.text();
    alert(text || ("entrar falhou: " + res.status));
    return;
  }
  location.assign("/onboard/done");
}
</script>`;

export function homePage(google: Google): string {
  const googleBlock =
    google.kind === "unset"
      ? ""
      : '<form method="post" action="/api/auth/sign-in/social">' +
        '<input type="hidden" name="provider" value="google">' +
        '<input type="hidden" name="callbackURL" value="/onboard/done">' +
        '<button type="submit">Continuar com Google</button>' +
        "</form>";
  return page(
    "<p><strong>Zoen</strong></p>" +
      "<p>O sistema operacional da empresa. Entra pra continuar.</p>" +
      '<form onsubmit="signInEmail(event)">' +
      '<label>Email <input name="email" type="email" autocomplete="username" required></label>' +
      '<label>Senha <input name="password" type="password" autocomplete="current-password" required></label>' +
      '<button type="submit">Entrar</button>' +
      "</form>" +
      googleBlock +
      '<p><a href="/device">Código do aparelho</a></p>' +
      emailSignInScript
  );
}

export function loginPage(google: Google): string {
  return homePage(google);
}

export function onboardStart(google: Google): string {
  if (google.kind === "unset") {
    return page("<p>Google is not planted.</p>");
  }
  return page(
    "<p>Confirmar sua conta e continuar.</p>" +
      '<form method="post" action="/api/auth/sign-in/social">' +
      '<input type="hidden" name="provider" value="google">' +
      '<input type="hidden" name="callbackURL" value="/onboard/done">' +
      '<button type="submit">Continuar</button>' +
      "</form>"
  );
}

export function onboardDone(): string {
  return page(
    "<p>Pronto. Volta pra conversa — WhatsApp, Telegram, ou o terminal.</p>"
  );
}

export function devicePage(): string {
  return page(
    "<p>Digite o código do aparelho.</p>" +
      '<form method="get" action="/device">' +
      '<input name="user_code" autocomplete="off">' +
      '<button type="submit">Continuar</button>' +
      "</form>"
  );
}
