import { GoogleIconUI } from "../src/GoogleIconUI";
import { LINKMAI_ICON_TINTS, LinkMaiIcon } from "../src/LinkMaiIconUI";

const meta = { title: "Shared UI / BrandIcons" };
export default meta;

export const LinkMaiStates = () => (
    <div className="flex items-end gap-6 text-xs text-gray-500">
        <span className="flex flex-col items-center gap-2">
            <LinkMaiIcon size={32} /> Default
        </span>
        <span className="flex flex-col items-center gap-2">
            <LinkMaiIcon size={32} spin /> Working
        </span>
        <span className="flex flex-col items-center gap-2">
            <LinkMaiIcon size={32} done /> Done
        </span>
        <span className="flex flex-col items-center gap-2">
            <LinkMaiIcon size={32} error /> Error
        </span>
    </div>
);

export const LinkMaiTints = () => (
    <div className="flex items-end gap-6 text-xs text-gray-500">
        {LINKMAI_ICON_TINTS.map((tint, i) => (
            <span key={tint} className="flex flex-col items-center gap-2">
                <LinkMaiIcon size={32} tint={tint} spin={i === 0} /> {tint}
            </span>
        ))}
    </div>
);

export const Google = () => (
    <span className="flex items-center gap-2 text-sm text-gray-700">
        <GoogleIconUI className="h-8 w-8" />
        Google
    </span>
);
