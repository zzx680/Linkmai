"use client";

import { uiText } from "@linkmai/client";

import { useState } from "react";
import { useUserProfile } from "@/app/contexts/UserProfileContext";
import { userFacingApiError } from "@/app/lib/userFacingError";
import {
  SettingsDescription,
  SettingsLabel,
} from "@/app/components/settings/SettingsText";
import { GlassCardUI, ToggleSwitchUI } from "@linkmai/ui";
import { SettingsHeading } from "@/app/components/settings/SettingsHeading";
import { SettingsRow } from "@/app/components/settings/SettingsRow";

export default function AppearancePage() {
  const { profile, updateDarkMode } = useUserProfile();
  const [savingDarkMode, setSavingDarkMode] = useState(false);
  const [darkModeError, setDarkModeError] = useState<string | null>(null);

  if (!profile) return null;

  const handleDarkModeToggle = async (enabled: boolean) => {
    if (savingDarkMode) return;
    setSavingDarkMode(true);
    setDarkModeError(null);
    try {
      await updateDarkMode(enabled);
    } catch (toggleError) {
      setDarkModeError(
        userFacingApiError(
          toggleError,
          uiText("Could not update the appearance setting."),
        ),
      );
    } finally {
      setSavingDarkMode(false);
    }
  };

  return (
    <section className="space-y-3">
      <SettingsHeading id="appearance">{uiText("Appearance")}</SettingsHeading>
      <GlassCardUI>
        <SettingsRow>
          <div className="min-w-0 space-y-1">
            <SettingsLabel>{uiText("Dark mode")}</SettingsLabel>
            <SettingsDescription>
              {uiText("Use a darker color palette throughout LinkMai.")}
            </SettingsDescription>
            {darkModeError && (
              <p role="alert" className="text-xs text-red-600">
                {darkModeError}
              </p>
            )}
          </div>
          <ToggleSwitchUI
            checked={profile.darkMode === true}
            disabled={savingDarkMode}
            aria-busy={savingDarkMode}
            aria-label={uiText("Dark mode")}
            onCheckedChange={(checked) => void handleDarkModeToggle(checked)}
          />
        </SettingsRow>
      </GlassCardUI>
    </section>
  );
}
