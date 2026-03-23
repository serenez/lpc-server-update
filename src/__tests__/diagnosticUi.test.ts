import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { shouldRevealProblemsPanel, type ProblemsAutoRevealMode } from '../utils/diagnosticUi';

test('shouldRevealProblemsPanel never mode hides all diagnostics', () => {
    const mode: ProblemsAutoRevealMode = 'never';
    assert.equal(shouldRevealProblemsPanel(mode, 'error'), false);
    assert.equal(shouldRevealProblemsPanel(mode, 'warning'), false);
});

test('shouldRevealProblemsPanel error mode reveals only errors', () => {
    const mode: ProblemsAutoRevealMode = 'error';
    assert.equal(shouldRevealProblemsPanel(mode, 'error'), true);
    assert.equal(shouldRevealProblemsPanel(mode, 'warning'), false);
});

test('shouldRevealProblemsPanel errorOrWarning mode reveals both severities', () => {
    const mode: ProblemsAutoRevealMode = 'errorOrWarning';
    assert.equal(shouldRevealProblemsPanel(mode, 'error'), true);
    assert.equal(shouldRevealProblemsPanel(mode, 'warning'), true);
});
