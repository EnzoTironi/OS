import { WorkOS } from "@workos-inc/node";
import { readAuthEnv, type AuthEnv } from "./env.js";

/**
 * Hosted AuthKit UI. Keep this provider so Google and Apple buttons come from
 * dashboard Authentication → OAuth providers, not a second OAuth stack.
 * Do not pass GoogleOAuth or AppleOAuth here.
 */
const AUTHKIT_PROVIDER = "authkit" as const;

export type AuthUser = {
  readonly email: string;
  readonly emailVerified: boolean;
  readonly firstName: string | null;
  readonly id: string;
  readonly lastName: string | null;
};

export type CallbackResult = {
  readonly sealedSession: string;
  readonly user: AuthUser;
};

export type LogoutResult = {
  readonly logoutUrl: string | null;
};

type WorkOsUserLike = {
  readonly email?: string;
  readonly emailVerified?: boolean;
  readonly firstName?: string | null;
  readonly id?: string;
  readonly lastName?: string | null;
};

type SealedSession = {
  authenticate(): Promise<
    | { authenticated: true; user: WorkOsUserLike }
    | { authenticated: false; reason?: string }
  >;
  getLogoutUrl(): Promise<string>;
};

export type AuthKitPort = {
  authenticateWithCode(input: {
    clientId: string;
    code: string;
    session: { cookiePassword: string; sealSession: true };
  }): Promise<{ sealedSession?: string; user: WorkOsUserLike }>;
  getAuthorizationUrl(input: {
    clientId: string;
    provider: typeof AUTHKIT_PROVIDER;
    redirectUri: string;
    state?: string;
  }): string;
  loadSealedSession(input: {
    cookiePassword: string;
    sessionData: string;
  }): SealedSession;
};

export type CreateAuthOptions = {
  readonly env?: NodeJS.ProcessEnv;
  readonly kit?: AuthKitPort;
};

export type Auth = {
  currentUser(sessionCookie?: string): Promise<AuthUser | null>;
  handleCallback(code: string): Promise<CallbackResult>;
  loginUrl(state?: string): string;
  logout(sessionCookie?: string): Promise<LogoutResult>;
};

function workosPort(env: AuthEnv): AuthKitPort {
  const workos = new WorkOS(env.apiKey, { clientId: env.clientId });
  return {
    authenticateWithCode(input) {
      return workos.userManagement.authenticateWithCode(input);
    },
    getAuthorizationUrl(input) {
      return workos.userManagement.getAuthorizationUrl(input);
    },
    loadSealedSession(input) {
      return workos.userManagement.loadSealedSession(input);
    },
  };
}

function textOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toAuthUser(user: WorkOsUserLike): AuthUser {
  const id = user.id?.trim();
  const email = user.email?.trim();
  if (!id || !email) {
    throw new Error("WorkOS user missing id or email");
  }
  return {
    email,
    emailVerified: user.emailVerified === true,
    firstName: textOrNull(user.firstName),
    id,
    lastName: textOrNull(user.lastName),
  };
}

function sessionOrNull(
  kit: AuthKitPort,
  env: AuthEnv,
  sessionCookie: string | undefined,
): SealedSession | null {
  if (sessionCookie === undefined || sessionCookie.length === 0) {
    return null;
  }
  return kit.loadSealedSession({
    cookiePassword: env.cookiePassword,
    sessionData: sessionCookie,
  });
}

/**
 * AuthKit door. Callers pass env/kit only in tests.
 */
export function createAuth(options: CreateAuthOptions = {}): Auth {
  const envOf = () => readAuthEnv(options.env ?? process.env);
  const kitOf = (env: AuthEnv) => options.kit ?? workosPort(env);

  return {
    loginUrl(state) {
      const env = envOf();
      const trimmed = state?.trim();
      return kitOf(env).getAuthorizationUrl({
        clientId: env.clientId,
        provider: AUTHKIT_PROVIDER,
        redirectUri: env.redirectUri,
        ...(trimmed === undefined || trimmed.length === 0
          ? {}
          : { state: trimmed }),
      });
    },

    async handleCallback(code) {
      const trimmed = code.trim();
      if (trimmed.length === 0) {
        throw new Error("authorization code is required");
      }
      const env = envOf();
      const authenticated = await kitOf(env).authenticateWithCode({
        clientId: env.clientId,
        code: trimmed,
        session: {
          cookiePassword: env.cookiePassword,
          sealSession: true,
        },
      });
      if (
        authenticated.sealedSession === undefined ||
        authenticated.sealedSession.length === 0
      ) {
        throw new Error("sealed session missing");
      }
      return {
        sealedSession: authenticated.sealedSession,
        user: toAuthUser(authenticated.user),
      };
    },

    async logout(sessionCookie) {
      const env = envOf();
      const session = sessionOrNull(kitOf(env), env, sessionCookie);
      if (session === null) {
        return { logoutUrl: null };
      }
      try {
        return { logoutUrl: await session.getLogoutUrl() };
      } catch {
        return { logoutUrl: null };
      }
    },

    async currentUser(sessionCookie) {
      const env = envOf();
      const session = sessionOrNull(kitOf(env), env, sessionCookie);
      if (session === null) {
        return null;
      }
      try {
        const result = await session.authenticate();
        return result.authenticated ? toAuthUser(result.user) : null;
      } catch {
        return null;
      }
    },
  };
}
