// WeChat Open Platform (website application) sign-in.
//
// Supabase GoTrue has no WeChat provider, so the browser is sent to
// open.weixin.qq.com and the callback trades the code for an openid here.
// A WeChat identity is represented by a confirmed Supabase user with a
// stable synthetic email; the session is then minted through a one-shot
// magic-link token that never leaves this server.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Db } from "../../lib/supabase";

const WECHAT_AUTHORIZE_URL = "https://open.weixin.qq.com/connect/qrconnect";
const WECHAT_TOKEN_URL = "https://api.weixin.qq.com/sns/oauth2/access_token";
const WECHAT_USERINFO_URL = "https://api.weixin.qq.com/sns/userinfo";
const STATE_TTL_MS = 10 * 60 * 1000;
const WECHAT_TIMEOUT_MS = 10_000;

export interface WechatConfiguration {
  appId: string;
  appSecret: string;
  redirectUri: string;
  enabled: boolean;
}

/** Read WeChat settings; enabled only when all three values are present. */
export function wechatConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): WechatConfiguration {
  const appId = env.WECHAT_APP_ID?.trim() ?? "";
  const appSecret = env.WECHAT_APP_SECRET?.trim() ?? "";
  const frontend = env.FRONTEND_URL?.trim().replace(/\/+$/, "") ?? "";
  const redirectUri =
    env.WECHAT_REDIRECT_URI?.trim() ||
    (frontend ? `${frontend}/api/auth/wechat/callback` : "");
  return {
    appId,
    appSecret,
    redirectUri,
    enabled: Boolean(appId && appSecret && redirectUri),
  };
}

function stateSecret(env: NodeJS.ProcessEnv): string {
  const secret =
    env.WECHAT_STATE_SECRET?.trim() ||
    env.DOWNLOAD_SIGNING_SECRET?.trim() ||
    env.USER_API_KEYS_ENCRYPTION_SECRET?.trim();
  if (!secret) {
    throw new Error("WECHAT_STATE_SECRET (or another server secret) is required");
  }
  return secret;
}

function stateSignature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Signed `next` + timestamp; the callback may only return to a safe path. */
export function createWechatState(
  next: string,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): string {
  const payload = Buffer.from(
    JSON.stringify({ next, ts: now, nonce: randomBytes(12).toString("base64url") }),
  ).toString("base64url");
  return `${payload}.${stateSignature(payload, stateSecret(env))}`;
}

/** Returns the validated same-site `next` path. */
export function verifyWechatState(
  state: string,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): string {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) throw new Error("Malformed WeChat state");
  const expected = stateSignature(payload, stateSecret(env));
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    throw new Error("Invalid WeChat state");
  }
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    next?: unknown;
    ts?: unknown;
  };
  if (typeof parsed.next !== "string" || !parsed.next.startsWith("/")) {
    throw new Error("Invalid WeChat redirect target");
  }
  if (parsed.next.startsWith("//") || parsed.next.includes("\\")) {
    throw new Error("Invalid WeChat redirect target");
  }
  if (
    typeof parsed.ts !== "number" ||
    parsed.ts > now + 60_000 ||
    now - parsed.ts > STATE_TTL_MS
  ) {
    throw new Error("Expired WeChat state");
  }
  return parsed.next;
}

export function buildWechatAuthorizationUrl(
  next: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const config = wechatConfiguration(env);
  if (!config.enabled) throw new Error("WeChat sign-in is not configured");
  const params = new URLSearchParams({
    appid: config.appId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "snsapi_login",
    state: createWechatState(next, env),
  });
  return `${WECHAT_AUTHORIZE_URL}?${params.toString()}#wechat_redirect`;
}

interface WechatTokenResponse {
  access_token?: string;
  openid?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

interface WechatUserInfoResponse {
  openid?: string;
  unionid?: string;
  nickname?: string;
  headimgurl?: string;
  errcode?: number;
  errmsg?: string;
}

export interface WechatProfile {
  openid: string;
  unionid: string | null;
  nickname: string | null;
  avatarUrl: string | null;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`WeChat returned HTTP ${response.status}`);
  return (await response.json()) as T;
}

/** Trade an OAuth code for the WeChat profile. */
export async function exchangeWechatCode(
  code: string,
  config: WechatConfiguration,
  fetchImpl: typeof fetch = fetch,
): Promise<WechatProfile> {
  const tokenParams = new URLSearchParams({
    appid: config.appId,
    secret: config.appSecret,
    code,
    grant_type: "authorization_code",
  });
  const token = await readJson<WechatTokenResponse>(
    await fetchImpl(`${WECHAT_TOKEN_URL}?${tokenParams.toString()}`, {
      signal: AbortSignal.timeout(WECHAT_TIMEOUT_MS),
    }),
  );
  if (token.errcode || !token.access_token || !token.openid) {
    throw new Error(`WeChat token exchange failed: ${token.errcode ?? "missing openid"}`);
  }
  let nickname: string | null = null;
  let avatarUrl: string | null = null;
  try {
    const infoParams = new URLSearchParams({
      access_token: token.access_token,
      openid: token.openid,
      lang: "zh_CN",
    });
    const info = await readJson<WechatUserInfoResponse>(
      await fetchImpl(`${WECHAT_USERINFO_URL}?${infoParams.toString()}`, {
        signal: AbortSignal.timeout(WECHAT_TIMEOUT_MS),
      }),
    );
    if (!info.errcode) {
      nickname = info.nickname?.trim() || null;
      avatarUrl = info.headimgurl?.trim() || null;
    }
  } catch {
    // The openid is enough to sign in; profile details are optional.
  }
  return {
    openid: token.openid,
    unionid: token.unionid?.trim() || null,
    nickname,
    avatarUrl,
  };
}

function syntheticEmail(openid: string): string {
  return `wechat-${openid.toLowerCase()}@users.linkmai.com`;
}

async function magicLinkToken(db: Db, email: string): Promise<string> {
  const { data, error } = await db.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const token = data?.properties?.hashed_token;
  if (error || !token) {
    throw new Error("Unable to mint a WeChat session", { cause: error });
  }
  return token;
}

/**
 * Find or create the Supabase user for a WeChat openid, then establish the
 * request's cookie session. The synthetic email is internal and never shown
 * as a contact address.
 */
export async function signInWechatUser(
  db: Db,
  client: SupabaseClient,
  profile: WechatProfile,
): Promise<User> {
  const email = syntheticEmail(profile.openid);
  let token: string;
  try {
    token = await magicLinkToken(db, email);
  } catch {
    const { error } = await db.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        wechat_openid: profile.openid,
        wechat_unionid: profile.unionid,
        wechat_nickname: profile.nickname,
        wechat_avatar_url: profile.avatarUrl,
        display_name: profile.nickname,
      },
    });
    if (error && !/already|exists|registered/i.test(error.message)) {
      throw new Error("Unable to create the WeChat user", { cause: error });
    }
    token = await magicLinkToken(db, email);
  }

  const { data, error } = await client.auth.verifyOtp({
    token_hash: token,
    type: "magiclink",
  });
  if (error || !data.user || !data.session) {
    throw new Error("Unable to complete WeChat sign-in", { cause: error });
  }
  return data.user;
}
