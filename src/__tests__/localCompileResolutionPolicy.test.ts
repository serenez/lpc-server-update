import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
    decideLocalCompileAssetResolution,
    type LocalCompileAssetResolutionAction
} from '../utils/localCompileResolutionPolicy';

function expectAction(
    actual: LocalCompileAssetResolutionAction,
    expected: LocalCompileAssetResolutionAction
): void {
    assert.equal(actual, expected);
}

test('decideLocalCompileAssetResolution keeps valid configured path', () => {
    expectAction(
        decideLocalCompileAssetResolution({
            hasConfiguredPath: true,
            hasValidConfiguredPath: true,
            detectedCount: 3,
            allowPrompt: false
        }),
        'useConfigured'
    );
});

test('decideLocalCompileAssetResolution skips invalid configured path during quiet auto save', () => {
    expectAction(
        decideLocalCompileAssetResolution({
            hasConfiguredPath: true,
            hasValidConfiguredPath: false,
            detectedCount: 1,
            allowPrompt: false
        }),
        'skip'
    );
});

test('decideLocalCompileAssetResolution uses the only detected path when nothing is configured', () => {
    expectAction(
        decideLocalCompileAssetResolution({
            hasConfiguredPath: false,
            hasValidConfiguredPath: false,
            detectedCount: 1,
            allowPrompt: false
        }),
        'useDetected'
    );
});

test('decideLocalCompileAssetResolution skips ambiguous auto save detection', () => {
    expectAction(
        decideLocalCompileAssetResolution({
            hasConfiguredPath: false,
            hasValidConfiguredPath: false,
            detectedCount: 2,
            allowPrompt: false
        }),
        'skip'
    );
});

test('decideLocalCompileAssetResolution asks manual command to choose among multiple detected paths', () => {
    expectAction(
        decideLocalCompileAssetResolution({
            hasConfiguredPath: false,
            hasValidConfiguredPath: false,
            detectedCount: 2,
            allowPrompt: true
        }),
        'chooseDetected'
    );
});

test('decideLocalCompileAssetResolution falls back to prompt when nothing is available in manual mode', () => {
    expectAction(
        decideLocalCompileAssetResolution({
            hasConfiguredPath: false,
            hasValidConfiguredPath: false,
            detectedCount: 0,
            allowPrompt: true
        }),
        'prompt'
    );
});
