import type {
    DelegationModelTier,
    DeploymentModelDefaults,
} from "@linkmai/contracts";
import {
    builtInModelIds,
    CLAUDE_LOW_MODELS,
    CLAUDE_MID_MODELS,
    GEMINI_LOW_MODELS,
    GEMINI_MID_MODELS,
    OPENAI_LOW_MODELS,
    OPENAI_MID_MODELS,
    MISTRAL_LOW_MODELS,
    MISTRAL_MID_MODELS,
    type Provider,
    providerForModel,
    normalizeReasoningLevelForModel,
    resolveModel,
    type UserApiKeys,
    REASONING_LEVELS,
    type ReasoningLevel,
} from "./llm";
import {
    azureCredentials,
    azureFoundryCredentials,
    bedrockCredentials,
    customEndpointCredentials,
    vertexCredentials,
} from "./llm/cloudProviders";
import {
    apiKeyForConfiguredModel,
    configuredModelRequiresApiKey,
    getConfiguredModel,
} from "./llm/registry";
import {
    isRouterModelSelected,
    type RouterModelSelections,
} from "./routerModels";
import { resolveRequestedModel } from "./routerModels";
import type { Db } from "./supabase";
import { UserFacingError } from "./userFacingError";
import {
    deploymentDefaultModelId,
    type DeploymentModelKind,
} from "./llm/deploymentDefaults";
import { log } from "./log";

export const MODEL_REQUIRED_DETAIL =
    "Select a model before sending a message.";

export const TABULAR_MODEL_REQUIRED_DETAIL =
    "Select a model for this tabular review before running it.";

export const DEFAULT_REASONING_LEVEL: ReasoningLevel = "high";

export function normalizeReasoningLevel(
    value: unknown,
): ReasoningLevel | null {
    // `minimal` was previously persisted; treat it as Low while migrations
    // and older clients converge on the current reasoning-level union.
    if (value === "minimal") return "low";
    return typeof value === "string" &&
        (REASONING_LEVELS as readonly string[]).includes(value)
        ? (value as ReasoningLevel)
        : null;
}

/** Resolve request → chat → profile, defaulting a never-selected user to High. */
export function resolveEffectiveReasoningLevel(args: {
    model: string;
    requested?: unknown;
    chatReasoningLevel?: unknown;
    lastSelectedReasoningLevel?: unknown;
}): ReasoningLevel {
    const selected =
        normalizeReasoningLevel(args.requested) ??
        normalizeReasoningLevel(args.chatReasoningLevel) ??
        normalizeReasoningLevel(args.lastSelectedReasoningLevel) ??
        DEFAULT_REASONING_LEVEL;

    return (
        normalizeReasoningLevelForModel(args.model, selected) ??
        DEFAULT_REASONING_LEVEL
    );
}

/**
 * Normalize a stored optional preference without inventing a fallback.
 * Router preferences are valid only while they remain in the user's saved
 * router-model allowlist.
 */
export function normalizeOptionalModelPreference(
    value: string | null | undefined,
    routerModels: RouterModelSelections,
): string | null {
    const resolved = resolveModel(value, "");
    if (!resolved || !isRouterModelSelected(resolved, routerModels)) return null;
    return resolved;
}

/** Whether a resolved model can actually run with the user's current keys. */
export function hasApiKeyForModel(
    model: string,
    apiKeys: UserApiKeys,
): boolean {
    const provider = providerForModel(model);
    if (apiKeys.disabledProviders?.includes(provider)) return false;
    if (provider === "ollama") return true;
    if (provider === "openai-compatible") {
        const configured = getConfiguredModel(model);
        return (
            configured !== null &&
            (!configuredModelRequiresApiKey(configured) ||
                apiKeyForConfiguredModel(configured, apiKeys) !== null)
        );
    }
    if (provider === "bedrock") return bedrockCredentials(apiKeys) !== null;
    if (provider === "azure") return azureCredentials(apiKeys) !== null;
    if (provider === "azure-foundry") {
        return azureFoundryCredentials(apiKeys) !== null;
    }
    if (provider === "vertex") return vertexCredentials(apiKeys) !== null;
    if (provider === "custom") {
        return customEndpointCredentials(apiKeys) !== null;
    }
    return !!apiKeys[provider]?.trim();
}

const warnedDeploymentDefaults = new Set<string>();

