"use client";

import { uiText } from "@mike/client";

import { useEffect, useRef, useState } from "react";
import { GlassCardUI, PillButtonUI } from "@mike/ui";
import { SettingsHeading } from "@/app/components/settings/SettingsHeading";
import { SettingsRow } from "@/app/components/settings/SettingsRow";
import {
  SettingsSelectRow,
  type SettingsSelectOption,
} from "@/app/components/settings/SettingsSelectRow";
import { SettingsDescription } from "@/app/components/settings/SettingsText";
import {
  RESPONSE_STYLE_OPTIONS,
  getResponseStyle,
  updateResponseStyle,
  type ResponseStyle,
  type ResponseStyleField,
} from "@/app/lib/mikeApi";
import { userFacingApiError } from "@/app/lib/userFacingError";

type OptionCopy = Omit<SettingsSelectOption, "value">;

type ResponseLanguage = ResponseStyle["language"];

/** Every language reads the same way, so only its name is written out. */
function languageOptions(
  names: Record<Exclude<ResponseLanguage, "auto">, string>,
): Record<ResponseLanguage, OptionCopy> {
  const options = {
    auto: {
      label: uiText("Automatic"),
      description: uiText("Mike replies in the language you write in."),
    },
  } as Record<ResponseLanguage, OptionCopy>;
  for (const [code, name] of Object.entries(names)) {
    options[code as ResponseLanguage] = {
      label: name,
      description: uiText`Mike replies in ${name}.`,
    };
  }
  return options;
}

// Typed per field, so adding an option to RESPONSE_STYLE_OPTIONS without its
// copy here fails the typecheck.
const SETTINGS: {
  [Field in ResponseStyleField]: {
    label: string;
    options: Record<ResponseStyle[Field], OptionCopy>;
  };
} = {
  verbosity: {
    label: uiText("Verbosity"),
    options: {
      concise: {
        label: uiText("Concise"),
        description: uiText("Short, direct answers that lead with the conclusion."),
      },
      balanced: {
        label: uiText("Balanced"),
        description: uiText("Enough explanation to follow the reasoning."),
      },
      detailed: {
        label: uiText("Detailed"),
        description: uiText("Fuller reasoning, exceptions, and practical next steps."),
      },
    },
  },
  formatting: {
    label: uiText("Headers and Lists"),
    options: {
      balanced: {
        label: uiText("Balanced"),
        description: uiText("Mike picks the layout that suits each answer."),
      },
      less: {
        label: uiText("Less"),
        description: uiText("Mostly prose, with headings and lists only when needed."),
      },
      more: {
        label: uiText("More"),
        description: uiText("Headings, bullet points, and tables for easy scanning."),
      },
    },
  },
  tone: {
    label: uiText("Tone"),
    options: {
      formal: {
        label: uiText("Formal and Legal"),
        description: uiText("A precise, client-ready legal register."),
      },
      balanced: {
        label: uiText("Balanced"),
        description: uiText("Mike's usual professional tone."),
      },
      plain: {
        label: uiText("Plain and Simple"),
        description:
          uiText("Short sentences and everyday words, with legal terms explained."),
      },
    },
  },
  language: {
    label: uiText("Language"),
    options: languageOptions({
      "en-US": uiText("English (US)"),
      "en-GB": uiText("English (UK)"),
      ar: uiText("Arabic"),
      "zh-Hans": uiText("Chinese (Simplified)"),
      "zh-Hant": uiText("Chinese (Traditional)"),
      cs: uiText("Czech"),
      da: uiText("Danish"),
      nl: uiText("Dutch"),
      fi: uiText("Finnish"),
      fr: uiText("French"),
      de: uiText("German"),
      el: uiText("Greek"),
      he: uiText("Hebrew"),
      hi: uiText("Hindi"),
      id: uiText("Indonesian"),
      it: uiText("Italian"),
      ja: uiText("Japanese"),
      ko: uiText("Korean"),
      ms: uiText("Malay"),
      nb: uiText("Norwegian"),
      pl: uiText("Polish"),
      "pt-BR": uiText("Portuguese (Brazil)"),
      "pt-PT": uiText("Portuguese (Portugal)"),
      ru: uiText("Russian"),
      es: uiText("Spanish"),
      sv: uiText("Swedish"),
      th: uiText("Thai"),
      tr: uiText("Turkish"),
      uk: uiText("Ukrainian"),
      vi: uiText("Vietnamese"),
    }),
  },
};

const FIELDS = Object.keys(RESPONSE_STYLE_OPTIONS) as ResponseStyleField[];

export function ResponseStyleSection() {
  const [style, setStyle] = useState<ResponseStyle | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const [saveErrors, setSaveErrors] = useState<
    Partial<Record<ResponseStyleField, string>>
  >({});
  // Per setting, only the newest choice may settle the UI; an older save
  // that resolves late must not overwrite it.
  const latestRequestRef = useRef<Record<ResponseStyleField, number>>({
    verbosity: 0,
    formatting: 0,
    tone: 0,
    language: 0,
  });

  useEffect(() => {
    const controller = new AbortController();
    getResponseStyle(controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) setStyle(loaded);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      });
    return () => controller.abort();
  }, [loadVersion]);

  const choose = async <Field extends ResponseStyleField>(
    field: Field,
    next: ResponseStyle[Field],
  ) => {
    if (!style || style[field] === next) return;
    const previous = style[field];
    const request = ++latestRequestRef.current[field];
    const settle = (value: ResponseStyle[Field]) =>
      setStyle((current) => (current ? { ...current, [field]: value } : current));
    settle(next);
    setSaveErrors((current) => ({ ...current, [field]: undefined }));
    try {
      const saved = await updateResponseStyle({ [field]: next });
      if (request !== latestRequestRef.current[field]) return;
      settle(saved[field]);
    } catch (error) {
      if (request !== latestRequestRef.current[field]) return;
      settle(previous);
      setSaveErrors((current) => ({
        ...current,
        [field]: userFacingApiError(
          error,
          uiText("This setting could not be saved. Please try again."),
        ),
      }));
    }
  };

  return (
    <section className="space-y-3" aria-labelledby="response-style-heading">
      <SettingsHeading id="response-style-heading">{uiText("Response style")}</SettingsHeading>
      <SettingsDescription>
        {uiText("Choose how Mike shapes its answers in chats.")}
      </SettingsDescription>
      <GlassCardUI>
        {loadError ? (
          <SettingsRow>
            <p className="text-sm text-red-600" role="alert">
              {uiText("Could not load your response style.")}
            </p>
            <PillButtonUI
              tone="white"
              size="sm"
              onClick={() => {
                setLoadError(false);
                setLoadVersion((current) => current + 1);
              }}
            >
              {uiText("Retry")}
            </PillButtonUI>
          </SettingsRow>
        ) : (
          FIELDS.map((field) => (
            <SettingsSelectRow
              key={field}
              id={`response-${field}`}
              label={SETTINGS[field].label}
              options={RESPONSE_STYLE_OPTIONS[field].map((option) => ({
                value: option,
                ...(SETTINGS[field].options as Record<string, OptionCopy>)[
                  option
                ],
              }))}
              value={style ? style[field] : null}
              error={saveErrors[field] ?? null}
              onChange={(next) =>
                void choose(field, next as ResponseStyle[typeof field])
              }
            />
          ))
        )}
      </GlassCardUI>
    </section>
  );
}
