export interface CompileState {
    connected: boolean;
    loggedIn: boolean;
}

export interface CompileCheckResult {
    ok: boolean;
    reason?: string;
}

export function checkCompilePreconditions(
    state: CompileState,
    filePath?: string
): CompileCheckResult {
    if (!state.connected || !state.loggedIn) {
        return { ok: false, reason: '请先连接服务器并确保角色已登录' };
    }

    if (!filePath) {
        return { ok: false, reason: '没有打开的文件' };
    }

    if (!(filePath.endsWith('.c') || filePath.endsWith('.lpc'))) {
        return { ok: false, reason: '只能编译.c或.lpc文件' };
    }

    return { ok: true };
}
