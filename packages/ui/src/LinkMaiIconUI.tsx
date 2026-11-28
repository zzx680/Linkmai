"use client";

import React, { useSyncExternalStore } from "react";

/**
 * The LinkMai mark: the M from the brand logo, drawn as one rounded stroke so
 * it reads at 14–24 px. It inherits black on light surfaces and white on dark
 * ones; statuses and subagent tints replace the stroke colour instead of
 * layering gradients, which keeps a 14 px mark legible.
 */

export type LinkMaiIconTint =
    | "sky"
    | "violet"
    | "amber"
    | "pink"
    | "teal"
    | "indigo";

/** The tints in the order a list of marks should take them. */
export const LINKMAI_ICON_TINTS: LinkMaiIconTint[] = [
    "sky",
    "violet",
    "amber",
    "pink",
    "teal",
    "indigo",
];

// Tailwind 500 for each hue: saturated enough to separate marks at a glance,
// and dark enough to stay visible on white. Red and green are left out so a
// tint never reads as an error or as done.
const TINT_COLORS: Record<LinkMaiIconTint, string> = {
    sky: "#0ea5e9",
    violet: "#8b5cf6",
    amber: "#f59e0b",
    pink: "#ec4899",
    teal: "#14b8a6",
    indigo: "#6366f1",
};

const LIGHT = "#0a0a0a";
const DARK = "#ffffff";
const DONE = "#22c55e";
const ERROR = "#ef4444";

// The mark is inline SVG, so the neutral-palette dark remapping in
// globals.css cannot reach it; it watches the document theme class itself.
// One observer serves every icon on the page. Targets that never set the
// class (the Word add-in) always read false and keep the dark mark.
const themeListeners = new Set<() => void>();
let themeObserver: MutationObserver | null = null;

function subscribeToTheme(listener: () => void): () => void {
    themeListeners.add(listener);
    if (!themeObserver && typeof MutationObserver !== "undefined") {
        themeObserver = new MutationObserver(() => {
            themeListeners.forEach((notify) => notify());
        });
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
        });
    }

    return () => {
        themeListeners.delete(listener);
        if (themeListeners.size === 0) {
            themeObserver?.disconnect();
            themeObserver = null;
        }
    };
}

function readDarkTheme(): boolean {
    return (
        typeof document !== "undefined" &&
        document.documentElement.classList.contains("dark")
    );
}

function readDarkThemeOnServer(): boolean {
    return false;
}

function useDarkTheme(): boolean {
    return useSyncExternalStore(
        subscribeToTheme,
        readDarkTheme,
        readDarkThemeOnServer,
    );
}

/** The logo's M: two outer legs and the V between them, one rounded stroke. */
const MARK_PATH = "M20 100V22l40 38 40-38v78";

export function LinkMaiIcon({
    spin = false,
    done = false,
    error = false,
    linkmai = false,
    tint,
    size = 24,
    style,
}: {
    spin?: boolean;
    done?: boolean;
    error?: boolean;
    linkmai?: boolean;
    /** A colour for the mark; the status palettes take precedence. */
    tint?: LinkMaiIconTint;
    size?: number;
    style?: React.CSSProperties;
}) {
    void linkmai;
    const darkTheme = useDarkTheme();
    const color = error
        ? ERROR
        : done
          ? DONE
          : tint
            ? TINT_COLORS[tint]
            : darkTheme
              ? DARK
              : LIGHT;

    return (
        <span
            className="shrink-0 inline-block animate-[spin_3s_linear_infinite]"
            style={{
                animationPlayState: spin ? "running" : "paused",
                ...style,
            }}
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 120 120"
                width={size}
                height={size}
                style={{ display: "block" }}
                aria-hidden="true"
                focusable="false"
            >
                <path
                    d={MARK_PATH}
                    fill="none"
                    stroke={color}
                    strokeWidth={17}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ transition: "stroke 220ms ease" }}
                />
            </svg>
        </span>
    );
}
