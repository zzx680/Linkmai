
import { uiText } from "@linkmai/client";
import Image from "next/image";
import { Plug, type LucideIcon } from "lucide-react";
import type { ApiKeyProvider } from "@/app/lib/linkmaiApi";

// The model providers a key can be saved for, in the order they are listed.
// Shared by a person's Bring Your Own Keys page and an organization's Model
// Providers tab, so the two always offer the same providers under the same
// names.

export type ModelApiKeyField = {
    provider: ApiKeyProvider;
    name: string;
    /** A vendored provider logo, or a Lucide icon where there is no brand. */
    logo?: string;
    icon?: LucideIcon;
    label: string;
    keyLabel?: string;
};

export const MODEL_API_KEY_FIELDS: readonly ModelApiKeyField[] = [
    {
        provider: "claude",
        name: "Anthropic (Claude)",
        logo: "anthropic",
        label: uiText("Anthropic (Claude) API Key"),
    },
    {
        provider: "gemini",
        name: "Google (Gemini)",
        logo: "gemini-color",
        label: uiText("Google (Gemini) API Key"),
    },
    {
        provider: "openai",
        name: "OpenAI",
        logo: "openai",
        label: uiText("OpenAI API Key"),
    },
    {
        provider: "mistral",
        name: "Mistral AI",
        logo: "mistral-color",
        label: uiText("Mistral AI API Key"),
    },
    {
        provider: "xai",
        name: "xAI",
        logo: "xai",
        label: uiText("xAI API Key"),
    },
    {
        provider: "bedrock",
        name: "Amazon Bedrock",
        logo: "bedrock-color",
        label: uiText("Amazon Bedrock API Key"),
    },
    {
        provider: "azure",
        name: "Azure OpenAI",
        logo: "azure-color",
        label: uiText("Azure OpenAI API Key"),
    },
    {
        provider: "azure-foundry",
        name: "Azure AI Foundry",
        logo: "azureai-color",
        label: uiText("Azure AI Foundry API Key"),
    },
    {
        provider: "vertex",
        name: "Google Vertex AI",
        logo: "vertexai-color",
        label: uiText("Google Vertex AI service-account key"),
        keyLabel: uiText("Service-account key (JSON)"),
    },
    {
        provider: "openrouter",
        name: "OpenRouter",
        logo: "openrouter-color",
        label: uiText("OpenRouter API Key"),
    },
    {
        provider: "vercel",
        name: "Vercel AI Gateway",
        logo: "vercel",
        label: uiText("Vercel AI Gateway API Key"),
    },
    {
        provider: "opencode-go",
        name: "OpenCode Go",
        logo: "opencode",
        label: uiText("OpenCode Go API Key"),
    },
    {
        provider: "custom",
        name: uiText("OpenAI-compatible endpoint"),
        icon: Plug,
        label: uiText("OpenAI-compatible endpoint API Key"),
    },
];

/** A provider's logo, or a pulsing stand-in while its state is loading. */
export function ModelProviderIcon({
    field,
    loading = false,
}: {
    field: ModelApiKeyField;
    loading?: boolean;
}) {
    if (loading)
        return <span className="h-7 w-7 animate-pulse rounded-lg bg-gray-200" />;
    const Icon = field.icon;
    if (Icon)
        return <Icon aria-hidden="true" className="h-6 w-6 text-gray-500" />;
    return (
        <Image
            src={`/icons/providers/${field.logo}.svg`}
            alt=""
            width={28}
            height={28}
            className={field.logo?.endsWith("-color") ? "" : "dark:invert"}
        />
    );
}
