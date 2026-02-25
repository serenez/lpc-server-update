import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { checkCompilePreconditions } from '../utils/CompilePreconditions';

test('checkCompilePreconditions blocks when not connected', () => {
    const result = checkCompilePreconditions({ connected: false, loggedIn: false }, '/cmds/a.c');
    assert.equal(result.ok, false);
    assert.equal(result.reason, '请先连接服务器并确保角色已登录');
});

test('checkCompilePreconditions blocks unsupported file extension', () => {
    const result = checkCompilePreconditions({ connected: true, loggedIn: true }, '/cmds/a.txt');
    assert.equal(result.ok, false);
    assert.equal(result.reason, '只能编译.c或.lpc文件');
});

test('checkCompilePreconditions passes for lpc source file', () => {
    const result = checkCompilePreconditions({ connected: true, loggedIn: true }, '/cmds/a.lpc');
    assert.equal(result.ok, true);
});
