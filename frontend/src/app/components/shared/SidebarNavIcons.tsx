"use client";

import type { ComponentType } from "react";
import {
    BookOpenText,
    FileText,
    Folder,
    ListChecks,
    MessageCircle,
    Table2,
    Workflow,
    type LucideProps,
} from "lucide-react";

/**
 * The sidebar's navigation marks: one rounded line icon per destination,
 * drawn in the current text colour so a row reads black on the light theme
 * and inverts with it. They sit beside a text label, so they stay decorative
 * and take a single stroke weight at any size.
 */
const STROKE = 1.75;

function mark(Icon: ComponentType<LucideProps>) {
    return function NavMark(props: LucideProps) {
        return (
            <Icon
                aria-hidden="true"
                focusable="false"
                strokeWidth={STROKE}
                {...props}
            />
        );
    };
}

export const AssistantNavIcon = mark(MessageCircle);
export const WorkspaceNavIcon = mark(FileText);
export const ProjectsNavIcon = mark(Folder);
export const LibraryNavIcon = mark(BookOpenText);
export const ReviewNavIcon = mark(Table2);
export const WorkflowNavIcon = mark(Workflow);
export const RulesNavIcon = mark(ListChecks);
