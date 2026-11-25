"use client";

import { uiText } from "@linkmai/client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OnboardingInvitations } from "@/app/components/auth/OnboardingInvitations";
import { OnboardingShell } from "@/app/components/auth/OnboardingShell";
import { FullScreenLoader } from "@/app/components/shared/FullScreenLoader";
import { useAuth } from "@/app/contexts/AuthContext";
import { useUserProfile } from "@/app/contexts/UserProfileContext";
import { PillButtonUI } from "@linkmai/ui";

export default function OnboardingInvitationsPage() {
    const router = useRouter();
    const { user, authLoading } = useAuth();
    const { profile, loading } = useUserProfile();

    useEffect(() => {
        if (!authLoading && !user) router.replace("/login");
    }, [authLoading, router, user]);

    if (authLoading || loading || !user || !profile) {
        return <FullScreenLoader />;
    }

    return <InvitationStep key={user.id} userId={user.id} />;
}

function InvitationStep({ userId }: { userId: string }) {
    const router = useRouter();
    const [invitationsBusy, setInvitationsBusy] = useState(true);

    return (
        <OnboardingShell
            step={uiText("Step 3 of 4")}
            title={uiText("Organization invitations")}
        >
            <OnboardingInvitations
                userId={userId}
                disabled={false}
                onBusyChange={setInvitationsBusy}
            />
            <div className="flex items-center justify-between gap-3 pt-6">
                <PillButtonUI
                    type="button"
                    tone="white"
                    size="normal"
                    disabled={invitationsBusy}
                    onClick={() => router.push("/onboarding/practice")}
                >
                    {uiText("Back")}
                </PillButtonUI>
                <PillButtonUI
                    type="button"
                    tone="black"
                    size="normal"
                    disabled={invitationsBusy}
                    onClick={() => router.push("/onboarding/models")}
                >
                    {uiText("Continue")}
                </PillButtonUI>
            </div>
        </OnboardingShell>
    );
}
