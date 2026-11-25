import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    hasApiKeyForModel,
    normalizeOptionalModelPreference,
    resolveDeploymentDefaultModel,
    resolveDeploymentDefaults,
    resolveEffectiveChatModel,
    resolveEffectiveReasoningLevel,
    subagentModelFor,
    titleModelForChat,
} from "../modelSelection";
import { resetModelRegistryCache } from "../llm/registry";
import type { Db } from "../supabase";

const routerModels = {
    openrouter: ["anthropic/claude-sonnet-4.5"],
    vercel: [],
    "opencode-go": ["glm-5"],
    bedrock: [],
    azure: [],
    "azure-foundry": [],
    vertex: [],
    xai: [],
    custom: [],
};

describe("titleModelForChat", () => {
    it.each([
        ["claude-fable-5-1", "claude-haiku-4-5"],
        ["gemini-3.8-flash", "gemini-3.5-flash-lite"],
        ["gpt-6-astra", "gpt-6-luna"],
        ["mistral-large-4", "mistral-small-2603"],
    ])(
        "uses the cheapest model from the %s provider",
        (chatModel, expected) => {
            expect(titleModelForChat(chatModel)).toBe(expected);
        },
    );

    it.each([
        "openrouter/anthropic/claude-sonnet-4.5",
        "vercel/openai/gpt-5.4",
        "opencode-go/glm-5",
        "bedrock/us.anthropic.claude-opus-5-5",
        "azure/gpt-6.1-sol",
        "azure-foundry/mistral-large-4",
        "vertex/gemini-3.1-pro-preview",
        "xai/grok-4.3",
        "custom/my-model",
        "ollama/llama3.2",
    ])("reuses dynamic model %s", (chatModel) => {
        expect(titleModelForChat(chatModel)).toBe(chatModel);
    });

    it("honors the saved title override", () => {
        expect(titleModelForChat("gpt-6-astra", "claude-haiku-4-5")).toBe(
            "claude-haiku-4-5",
        );
    });
});

describe("subagentModelFor", () => {
    it.each([
        ["claude-opus-5-5", "light", "claude-haiku-4-5"],
        ["claude-opus-5-5", "standard", "claude-sonnet-5-5"],
        ["claude-opus-5-5", "same", "claude-opus-5-5"],
        ["claude-haiku-4-5", "standard", "claude-haiku-4-5"],
        ["openrouter/anthropic/claude-sonnet-4.5", "light", "openrouter/anthropic/claude-sonnet-4.5"],
    ] as const)("runs a %s chat's %s subagent on %s, never above the chat model", (chatModel, tier, expected) => {
        expect(subagentModelFor(chatModel, tier)).toBe(expected);
    });
});

describe("hasApiKeyForModel for cloud platforms", () => {
    it("requires the region or endpoint saved with the key", () => {
        expect(
            hasApiKeyForModel("bedrock/anthropic.claude-opus-5-5", {
                bedrock: "k",
            }),
        ).toBe(false);
        expect(
            hasApiKeyForModel("bedrock/anthropic.claude-opus-5-5", {
                bedrock: "k",
                providerSettings: { bedrock: { region: "us-east-1" } },
            }),
        ).toBe(true);
        expect(hasApiKeyForModel("azure/gpt-6.1-sol", { azure: "k" })).toBe(
            false,
        );
        expect(
            hasApiKeyForModel("azure/gpt-6.1-sol", {
                azure: "k",
                providerSettings: { azure: { endpoint: "contoso-openai" } },
            }),
        ).toBe(true);
    });
});

