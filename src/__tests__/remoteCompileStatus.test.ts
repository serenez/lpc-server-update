import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { isRemoteCompileSuccessMessage } from '../utils/remoteCompileStatus';

test('recognizes protocol style compile success message', () => {
    assert.equal(isRemoteCompileSuccessMessage('编译成功'), true);
});

test('recognizes update completion message with file path', () => {
    assert.equal(
        isRemoteCompileSuccessMessage('重新编译 /cmds/wiz/testcmd.c 完毕'),
        true
    );
    assert.equal(
        isRemoteCompileSuccessMessage('重新编译 /cmds/wiz/testcmd.c：成功！'),
        true
    );
    assert.equal(
        isRemoteCompileSuccessMessage('015重新编译 /cmds/wiz/testcmd.c: 成功!'),
        true
    );
    assert.equal(
        isRemoteCompileSuccessMessage('重新编译 /cmds/wiz/testcmd.c：成功！>'),
        true
    );
});

test('does not treat compile failure text as success', () => {
    assert.equal(
        isRemoteCompileSuccessMessage('重新编译 /cmds/wiz/testcmd.c：发生错误:'),
        false
    );
    assert.equal(
        isRemoteCompileSuccessMessage('编译/载入失败: /cmds/wiz/testcmd'),
        false
    );
    assert.equal(isRemoteCompileSuccessMessage('角色登录成功'), false);
});
