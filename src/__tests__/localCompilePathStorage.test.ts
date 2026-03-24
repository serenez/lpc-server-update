import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { normalizeWorkspaceStoredPath } from '../utils/localCompilePathStorage';

test('normalizeWorkspaceStoredPath converts workspace absolute path to relative path', () => {
    assert.equal(
        normalizeWorkspaceStoredPath(
            'C:/Users/vrustx/Desktop/mud_nextB',
            'C:/Users/vrustx/Desktop/mud_nextB/duobao/config.ini'
        ),
        'duobao/config.ini'
    );
});

test('normalizeWorkspaceStoredPath keeps already relative path unchanged', () => {
    assert.equal(
        normalizeWorkspaceStoredPath(
            'C:/Users/vrustx/Desktop/mud_nextB',
            'duobao/fluffos64/lpcc.exe'
        ),
        'duobao/fluffos64/lpcc.exe'
    );
});

test('normalizeWorkspaceStoredPath keeps external absolute path unchanged', () => {
    assert.equal(
        normalizeWorkspaceStoredPath(
            'C:/Users/vrustx/Desktop/mud_nextB',
            'D:/shared/tools/lpcc.exe'
        ),
        'D:/shared/tools/lpcc.exe'
    );
});