describe("hasApiKeyForModel for Vertex, Foundry, xAI and custom endpoints", () => {
    const serviceAccount = JSON.stringify({
        type: "service_account",
        project_id: "legal-prod",
        private_key: "-----BEGIN PRIVATE KEY-----",
        client_email: "linkmai@legal-prod.iam.gserviceaccount.com",
    });

    it("requires the setting saved with each key", () => {
        expect(
            hasApiKeyForModel("vertex/gemini-3.8-flash", {
                vertex: serviceAccount,
            }),
        ).toBe(false);
        expect(
            hasApiKeyForModel("vertex/gemini-3.8-flash", {
                vertex: serviceAccount,
                providerSettings: { vertex: { location: "us-central1" } },
            }),
        ).toBe(true);
        // A stored value that is not a key file is unusable, not "configured".
        expect(
            hasApiKeyForModel("vertex/gemini-3.8-flash", {
                vertex: "AIzaSy-plain-key",
                providerSettings: { vertex: { location: "us-central1" } },
            }),
        ).toBe(false);
        expect(
            hasApiKeyForModel("azure-foundry/mistral-large-4", {
                "azure-foundry": "k",
            }),
        ).toBe(false);
        expect(
            hasApiKeyForModel("azure-foundry/mistral-large-4", {
                "azure-foundry": "k",
                providerSettings: {
                    "azure-foundry": { endpoint: "contoso-foundry" },
                },
            }),
        ).toBe(true);
        expect(hasApiKeyForModel("custom/my-model", { custom: "k" })).toBe(
            false,
        );
        expect(
            hasApiKeyForModel("custom/my-model", {
                custom: "k",
                providerSettings: {
                    custom: { baseUrl: "https://llm.example.com/v1" },
                },
            }),
        ).toBe(true);
    });

    it("needs only the key for xAI", () => {
        expect(hasApiKeyForModel("xai/grok-4.3", {})).toBe(false);
        expect(hasApiKeyForModel("xai/grok-4.3", { xai: "k" })).toBe(true);
    });
});

describe("normalizeOptionalModelPreference", () => {
    it("returns null instead of inventing a default", () => {
        expect(normalizeOptionalModelPreference(null, routerModels)).toBeNull();
        expect(
            normalizeOptionalModelPreference("not-a-model", routerModels),
        ).toBeNull();
    });

    it("rejects a router model outside the saved allowlist", () => {
        expect(
            normalizeOptionalModelPreference(
                "openrouter/openai/gpt-5.4",
                routerModels,
            ),
        ).toBeNull();
    });
});

describe("resolveEffectiveReasoningLevel", () => {
    it("normalizes a stale level for the selected model before persistence", () => {
        expect(
            resolveEffectiveReasoningLevel({
                model: "gpt-5.6-terra",
                requested: "minimal",
            }),
        ).toBe("low");
        expect(
            resolveEffectiveReasoningLevel({
                model: "gpt-5.5",
                requested: "minimal",
            }),
        ).toBe("low");
        expect(
            resolveEffectiveReasoningLevel({
                model: "gemini-3.8-flash",
                requested: "max",
            }),
        ).toBe("xhigh");
    });
});

describe("resolveEffectiveChatModel", () => {
    const db = {} as Db;

    it("uses an explicit request before persisted values", async () => {
        await expect(
            resolveEffectiveChatModel({
                requested: "gpt-6-luna",
                chatModel: "claude-fable-5-1",
                lastSelectedModel: "gemini-3.8-flash",
                apiKeys: { openai: "key", claude: "key", gemini: "key" },
                userId: "user-1",
                db,
            }),
        ).resolves.toMatchObject({
            ok: true,
            model: "gpt-6-luna",
            source: "request",
        });
    });

    it("falls back to last-selected when the saved chat model has no key", async () => {
        await expect(
            resolveEffectiveChatModel({
                chatModel: "gemini-3.8-flash",
                lastSelectedModel: "gpt-6-luna",
                apiKeys: { openai: "key" },
                userId: "user-1",
                db,
            }),
        ).resolves.toMatchObject({
            ok: true,
            model: "gpt-6-luna",
            source: "last_selected",
        });
    });

    it("requires selection when neither persisted model is usable", async () => {
        await expect(
            resolveEffectiveChatModel({
                apiKeys: {},
                userId: "user-1",
                db,
            }),
        ).resolves.toMatchObject({
            ok: false,
            code: "model_required",
        });
    });
});

