import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const getSignInOptions = vi.fn();
vi.mock("@/app/lib/authApi", () => ({
    getSignInOptions: () => getSignInOptions(),
}));

import { SignInProviderHintProvider } from "@/app/contexts/SignInProviderHintContext";
import type { SignInProviderHint } from "@/app/lib/signInProviderHint";
import { DEFAULT_SIGN_IN_OPTIONS, useSignInOptions } from "./useSignInOptions";

function withHint(hint: SignInProviderHint) {
    return function HintWrapper({ children }: { children: ReactNode }) {
        return <SignInProviderHintProvider hint={hint}>{children}</SignInProviderHintProvider>;
    };
}

afterEach(() => {
    getSignInOptions.mockReset();
});

describe("useSignInOptions", () => {
    it("starts unloaded with the defaults, then reports the deployment's options", async () => {
        getSignInOptions.mockResolvedValue({ google: false, sso: false, phone: false, wechat: false, invite: true, setupRequired: true, signup: false });
        const { result } = renderHook(() => useSignInOptions());
        expect(result.current).toEqual({
            options: DEFAULT_SIGN_IN_OPTIONS,
            loaded: false,
            providersKnown: false,
        });
        await waitFor(() => expect(result.current.loaded).toBe(true));
        expect(result.current.options).toEqual({ google: false, sso: false, phone: false, wechat: false, invite: true, setupRequired: true, signup: false });
        expect(result.current.providersKnown).toBe(true);
    });

    it("knows the providers from the first render when the server sent a hint", async () => {
        let answer!: (options: unknown) => void;
        getSignInOptions.mockReturnValue(new Promise((resolve) => (answer = resolve)));
        const { result } = renderHook(() => useSignInOptions(), {
            wrapper: withHint({ google: true, sso: false, phone: false, wechat: false, invite: true }),
        });
        // Providers only: setup and sign-up still wait for the real answer.
        expect(result.current).toEqual({
            options: { ...DEFAULT_SIGN_IN_OPTIONS, google: true, sso: false, phone: false, wechat: false, invite: true },
            loaded: false,
            providersKnown: true,
        });

        // The deployment's own answer still wins over the hint.
        answer({ google: false, sso: true, phone: true, wechat: false, invite: true, setupRequired: false, signup: true });
        await waitFor(() => expect(result.current.loaded).toBe(true));
        expect(result.current.options).toEqual({ google: false, sso: true, phone: true, wechat: false, invite: true, setupRequired: false, signup: true });
    });

    it("keeps every provider visible when the options cannot be read", async () => {
        getSignInOptions.mockRejectedValue(new Error("offline"));
        const { result } = renderHook(() => useSignInOptions());
        await waitFor(() => expect(result.current.loaded).toBe(true));
        expect(result.current.options).toEqual(DEFAULT_SIGN_IN_OPTIONS);
    });
});
