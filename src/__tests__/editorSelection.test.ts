import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { choosePreferredVisibleEditor } from '../utils/editorSelection';

type MockEditor = {
    id: string;
    isFile: boolean;
};

test('choosePreferredVisibleEditor prefers active file editor', () => {
    const visibleEditors: MockEditor[] = [
        { id: 'file-a', isFile: true },
        { id: 'file-b', isFile: true }
    ];

    const selected = choosePreferredVisibleEditor(
        visibleEditors[1],
        visibleEditors,
        'file-a'
    );

    assert.equal(selected?.id, 'file-b');
});

test('choosePreferredVisibleEditor falls back to last active visible file editor', () => {
    const visibleEditors: MockEditor[] = [
        { id: 'file-a', isFile: true },
        { id: 'file-b', isFile: true }
    ];

    const selected = choosePreferredVisibleEditor(
        undefined,
        visibleEditors,
        'file-b'
    );

    assert.equal(selected?.id, 'file-b');
});

test('choosePreferredVisibleEditor ignores non-file active editor and chooses first visible file editor', () => {
    const selected = choosePreferredVisibleEditor(
        { id: 'output', isFile: false },
        [
            { id: 'webview', isFile: false },
            { id: 'file-a', isFile: true }
        ],
        undefined
    );

    assert.equal(selected?.id, 'file-a');
});

test('choosePreferredVisibleEditor returns undefined when no visible file editor exists', () => {
    const selected = choosePreferredVisibleEditor(
        { id: 'output', isFile: false },
        [
            { id: 'webview', isFile: false },
            { id: 'output', isFile: false }
        ],
        'missing-file'
    );

    assert.equal(selected, undefined);
});
