type DragTypes = Pick<DataTransfer, "types">;

export function isDocumentViewerDrag(dataTransfer: DragTypes): boolean {
    return (
        isExternalFileDrag(dataTransfer) ||
        dataTransfer.types.includes("application/linkmai-doc") ||
        dataTransfer.types.includes("application/linkmai-docs")
    );
}

export function isProjectItemDrag({ types }: DragTypes): boolean {
    return (
        types.includes("application/linkmai-doc") ||
        types.includes("application/linkmai-folder")
    );
}

export function isExternalFileDrag({ types }: DragTypes): boolean {
    return types.includes("Files");
}

export function isChatAttachmentDrag(dataTransfer: DragTypes): boolean {
    return (
        isExternalFileDrag(dataTransfer) ||
        dataTransfer.types.includes("application/linkmai-doc")
    );
}