function warnDeploymentDefault(
    kind: DeploymentModelKind,
    declared: string,
    reason: "unknown" | "unavailable",
): void {
    const key = `${kind}:${declared}:${reason}`;
    if (warnedDeploymentDefaults.has(key)) return;
    warnedDeploymentDefaults.add(key);
    log.warn("models", "deployment default model skipped", {
        surface: kind,
        declared,
        reason,
    });
}

/**
 * The deployment's default model for one surface, checked for THIS user.
 *
 * A declared id that does not resolve, sits outside the router selection that
 * governs the user's key, or has no usable key is skipped, so the surface
 * falls back exactly as it would without a deployment default. Nothing here
 * persists anything, and an invalid default is never handed to a provider.
 */
export async function resolveDeploymentDefaultModel(args: {
    kind: DeploymentModelKind;
    userId: string;
    db: Db;
    apiKeys: UserApiKeys;
    /** The organization the work belongs to: its lists govern its keys. */
    orgId?: string | null;
}): Promise<string | null> {
    const declared = deploymentDefaultModelId(args.kind);
    if (!declared) return null;
    const resolved = resolveModel(declared, "");
    if (!resolved) {
        warnDeploymentDefault(args.kind, declared, "unknown");
        return null;
    }
    const allowed = await resolveRequestedModel(
        resolved,
        "",
        args.userId,
        args.db,
        "fallback",
        args.orgId,
    );
    if (!allowed || !hasApiKeyForModel(allowed, args.apiKeys)) {
        warnDeploymentDefault(args.kind, declared, "unavailable");
        return null;
    }
    return allowed;
}

/** Every surface's validated default, for the settings UI. */
export async function resolveDeploymentDefaults(args: {
    userId: string;
    db: Db;
    apiKeys: UserApiKeys;
    orgId?: string | null;
}): Promise<DeploymentModelDefaults> {
    const kinds: readonly DeploymentModelKind[] = [
        "chat",
        "title",
        "memory",
        "tabular",
        "subagent",
    ];
    const entries = await Promise.all(
        kinds.map(async (kind) => {
            try {
                return [
                    kind,
                    await resolveDeploymentDefaultModel({ ...args, kind }),
                ] as const;
            } catch (error) {
                // A defaults listing must not fail the model catalog: the
                // request paths re-validate every default anyway.
                log.warn("models", "deployment default lookup failed", {
                    surface: kind,
                    reason:
                        error instanceof Error ? error.name : typeof error,
                });
                return [kind, null] as const;
            }
        }),
    );
    return Object.fromEntries(entries) as DeploymentModelDefaults;
}

type EffectiveChatModelResult =
    | {
          ok: true;
          model: string;
          source: "request" | "chat" | "last_selected" | "deployment";
      }
    | {
          ok: false;
          status: 400 | 422;
          code: "model_required" | "model_unavailable" | "missing_api_key";
          detail: string;
      };

/**
 * Resolve a chat turn without inventing a product default. An explicit
 * request is authoritative. Otherwise the chat's saved model wins, with the
 * one profile-level last-selected model as the only fallback.
 */
export async function resolveEffectiveChatModel(args: {
    requested?: string | null;
    chatModel?: string | null;
    lastSelectedModel?: string | null;
    apiKeys: UserApiKeys;
    userId: string;
    db: Db;
    /** The organization the work belongs to: its lists govern its keys. */
    orgId?: string | null;
}): Promise<EffectiveChatModelResult> {
    const requestedText = args.requested?.trim() ?? "";
    if (requestedText) {
        const requested = resolveModel(requestedText, "");
        if (!requested) {
            return {
                ok: false,
                status: 400,
                code: "model_unavailable",
                detail: `Model "${requestedText}" is not available. Select another model.`,
            };
        }
        try {
            const model = await resolveRequestedModel(
                requested,
                "",
                args.userId,
                args.db,
                "throw",
                args.orgId,
            );
            if (!hasApiKeyForModel(model, args.apiKeys)) {
                if (args.apiKeys.disabledProviders?.includes(providerForModel(model))) {
                    return {
                        ok: false,
                        status: 422,
                        code: "model_unavailable",
                        detail: "This model provider is turned off. Turn it on in Settings → Bring Your Own Keys or select another model.",
                    };
                }
                return {
                    ok: false,
                    status: 422,
                    code: "missing_api_key",
                    detail: `An API key is required to use ${model}. Add the key or select another model.`,
                };
            }
            return { ok: true, model, source: "request" };
        } catch (error) {
            if (error instanceof UserFacingError) {
                return {
                    ok: false,
                    status: 400,
                    code: "model_unavailable",
                    detail: error.message,
                };
            }
            throw error;
        }
    }

    const storedCandidates = [
        { value: args.chatModel, source: "chat" as const },
        { value: args.lastSelectedModel, source: "last_selected" as const },
    ];
    for (const candidate of storedCandidates) {
        const resolved = resolveModel(candidate.value, "");
        if (!resolved) continue;
        const selected = await resolveRequestedModel(
            resolved,
            "",
            args.userId,
            args.db,
            "fallback",
            args.orgId,
        );
        if (selected && hasApiKeyForModel(selected, args.apiKeys)) {
            return { ok: true, model: selected, source: candidate.source };
        }
    }

    // Last: the deployment's declared default, already checked for this user.
    const deploymentDefault = await resolveDeploymentDefaultModel({
        kind: "chat",
        userId: args.userId,
        db: args.db,
        apiKeys: args.apiKeys,
        orgId: args.orgId,
    });
    if (deploymentDefault) {
        return { ok: true, model: deploymentDefault, source: "deployment" };
    }

    return {
        ok: false,
        status: 400,
        code: "model_required",
        detail: MODEL_REQUIRED_DETAIL,
    };
}

