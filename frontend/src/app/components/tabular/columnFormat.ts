
import { uiText } from "@mike/client";
import type { LucideIcon } from "lucide-react";
import { AlignLeft, List, Hash, DollarSign, ToggleLeft, Calendar, Tag, Percent, Banknote } from "lucide-react";
import type { ColumnFormat } from "../shared/types";

export const FORMAT_OPTIONS: Array<{ value: ColumnFormat; label: string; icon: LucideIcon; iconClassName: string }> = [
    { value: "text",            label: uiText("Free Text"),       icon: AlignLeft,  iconClassName: "text-sky-500"     },
    { value: "bulleted_list",   label: uiText("Bulleted list"),   icon: List,       iconClassName: "text-indigo-500"  },
    { value: "number",          label: uiText("Number"),          icon: Hash,       iconClassName: "text-violet-500"  },
    { value: "percentage",      label: uiText("Percentage"),      icon: Percent,    iconClassName: "text-fuchsia-500" },
    { value: "monetary_amount", label: uiText("Monetary Amount"), icon: Banknote,   iconClassName: "text-emerald-600" },
    { value: "currency",        label: uiText("Currency"),        icon: DollarSign, iconClassName: "text-teal-600"    },
    { value: "yes_no",          label: uiText("Yes / No"),        icon: ToggleLeft, iconClassName: "text-amber-500"   },
    { value: "date",            label: uiText("Date"),            icon: Calendar,   iconClassName: "text-rose-500"    },
    { value: "tag",             label: uiText("Tags"),            icon: Tag,        iconClassName: "text-orange-500"  },
];

export function formatLabel(format: ColumnFormat): string {
    return FORMAT_OPTIONS.find((o) => o.value === format)?.label ?? uiText("Text");
}

export function formatIcon(format: ColumnFormat): LucideIcon {
    return FORMAT_OPTIONS.find((o) => o.value === format)?.icon ?? AlignLeft;
}

export function formatIconClassName(format: ColumnFormat): string {
    return FORMAT_OPTIONS.find((o) => o.value === format)?.iconClassName ?? "text-sky-500";
}
