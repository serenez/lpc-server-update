export interface EditorSelectionCandidate {
    id: string;
    isFile: boolean;
}

export function choosePreferredVisibleEditor<T extends EditorSelectionCandidate>(
    activeEditor: T | undefined,
    visibleEditors: readonly T[],
    lastActiveEditorId?: string
): T | undefined {
    if (activeEditor?.isFile) {
        return activeEditor;
    }

    if (lastActiveEditorId) {
        const matchedVisibleEditor = visibleEditors.find(
            editor => editor.isFile && editor.id === lastActiveEditorId
        );
        if (matchedVisibleEditor) {
            return matchedVisibleEditor;
        }
    }

    return visibleEditors.find(editor => editor.isFile);
}
