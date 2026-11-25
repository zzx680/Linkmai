
import { uiText } from "@linkmai/client";
import React, { useEffect, useState } from "react";
import quickActionsIcon from "@icons/features/quick-actions.svg";
import { getUserProfile } from "../../api/linkmaiApi";
import { LinkMaiIcon } from "../../../shared/chat/linkmai-icon";
import type { QuickAction } from "../../types";
import { useQuickActions } from "../../lib/quickActionStore";
import { quickActionDisplayName } from "../../lib/quickActions";

const ICON_SIZE = 26;

export function InitialView({
  onSelect,
}: {
  onSelect: (action: QuickAction) => void;
}): React.ReactElement {
  const [name, setName] = useState<string | null>(null);
  const quickActions = useQuickActions();

  useEffect(() => {
    let cancelled = false;
    void getUserProfile()
      .then((profile) => {
        const displayName = profile.displayName?.trim();
        if (!cancelled) setName(displayName || "");
      })
      .catch(() => {
        // Only the greeting's name is at stake; "Hi there" is a complete
        // greeting, so a failed profile read needs no interruption.
        if (!cancelled) setName("");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex w-full flex-col items-center text-center">
      <div className="mb-8 flex min-h-10 w-full items-center justify-center gap-2">
        {name === null ? (
          <div role="status" aria-label="正在加载个人信息" className="flex min-h-10 items-center gap-2">
            <span className="h-[26px] w-[26px] animate-pulse rounded bg-gray-200" />
            <span className="h-8 w-32 animate-pulse rounded bg-gray-200" />
          </div>
        ) : (
          <>
            <span data-testid="initial-linkmai-icon" className="shrink-0" aria-hidden="true">
              <LinkMaiIcon size={ICON_SIZE} />
            </span>
            <h1 className="min-w-0 font-serif text-2xl font-light leading-relaxed text-gray-900 [overflow-wrap:anywhere]">
              你好{name ? `，${name}` : ""}
            </h1>
          </>
        )}
      </div>
      <div className="flex h-5 items-center justify-center">
        <span className="flex items-center gap-1.5 text-xs font-medium text-gray-800">
          <img
            src={quickActionsIcon}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="h-3.5 w-3.5 shrink-0 object-contain"
          />
          {uiText("快捷操作")}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs">
        {quickActions
          .filter((action) => action.enabled)
          .map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => onSelect(action)}
              className="inline-flex h-8 items-center justify-center rounded-full border border-white/70 bg-white/55 px-3 font-medium text-gray-600 shadow-[0_3px_9px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.86),inset_0_-1px_0_rgba(255,255,255,0.58)] transition-all hover:bg-white hover:text-gray-900 active:scale-[0.98]"
            >
              {quickActionDisplayName(action)}
            </button>
          ))}
      </div>
    </div>
  );
}