describe("configured model selection", () => {
    const originalConfig = process.env.LINKMAI_MODEL_CONFIG_JSON;

    beforeEach(() => {
        process.env.LINKMAI_MODEL_CONFIG_JSON = JSON.stringify({
            models: [
                {
                    id: "keyless-compatible",
                    provider: "openai-compatible",
                    location: "cloud",
                    baseUrl: "https://models.example.test/v1",
                },
                {
                    id: "user-key-compatible",
                    provider: "openai-compatible",
                    location: "cloud",
                    baseUrl: "https://models.example.test/v1",
                    apiKeyProvider: "openai",
                },
            ],
        });
        resetModelRegistryCache();
    });

    afterEach(() => {
        if (originalConfig === undefined) {
            delete process.env.LINKMAI_MODEL_CONFIG_JSON;
        } else {
            process.env.LINKMAI_MODEL_CONFIG_JSON = originalConfig;
        }
        resetModelRegistryCache();
    });

    it("allows a keyless configured model", () => {
        expect(hasApiKeyForModel("keyless-compatible", {})).toBe(true);
    });

    it("requires a declared user key", () => {
        expect(hasApiKeyForModel("user-key-compatible", {})).toBe(false);
        expect(
            hasApiKeyForModel("user-key-compatible", { openai: "user-key" }),
        ).toBe(true);
    });

    it("reuses the configured chat model for title generation", () => {
        expect(titleModelForChat("keyless-compatible")).toBe(
            "keyless-compatible",
        );
    });
});


it("preserves a configured endpoint whose name is also a removed hosted model", () => {
    const previous = process.env.LINKMAI_MODEL_CONFIG_JSON;
    process.env.LINKMAI_MODEL_CONFIG_JSON = JSON.stringify({ models: [{ id: "gpt-5.4", provider: "openai-compatible", location: "local", baseUrl: "http://localhost:8000/v1" }] });
    resetModelRegistryCache();
    try {
        expect(normalizeOptionalModelPreference("gpt-5.4", routerModels)).toBe("gpt-5.4");
    } finally {
        if (previous === undefined) delete process.env.LINKMAI_MODEL_CONFIG_JSON;
        else process.env.LINKMAI_MODEL_CONFIG_JSON = previous;
        resetModelRegistryCache();
    }
});


