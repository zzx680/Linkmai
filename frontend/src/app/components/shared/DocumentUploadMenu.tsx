"use client";

import { uiText } from "@linkmai/client";

import { Cloud, FolderUp, Upload } from "lucide-react";
import {
    Dropdown,
    DropdownContent,
    DropdownItem,
    DropdownTrigger,
    HeaderButtonUI,
    TabPillButtonUI,
} from "@linkmai/ui";

interface DocumentUploadMenuProps {
    onSavedFiles?: (() => void) | null;
    onUploadFiles: (() => void) | null;
    onUploadFolder?: (() => void) | null;
    disabled?: boolean;
    toolbar?: boolean;
}

export function DocumentUploadMenu({
    onSavedFiles,
    onUploadFiles,
    onUploadFolder,
    disabled = false,
    toolbar = false,
}: DocumentUploadMenuProps) {
    const TriggerButton = toolbar ? TabPillButtonUI : HeaderButtonUI;
    const triggerDisabled =
        disabled || (!onSavedFiles && !onUploadFiles && !onUploadFolder);

    return (
        <Dropdown>
            <DropdownTrigger asChild>
                <TriggerButton
                    disabled={triggerDisabled}
                    title={uiText("Upload")}
                    aria-label={uiText("Upload")}
                    {...(toolbar ? { className: "pl-2" } : { iconOnly: true })}
                >
                    <Upload aria-hidden="true" className="h-3.5 w-3.5" />
                    {toolbar && uiText("Upload")}
                </TriggerButton>
            </DropdownTrigger>
            <DropdownContent
                align="end"
                className="min-w-40 p-1"
            >
                {onSavedFiles !== undefined && (
                    <DropdownItem
                        disabled={disabled || !onSavedFiles}
                        onSelect={() => onSavedFiles?.()}
                        className="flex items-center px-3 py-2"
                    >
                        <Cloud className="mr-2 h-3.5 w-3.5" />
                        {uiText("Saved Documents")}
                    </DropdownItem>
                )}
                <DropdownItem
                    disabled={disabled || !onUploadFiles}
                    onSelect={() => onUploadFiles?.()}
                    className="flex items-center px-3 py-2"
                >
                    <Upload className="mr-2 h-3.5 w-3.5" />
                    {uiText("Upload Documents")}
                </DropdownItem>
                {onUploadFolder !== undefined && (
                    <DropdownItem
                        disabled={disabled || !onUploadFolder}
                        onSelect={() => onUploadFolder?.()}
                        className="flex items-center px-3 py-2"
                    >
                        <FolderUp className="mr-2 h-3.5 w-3.5" />
                        {uiText("Upload folder")}
                    </DropdownItem>
                )}
            </DropdownContent>
        </Dropdown>
    );
}
