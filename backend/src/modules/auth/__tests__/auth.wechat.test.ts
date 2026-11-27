import { describe, expect, it } from "vitest";
import {
    buildWechatAuthorizationUrl,
    createWechatState,
    verifyWechatState,
    wechatConfiguration,
} from "../auth.wechat";

const env = {
    WECHAT_APP_ID: "wx123",
    WECHAT_APP_SECRET: "secret",
    WECHAT_REDIRECT_URI: "https://linkmai.com/api/auth/wechat/callback",
    WECHAT_STATE_SECRET: "state-secret",
};

describe("wechatConfiguration", () => {
    it("is enabled only when the app id, secret, and callback are present", () => {
        expect(wechatConfiguration(env).enabled).toBe(true);
        expect(wechatConfiguration({ ...env, WECHAT_APP_SECRET: "" }).enabled).toBe(false);
    });
});

describe("WeChat state", () => {
    it("round-trips a same-site next path", () => {
        const state = createWechatState("/onboarding/profile", env);
        expect(verifyWechatState(state, env)).toBe("/onboarding/profile");
    });

    it("rejects a tampered state", () => {
        const state = createWechatState("/onboarding/profile", env);
        expect(() => verifyWechatState(`${state}x`, env)).toThrow();
    });

    it("rejects an expired state", () => {
        const state = createWechatState("/onboarding/profile", env, 1_000);
        expect(() => verifyWechatState(state, env, 1_000 + 10 * 60 * 1000 + 1)).toThrow(
            "Expired WeChat state",
        );
    });

    it("rejects a protocol-relative next path", () => {
        const state = createWechatState("//evil.example", env);
        expect(() => verifyWechatState(state, env)).toThrow(
            "Invalid WeChat redirect target",
        );
    });

    it("builds the QR authorization URL with snsapi_login", () => {
        const url = new URL(buildWechatAuthorizationUrl("/assistant", env));
        expect(url.origin).toBe("https://open.weixin.qq.com");
        expect(url.searchParams.get("appid")).toBe("wx123");
        expect(url.searchParams.get("scope")).toBe("snsapi_login");
        expect(url.searchParams.get("redirect_uri")).toBe(env.WECHAT_REDIRECT_URI);
    });
});