/**
 * Pick the model used for automatic title generation.
 *
 * A saved title preference is an explicit override. Otherwise first-party
 * chat models map to that provider's cheapest title-tier model. Routers and
 * local models reuse the exact chat model because LinkMai cannot safely infer a
 * cheaper equivalent within an external/dynamic catalog.
 */
export function titleModelForChat(
    chatModel: string,
    titleOverride?: string | null,
    deploymentTitleModel?: string | null,
): string {
    const override = resolveModel(titleOverride, "");
    if (override) return override;

    // The deployment default replaces the provider's low-tier guess: an
    // operator who named a cheap model means it, even for a first-party chat.
    const deployment = resolveModel(deploymentTitleModel, "");
    if (deployment) return deployment;

    const resolvedChatModel = resolveModel(chatModel, "");
    if (!resolvedChatModel) {
        throw new Error("A supported chat model is required for title generation");
    }

    switch (providerForModel(resolvedChatModel)) {
        case "claude":
            return CLAUDE_LOW_MODELS[0];
        case "gemini":
            return GEMINI_LOW_MODELS[0];
        case "openai":
            return OPENAI_LOW_MODELS[0];
        case "mistral":
            return MISTRAL_LOW_MODELS[0];
        case "openrouter":
        case "vercel":
        case "opencode-go":
        case "bedrock":
        case "azure":
        case "azure-foundry":
        case "vertex":
        case "xai":
        case "custom":
        case "ollama":
        case "openai-compatible":
            return resolvedChatModel;
    }
}

export const DELEGATION_MODEL_TIERS: readonly DelegationModelTier[] = [
    "light",
    "standard",
    "same",
];

function tieredModels(
    provider: Provider,
): { light: readonly string[]; standard: readonly string[] } | null {
    switch (provider) {
        case "claude":
            return { light: CLAUDE_LOW_MODELS, standard: CLAUDE_MID_MODELS };
        case "gemini":
            return { light: GEMINI_LOW_MODELS, standard: GEMINI_MID_MODELS };
        case "openai":
            return { light: OPENAI_LOW_MODELS, standard: OPENAI_MID_MODELS };
        case "mistral":
            return { light: MISTRAL_LOW_MODELS, standard: MISTRAL_MID_MODELS };
        default:
            return null;
    }
}

/** Empty for routers, cloud platforms and local models. */
export function sameProviderModels(chatModel: string, apiKeys: UserApiKeys): string[] {
    const provider = providerForModel(chatModel);
    return builtInModelIds().filter(
        (model) => providerForModel(model) === provider && hasApiKeyForModel(model, apiKeys),
    );
}

/**
 * As with titles, only first-party chat models step down to a cheaper model of
 * the same provider; otherwise the chat model runs.
 */
export function subagentModelFor(
    chatModel: string,
    tier: DelegationModelTier,
    preferred?: string | null,
): string {
    // A checked profile or deployment preference outranks the tier guess.
    const explicit = resolveModel(preferred, "");
    if (explicit) return explicit;
    const tiers = tieredModels(providerForModel(chatModel));
    if (!tiers || tier === "same") return chatModel;
    const chatRank = [tiers.light, tiers.standard].findIndex((models) =>
        models.includes(chatModel),
    );
    const atOrBelowTier =
        chatRank >= 0 && chatRank <= DELEGATION_MODEL_TIERS.indexOf(tier);
    return atOrBelowTier ? chatModel : tiers[tier][0];
}
