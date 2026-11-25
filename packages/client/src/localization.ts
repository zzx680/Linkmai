import { UI_DICTIONARY } from "./uiDictionary";

export type UiLocale = "zh-CN" | "en";
let locale: UiLocale = "zh-CN";

/** Both clients default to Chinese; an embedding host can select English. */
export function setUiLocale(next: UiLocale): void {
    locale = next;
}

export function getUiLocale(): UiLocale {
    return locale;
}

const englishCopy = new Map(
    Object.entries(UI_DICTIONARY).filter(([, chinese]) => /\p{Script=Han}/u.test(chinese)).map(([english, chinese]) => [chinese, english]),
);

function translate(text: string): string {
    const decode = (value: string) => value.replace(/&(apos|quot|amp|lt|gt|nbsp|ldquo|rdquo|lsquo|rsquo);/g,
        (_, entity: string) => ({ apos: "'", quot: '"', amp: "&", lt: "<", gt: ">", nbsp: "\u00a0", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’" })[entity] ?? entity);
    // English-authored keys are unambiguous, including duplicate translations.
    if (locale === "en" && Object.prototype.hasOwnProperty.call(UI_DICTIONARY, text)) return decode(text);
    return decode(locale === "zh-CN"
        ? UI_DICTIONARY[text] ?? text
        : englishCopy.get(text) ?? text);
}

/** Browser-local time zone, with this deployment's display conventions. */
export function uiDateLocale(): string | undefined {
    return locale === "zh-CN" ? "zh-CN" : undefined;
}

/**
 * Only authored UI copy is translated. Tagged-template values are preserved
 * verbatim, so a person's name, a document title or a currency is never a key.
 */
export function uiText(text: string): string;
export function uiText(parts: TemplateStringsArray, ...values: unknown[]): string;
export function uiText(text: string | TemplateStringsArray, ...values: unknown[]): string {
    if (typeof text === "string") return translate(text);
    const key = text.map((part, index) => part + (index < values.length ? `{${index}}` : "")).join("");
    const pattern = locale === "zh-CN" ? UI_DICTIONARY[key] : undefined;
    if (pattern !== undefined) {
        return pattern.replace(/\{(\d+)\}/g, (_, index: string) => String(values[Number(index)] ?? ""));
    }
    return text.reduce((result, part, index) =>
        result + translate(part) + (index < values.length ? String(values[index] ?? "") : ""), "");
}
