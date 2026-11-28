"use client";

import { uiText } from "@linkmai/client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OnboardingShell } from "@/app/components/auth/OnboardingShell";
import { WarningPopup } from "@/app/components/popups/WarningPopup";
import { MODEL_API_KEY_FIELDS } from "@/app/components/settings/modelProviders";
import { PersonalProviderKeys } from "@/app/components/settings/PersonalProviderKeys";
import { FullScreenLoader } from "@/app/components/shared/FullScreenLoader";
import { useAuth } from "@/app/contexts/AuthContext";
import { useUserProfile } from "@/app/contexts/UserProfileContext";
import {
    PERSONAL_WORKSPACE,
    readStoredWorkspace,
} from "@/app/contexts/WorkspaceContext";
import { apiKeyStateFromStatus } from "@/app/lib/apiKeyState";
import { getOrgApiKeys, listOrgs, type ApiKeyState } from "@/app/lib/linkmaiApi";
import { PillButtonUI } from "@linkmai/ui";

export default function OnboardingModelsPage() {
    const router = useRouter();
    const { user, authLoading } = useAuth();
    const { profile, loading } = useUserProfile();

    useEffect(() => {
        if (!authLoading && !user) router.replace("/login");
    }, [authLoading, router, user]);

    if (authLoading || loading || !user || !profile) {
        return <FullScreenLoader />;
    }

    return <ModelStep key={user.id} userId={user.id} />;
}

type KeySource = "user" | "org" | "env" | null;

/** Whether any model provider can run on the given keys, from the named source. */
function hasUsableProvider(
    keys: ApiKeyState | undefined,
    source?: Exclude<KeySource, null>,
): boolean {
    if (!keys) return false;
    return MODEL_API_KEY_FIELDS.some((field) => {
        const state = keys[field.provider];
        return (
            !!state?.configured &&
            state.enabled !== false &&
            (source === undefined || state.source === source)
        );
    });
}

/**
 * The organization the person accepted an invitation to in the previous
 * step, and whether it already has models to run on. Onboarding runs
 * outside the app's WorkspaceProvider, so the stored workspace is read and
 * resolved here. Null until known, or when there is nothing to say.
 */
function useJoinedOrganization(userId: string) {
    const [joined, setJoined] = useState<{
        name: string;
        hasModels: boolean;
    } | null>(null);

    useEffect(() => {
        const orgId = readStoredWorkspace(userId);
        if (orgId === PERSONAL_WORKSPACE) return;
        let cancelled = false;
        void Promise.all([listOrgs(), getOrgApiKeys(orgId)]).then(
            ([orgs, keys]) => {
                if (cancelled) return;
                const org = orgs.find((candidate) => candidate.id === orgId);
                if (!org) return;
                setJoined({
                    name: org.name,
                    hasModels: hasUsableProvider(
                        apiKeyStateFromStatus(keys.effective),
                    ),
                });
            },
            () => {
                // Unknown is not "no models": the step keeps its general
                // wording and the server still decides what may run.
            },
        );
        return () => {
            cancelled = true;
        };
    }, [userId]);

    return joined;
}

function stepDescription(
    keys: ApiKeyState | undefined,
    joined: { name: string; hasModels: boolean } | null,
): string {
    if (joined?.hasModels) {
        return `You joined ${joined.name}, and its models are available in that workspace, so you can finish now. Keys you add here are used in your Personal workspace only.`;
    }
    if (hasUsableProvider(keys, "user")) {
        return "Your key is saved. Add more providers now, or change them later in Settings.";
    }
    if (hasUsableProvider(keys, "env")) {
        return "This deployment already provides models, so you can finish now. A key you add here replaces the deployment's for your Personal workspace.";
    }
    return uiText("Add an API key for at least one provider to start using LinkMai in your Personal workspace. You can add or change keys later in Settings.");
}

function ModelStep({ userId }: { userId: string }) {
    const router = useRouter();
    const { profile, completeOnboarding } = useUserProfile();
    const joined = useJoinedOrganization(userId);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(false);

    async function finish() {
        if (submitting) return;
        setSubmitting(true);
        setError(false);
        const saved = await completeOnboarding();
        if (saved) {
            router.replace("/assistant");
        } else {
            setError(true);
            setSubmitting(false);
        }
    }

    const hasHostedModels = hasUsableProvider(profile?.apiKeys, "env");

    return (
        <OnboardingShell
            step={uiText("Step 4 of 4")}
            title={uiText("Connect a model")}
            description={stepDescription(profile?.apiKeys, joined)}
            width="wide"
        >
            {hasHostedModels && (
                <div className="mb-6 rounded-2xl border border-stone-200 bg-[#f7f3ea] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500">LinkMai hosted</p>
                            <h2 className="mt-2 font-serif text-xl font-medium text-stone-950">灵迈内置模型</h2>
                            <p className="mt-1 text-sm text-stone-600">DeepSeek V4 Pro / Flash · 无需配置 API Key</p>
                        </div>
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">内测免费</span>
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-stone-700">
                        内测期间由灵迈承担模型费用。你可以直接点「完成」进入工作台；需要自己的 Key 时，再展开下方选项。
                    </p>
                </div>
            )}
            {hasHostedModels ? (
                <details className="rounded-2xl border border-stone-200 bg-white/60 p-4">
                    <summary className="cursor-pointer text-sm font-medium text-stone-700">使用自己的 API Key（可选）</summary>
                    <div className="mt-4"><PersonalProviderKeys intro={null} /></div>
                </details>
            ) : (
                <PersonalProviderKeys intro={null} />
            )}
            <WarningPopup
                open={error}
                onClose={() => setError(false)}
                title={uiText("Unable to finish setup")}
                message={uiText("Please try again.")}
            />
            <div className="flex items-center justify-between gap-3 pt-6">
                <PillButtonUI
                    type="button"
                    tone="white"
                    size="normal"
                    disabled={submitting}
                    onClick={() => router.push("/onboarding/invitations")}
                >
                    {uiText("Back")}
                </PillButtonUI>
                <PillButtonUI
                    type="button"
                    tone="black"
                    size="normal"
                    disabled={submitting}
                    onClick={() => void finish()}
                >
                    {submitting ? uiText("Finishing...") : uiText("Finish")}
                </PillButtonUI>
            </div>
        </OnboardingShell>
    );
}