describe("deployment default models", () => {
    const ENV_KEYS = [
        "LINKMAI_DEFAULT_CHAT_MODEL",
        "LINKMAI_DEFAULT_TITLE_MODEL",
        "LINKMAI_DEFAULT_MEMORY_MODEL",
        "LINKMAI_DEFAULT_TABULAR_MODEL",
        "LINKMAI_DEFAULT_SUBAGENT_MODEL",
    ] as const;
    const originalEnv: Record<string, string | undefined> = {};
    const db = {} as Db;

    beforeEach(() => {
        for (const key of ENV_KEYS) {
            originalEnv[key] = process.env[key];
            delete process.env[key];
        }
    });

    afterEach(() => {
        for (const key of ENV_KEYS) {
            if (originalEnv[key] === undefined) delete process.env[key];
            else process.env[key] = originalEnv[key];
        }
    });

    it("resolves nothing when the deployment declares nothing", async () => {
        await expect(
            resolveDeploymentDefaultModel({
                kind: "chat",
                userId: "user-1",
                db,
                apiKeys: { openai: "key" },
            }),
        ).resolves.toBeNull();
    });

    it("returns a declared model the account can run", async () => {
        process.env.LINKMAI_DEFAULT_TITLE_MODEL = " gpt-6-luna ";
        await expect(
            resolveDeploymentDefaultModel({
                kind: "title",
                userId: "user-1",
                db,
                apiKeys: { openai: "key" },
            }),
        ).resolves.toBe("gpt-6-luna");
    });

    it("skips a model the account holds no key for", async () => {
        process.env.LINKMAI_DEFAULT_CHAT_MODEL = "gpt-6-luna";
        await expect(
            resolveDeploymentDefaultModel({
                kind: "chat",
                userId: "user-1",
                db,
                apiKeys: {},
            }),
        ).resolves.toBeNull();
    });

    it("skips an id that is not a model at all", async () => {
        process.env.LINKMAI_DEFAULT_CHAT_MODEL = "not-a-model";
        await expect(
            resolveDeploymentDefaultModel({
                kind: "chat",
                userId: "user-1",
                db,
                apiKeys: { openai: "key" },
            }),
        ).resolves.toBeNull();
    });

    it("places the deployment default after the chat and last-selected models", async () => {
        process.env.LINKMAI_DEFAULT_CHAT_MODEL = "gpt-6-luna";
        const apiKeys = { openai: "key" };
        await expect(
            resolveEffectiveChatModel({
                chatModel: "gpt-6-astra",
                lastSelectedModel: "gpt-6-luna",
                apiKeys,
                userId: "user-1",
                db,
            }),
        ).resolves.toMatchObject({
            ok: true,
            model: "gpt-6-astra",
            source: "chat",
        });
        await expect(
            resolveEffectiveChatModel({
                lastSelectedModel: "gpt-6-astra",
                apiKeys,
                userId: "user-1",
                db,
            }),
        ).resolves.toMatchObject({
            ok: true,
            model: "gpt-6-astra",
            source: "last_selected",
        });
        await expect(
            resolveEffectiveChatModel({ apiKeys, userId: "user-1", db }),
        ).resolves.toMatchObject({
            ok: true,
            model: "gpt-6-luna",
            source: "deployment",
        });
    });

    it("still requires a selection when the deployment default is unusable", async () => {
        process.env.LINKMAI_DEFAULT_CHAT_MODEL = "gpt-6-luna";
        await expect(
            resolveEffectiveChatModel({ apiKeys: {}, userId: "user-1", db }),
        ).resolves.toMatchObject({ ok: false, code: "model_required" });
    });

    it("puts the deployment title default above the provider low tier", () => {
        expect(titleModelForChat("gpt-6-astra", null, "gpt-6-luna")).toBe(
            "gpt-6-luna",
        );
        // A saved title model is still an explicit override.
        expect(
            titleModelForChat("gpt-6-astra", "claude-haiku-4-5", "gpt-6-luna"),
        ).toBe("claude-haiku-4-5");
        // An unknown declared default falls back to the old provider guess.
        expect(titleModelForChat("gpt-6-astra", null, "not-a-model")).toBe(
            "gpt-6-luna",
        );
    });

    it("lets a checked profile or deployment model outrank the subagent tier", () => {
        expect(
            subagentModelFor("claude-opus-5-5", "light", "claude-sonnet-5-5"),
        ).toBe("claude-sonnet-5-5");
        expect(subagentModelFor("claude-opus-5-5", "light", "bogus")).toBe(
            "claude-haiku-4-5",
        );
    });

    it("resolves every surface's default for the settings screen", async () => {
        process.env.LINKMAI_DEFAULT_CHAT_MODEL = "gpt-6-astra";
        process.env.LINKMAI_DEFAULT_TITLE_MODEL = "gpt-6-luna";
        process.env.LINKMAI_DEFAULT_MEMORY_MODEL = "gpt-6-luna";
        process.env.LINKMAI_DEFAULT_TABULAR_MODEL = "gpt-6-luna";
        process.env.LINKMAI_DEFAULT_SUBAGENT_MODEL = "claude-haiku-4-5";
        await expect(
            resolveDeploymentDefaults({
                userId: "user-1",
                db,
                apiKeys: { openai: "key" },
            }),
        ).resolves.toEqual({
            chat: "gpt-6-astra",
            title: "gpt-6-luna",
            memory: "gpt-6-luna",
            tabular: "gpt-6-luna",
            // No Claude key: skipped rather than shown as usable.
            subagent: null,
        });
    });
});
