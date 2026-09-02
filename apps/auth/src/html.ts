import type { Google } from "./config.ts";

function page(body: string): string {
  return `<!doctype html><html lang="pt"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Zoen</title><style>
body{font:16px/1.5 system-ui,sans-serif;max-width:24em;margin:2rem auto;padding:0 1rem}
label{display:block;margin:.75rem 0}
input{font:inherit;box-sizing:border-box;width:100%;padding:.5rem}
button{font:inherit;padding:.5rem .9rem}
[role="alert"]{color:#b00020}
</style><body>${body}</body></html>`;
}

const emailSignInScript = `<script>
async function signInEmail(event) {
  event.preventDefault();
  const form = event.target;
  const email = form.email.value;
  const password = form.password.value;
  let response;
  try {
    response = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, callbackURL: "/onboard/done" }),
      credentials: "include",
    });
  } catch {
    showSignInError("Não deu pra entrar agora. Tenta de novo.");
    return;
  }
  if (!response.ok) {
    showSignInError(
      response.status === 401
        ? "Email ou senha errados. Confere e tenta de novo."
        : "Não deu pra entrar agora. Tenta de novo.",
    );
    return;
  }
  location.assign("/onboard/done");
}
function showSignInError(message) {
  const error = document.getElementById("signin-error");
  error.textContent = message;
  error.hidden = false;
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
      '<p id="signin-error" role="alert" hidden></p>' +
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

const deviceScript = `<script>
const deviceParams = new URLSearchParams(location.search);
const deviceQueryCode = deviceParams.get("user_code");
let deviceCode = deviceQueryCode ?? "";
const deviceResult = () => document.getElementById("device-result");
const deviceSignIn = () => document.getElementById("device-signin");

async function deviceReadJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function deviceOutcome(response, body) {
  if (response.status === 401) {
    return "signin";
  }
  if (body.error === "expired_token") {
    return "expired";
  }
  if (body.error === "access_denied") {
    return "taken";
  }
  return "invalid";
}

function deviceShow(state) {
  deviceResult().textContent = {
    busy: "Confere o código…",
    done: "Pronto. O aparelho entrou. Pode voltar pro terminal.",
    expired: "O código expirou. Gera um novo no terminal.",
    invalid: "Código não reconhecido. Confere o código no terminal.",
    taken: "Esse código já foi usado ou cancelado. Gera um novo no terminal.",
    signin: "Entra pra confirmar o aparelho.",
  }[state] ?? "";
  deviceResult().hidden = false;
  deviceSignIn().hidden = state !== "signin";
  document.getElementById("device-continue").disabled = state === "busy";
}

async function deviceApprove(code) {
  deviceShow("busy");
  const verify = await fetch(
    "/api/auth/device?user_code=" + encodeURIComponent(code),
    { credentials: "include" },
  );
  const verifyBody = await deviceReadJson(verify);
  if (!verify.ok) {
    deviceShow(deviceOutcome(verify, verifyBody));
    return;
  }
  if (verifyBody.status === "approved") {
    deviceShow("done");
    return;
  }
  if (verifyBody.status === "denied") {
    deviceShow("taken");
    return;
  }
  const approve = await fetch("/api/auth/device/approve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userCode: code }),
    credentials: "include",
  });
  if (approve.ok) {
    deviceShow("done");
    return;
  }
  deviceShow(approve.status === 401 ? "signin" : "taken");
}

async function deviceSubmit(event) {
  event.preventDefault();
  const input = document.getElementById("user_code");
  deviceCode = input.value.trim();
  if (deviceCode.length === 0) {
    return;
  }
  await deviceApprove(deviceCode);
}

async function deviceSignInSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const response = await fetch("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: form.email.value,
      password: form.password.value,
      callbackURL: "/device?user_code=" + encodeURIComponent(deviceCode),
    }),
    credentials: "include",
  });
  if (!response.ok) {
    deviceResult().textContent =
      response.status === 401
        ? "Email ou senha errados. Confere e tenta de novo."
        : "Não deu pra entrar agora. Tenta de novo.";
    deviceResult().hidden = false;
    return;
  }
  await deviceApprove(deviceCode);
}

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("user_code");
  if (deviceQueryCode) {
    input.value = deviceQueryCode;
    deviceApprove(deviceQueryCode);
  }
});
</script>`;

export function devicePage(): string {
  return page(
    "<p>Digite o código do aparelho.</p>" +
      '<form id="device-form" onsubmit="deviceSubmit(event)">' +
      '<label>Código <input id="user_code" name="user_code" autocomplete="off" maxlength="16"></label>' +
      '<button id="device-continue" type="submit">Continuar</button>' +
      "</form>" +
      '<div id="device-signin" hidden>' +
      '<form onsubmit="deviceSignInSubmit(event)">' +
      '<label>Email <input name="email" type="email" autocomplete="username" required></label>' +
      '<label>Senha <input name="password" type="password" autocomplete="current-password" required></label>' +
      '<button type="submit">Entrar</button>' +
      "</form>" +
      "</div>" +
      '<p id="device-result" role="alert" hidden></p>' +
      deviceScript
  );
}
