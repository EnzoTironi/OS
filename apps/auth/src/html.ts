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
      body: JSON.stringify({ email, password, callbackURL: "/" }),
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
  location.assign("/");
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
        '<input type="hidden" name="callbackURL" value="/">' +
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

const deviceScript = `<script>
const deviceParams = new URLSearchParams(location.search);
const deviceQueryCode = deviceParams.get("user_code");
let deviceCode = deviceQueryCode ?? "";
const deviceResult = () => document.getElementById("device-result");
const deviceSignIn = () => document.getElementById("device-signin");
const deviceReview = () => document.getElementById("device-review");

async function deviceReadJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function deviceError(body) {
  if (body !== null && typeof body === "object" && typeof body.error === "string") {
    return body.error;
  }
  return "";
}

function deviceSessionAccount(body) {
  if (body === null || typeof body !== "object") {
    return null;
  }
  const user = body.user;
  if (user === null || typeof user !== "object") {
    return null;
  }
  if (typeof user.email === "string" && user.email.length > 0) {
    return user.email;
  }
  if (typeof user.name === "string" && user.name.length > 0) {
    return user.name;
  }
  return null;
}

function deviceSetMessage(message) {
  deviceResult().textContent = message;
  deviceResult().hidden = false;
}

function deviceSetBusy(busy) {
  document.getElementById("device-continue").disabled = busy;
  document.getElementById("device-approve").disabled = busy;
  document.getElementById("device-deny").disabled = busy;
  const google = document.getElementById("device-google");
  if (google !== null) {
    google.disabled = busy;
  }
}

function deviceHidePanels() {
  deviceSignIn().hidden = true;
  deviceReview().hidden = true;
}

function deviceShowFailure(response, body) {
  const error = deviceError(body);
  if (response.status === 401 || error === "unauthorized") {
    deviceShowSignIn();
  } else if (error === "expired_token") {
    deviceSetMessage("O código expirou. Gera um novo no terminal.");
  } else if (error === "access_denied") {
    deviceSetMessage("Essa conta não pode decidir sobre este código.");
  } else if (error === "device_code_already_processed") {
    deviceSetMessage("Esse código já foi usado ou cancelado. Gera um novo no terminal.");
  } else {
    deviceSetMessage("Código não reconhecido. Confere o código no terminal.");
  }
}

function deviceShowSignIn() {
  deviceHidePanels();
  deviceSignIn().hidden = false;
  deviceSetMessage("Entra pra revisar o acesso deste aparelho.");
}

function deviceCallbackURL() {
  return "/device?user_code=" + encodeURIComponent(deviceCode);
}

async function deviceLoadReview(code) {
  deviceCode = code.trim();
  if (deviceCode.length === 0) {
    return;
  }

  document.getElementById("user_code").value = deviceCode;
  deviceHidePanels();
  deviceSetBusy(true);
  deviceSetMessage("Conferindo o código…");

  try {
    const sessionResponse = await fetch("/api/auth/get-session", {
      cache: "no-store",
      credentials: "include",
    });
    const sessionBody = await deviceReadJson(sessionResponse);
    const verifyResponse = await fetch(
      "/api/auth/device?user_code=" + encodeURIComponent(deviceCode),
      { cache: "no-store", credentials: "include" },
    );
    const verifyBody = await deviceReadJson(verifyResponse);

    if (!verifyResponse.ok) {
      deviceShowFailure(verifyResponse, verifyBody);
      return;
    }
    if (!sessionResponse.ok && sessionResponse.status !== 401) {
      deviceSetMessage("Não deu pra conferir sua conta agora. Tenta de novo.");
      return;
    }
    if (verifyBody === null || typeof verifyBody !== "object") {
      deviceSetMessage("Não deu pra conferir o código agora. Tenta de novo.");
      return;
    }
    if (verifyBody.status === "approved") {
      deviceSetMessage("Pronto. O aparelho entrou. Pode voltar pro terminal.");
      return;
    }
    if (verifyBody.status === "denied") {
      deviceSetMessage("A entrada deste aparelho foi negada.");
      return;
    }
    if (verifyBody.status !== "pending") {
      deviceSetMessage("Código não reconhecido. Confere o código no terminal.");
      return;
    }

    const account = sessionResponse.ok ? deviceSessionAccount(sessionBody) : null;
    if (account === null) {
      deviceShowSignIn();
      return;
    }

    if (typeof verifyBody.client_id !== "string" || verifyBody.client_id.length === 0) {
      deviceSetMessage("Esse código está ligado a outra conta.");
      return;
    }

    document.getElementById("device-code").textContent = deviceCode;
    document.getElementById("device-client").textContent = verifyBody.client_id;
    document.getElementById("device-account").textContent = account;
    deviceReview().hidden = false;
    deviceSetMessage("Confere os dados e escolhe aprovar ou negar.");
  } catch {
    deviceSetMessage("Não deu pra conferir o código agora. Tenta de novo.");
  } finally {
    deviceSetBusy(false);
  }
}

async function deviceSubmit(event) {
  event.preventDefault();
  const input = document.getElementById("user_code");
  await deviceLoadReview(input.value);
}

async function deviceSignInSubmit(event) {
  event.preventDefault();
  const form = event.target;
  deviceSetBusy(true);
  try {
    const response = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: form.email.value,
        password: form.password.value,
        callbackURL: deviceCallbackURL(),
      }),
      credentials: "include",
    });
    if (!response.ok) {
      deviceSetMessage(
        response.status === 401
          ? "Email ou senha errados. Confere e tenta de novo."
          : "Não deu pra entrar agora. Tenta de novo.",
      );
      return;
    }
    await deviceLoadReview(deviceCode);
  } catch {
    deviceSetMessage("Não deu pra entrar agora. Tenta de novo.");
  } finally {
    deviceSetBusy(false);
  }
}

async function deviceGoogleSignIn(event) {
  event.preventDefault();
  deviceSetBusy(true);
  try {
    const callbackURL = deviceCallbackURL();
    const response = await fetch("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "google",
        callbackURL,
        errorCallbackURL: callbackURL,
        disableRedirect: true,
      }),
      credentials: "include",
    });
    const body = await deviceReadJson(response);
    if (
      !response.ok ||
      body === null ||
      typeof body !== "object" ||
      typeof body.url !== "string" ||
      body.url.length === 0
    ) {
      deviceSetMessage("Não deu pra entrar com Google agora. Tenta de novo.");
      return;
    }
    location.assign(body.url);
  } catch {
    deviceSetMessage("Não deu pra entrar com Google agora. Tenta de novo.");
  } finally {
    deviceSetBusy(false);
  }
}

async function deviceDecide(endpoint, successMessage) {
  deviceSetBusy(true);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userCode: deviceCode }),
      credentials: "include",
    });
    const body = await deviceReadJson(response);
    if (
      !response.ok ||
      body === null ||
      typeof body !== "object" ||
      body.success !== true
    ) {
      deviceHidePanels();
      deviceShowFailure(response, body);
      return;
    }
    deviceHidePanels();
    deviceSetMessage(successMessage);
  } catch {
    deviceSetMessage("Não deu pra registrar sua escolha agora. Tenta de novo.");
  } finally {
    deviceSetBusy(false);
  }
}

async function deviceApprove() {
  await deviceDecide(
    "/api/auth/device/approve",
    "Pronto. O aparelho entrou. Pode voltar pro terminal.",
  );
}

async function deviceDeny() {
  await deviceDecide(
    "/api/auth/device/deny",
    "A entrada deste aparelho foi negada.",
  );
}

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("user_code");
  if (deviceQueryCode) {
    input.value = deviceQueryCode;
    deviceLoadReview(deviceQueryCode);
  }
});
</script>`;

export function devicePage(google: Google): string {
  const googleBlock =
    google.kind === "unset"
      ? ""
      : '<button id="device-google" type="button" onclick="deviceGoogleSignIn(event)">Continuar com Google</button>';
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
      googleBlock +
      "</div>" +
      '<section id="device-review" hidden>' +
      "<p>Este aparelho quer entrar:</p>" +
      '<dl><dt>Código</dt><dd id="device-code"></dd>' +
      '<dt>Cliente</dt><dd id="device-client"></dd>' +
      '<dt>Conta</dt><dd id="device-account"></dd></dl>' +
      '<button id="device-approve" type="button" onclick="deviceApprove()">Aprovar</button>' +
      '<button id="device-deny" type="button" onclick="deviceDeny()">Negar</button>' +
      "</section>" +
      '<p id="device-result" role="alert" hidden></p>' +
      deviceScript
  );
}
