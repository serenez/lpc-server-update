import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { updateSettingWithFallback, type UpdateTarget, type UpdateWriter } from '../utils/configUpdateFallback';

test('updateSettingWithFallback falls back when workspace target fails', async () => {
    const attempts: UpdateTarget[] = [];
    const writer: UpdateWriter = {
        async update(fullKey, value, target) {
            assert.equal(fullKey, 'gameServerCompiler.messages.showRawData');
            assert.equal(value, true);
            attempts.push(target);
            if (target === 'workspace') {
                throw new Error('没有注册配置 games');
            }
        }
    };

    const usedTarget = await updateSettingWithFallback(writer, 'gameServerCompiler.messages.showRawData', true);

    assert.equal(usedTarget, 'global');
    assert.deepEqual(attempts, ['workspace', 'global']);
});

test('updateSettingWithFallback throws when all targets fail', async () => {
    const writer: UpdateWriter = {
        async update() {
            throw new Error('write failed');
        }
    };

    await assert.rejects(
        updateSettingWithFallback(writer, 'gameServerCompiler.messages.showRawData', false),
        /write failed/
    );
});
