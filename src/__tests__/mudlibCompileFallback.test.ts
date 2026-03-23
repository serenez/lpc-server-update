import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
    createMudlibCompileFallbackState,
    consumeMudlibCompileFallbackLine
} from '../utils/mudlibCompileFallback';

test('mudlib fallback parses location and reason into one diagnostic', () => {
    let state = createMudlibCompileFallbackState();

    let result = consumeMudlibCompileFallbackLine('编译/载入失败: /cmds/wiz/testcmd', state);
    assert.equal(result.consumed, true);
    state = result.nextState;

    result = consumeMudlibCompileFallbackLine('/cmds/wiz/testcmd.c 第 584 行，第 16 列', state);
    assert.equal(result.consumed, false);

    result = consumeMudlibCompileFallbackLine(
        '编译位置: /cmds/wiz/testcmd.c 第 584 行，第 16 列',
        state
    );
    assert.equal(result.consumed, true);
    assert.equal(result.emittedDiagnostic?.file, '/cmds/wiz/testcmd.c');
    assert.equal(result.emittedDiagnostic?.line, 584);
    assert.equal(result.emittedDiagnostic?.column, 16);
    state = result.nextState;

    result = consumeMudlibCompileFallbackLine(
        "编译原因: syntax error, unexpected L_DEFINED_NAME, expecting L_ASSIGN or ';' or ':'",
        state
    );
    assert.equal(result.consumed, true);
    assert.deepEqual(result.emittedDiagnostic, {
        file: '/cmds/wiz/testcmd.c',
        line: 584,
        column: 16,
        severity: 'error',
        kind: 'syntax',
        message: "syntax error, unexpected L_DEFINED_NAME, expecting L_ASSIGN or ';' or ':'"
    });
});

test('mudlib fallback suppresses source and stack trace noise after reason', () => {
    let state = createMudlibCompileFallbackState();

    for (const line of [
        '编译位置: /cmds/wiz/testcmd.c 第 584 行，第 16 列',
        '编译原因: syntax error, unexpected identifier',
        '源码片段:',
        'mapping bsd',
        '说明：下面是触发这次编译/载入失败的调用链，不是真实编译错误位置。',
        '触发链:',
        '1. /feature/command.c 的 command_hook() 第 52 行',
        '重新编译 /cmds/wiz/testcmd.c：发生错误:'
    ]) {
        const result = consumeMudlibCompileFallbackLine(line, state);
        assert.equal(result.consumed, true);
        state = result.nextState;
    }

    const finalResult = consumeMudlibCompileFallbackLine('普通服务器消息', state);
    assert.equal(finalResult.consumed, false);
});
