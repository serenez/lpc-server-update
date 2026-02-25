export type UpdateTarget = 'workspace' | 'global';

export interface UpdateWriter {
    update(fullKey: string, value: unknown, target: UpdateTarget): Promise<void>;
}

export async function updateSettingWithFallback(
    writer: UpdateWriter,
    fullKey: string,
    value: unknown
): Promise<UpdateTarget> {
    const targets: UpdateTarget[] = ['workspace', 'global'];
    let lastError: unknown;

    for (const target of targets) {
        try {
            await writer.update(fullKey, value, target);
            return target;
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
