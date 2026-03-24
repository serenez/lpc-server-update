const REMOTE_COMPILE_FAILURE_MARKERS = [
    '编译/载入失败',
    '编译失败',
    '载入失败',
    '发生错误'
];

export function isRemoteCompileSuccessMessage(message: string): boolean {
    const trimmed = message.trim();
    if (!trimmed) {
        return false;
    }

    if (REMOTE_COMPILE_FAILURE_MARKERS.some(marker => trimmed.includes(marker))) {
        return false;
    }

    if (trimmed.includes('编译成功') || trimmed.includes('成功编译')) {
        return true;
    }

    if (trimmed.includes('重新编译')) {
        return trimmed.includes('成功') || trimmed.includes('完毕');
    }

    return false;
}
