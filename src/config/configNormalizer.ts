export interface NormalizerProfile {
    name?: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    rootPath?: string;
    serverKey?: string;
    encoding?: 'UTF8' | 'GBK';
    loginKey?: string;
    loginWithEmail?: boolean;
    compile?: {
        defaultDir?: string;
        autoCompileOnSave?: boolean;
        timeout?: number;
        showDetails?: boolean;
    };
    connection?: {
        timeout?: number;
        maxRetries?: number;
        retryInterval?: number;
        heartbeatInterval?: number;
    };
    [key: string]: unknown;
}

export interface NormalizerConfigV2 {
    version: number;
    activeProfile: string;
    profiles: Record<string, NormalizerProfile>;
    customCommands?: unknown[];
    customEvals?: unknown[];
    favoriteFiles?: unknown[];
    [key: string]: unknown;
}

export interface NormalizerResult {
    config: NormalizerConfigV2;
    migrated: boolean;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function ensureProfileName(profile: NormalizerProfile, fallbackName = '默认配置'): void {
    if (!profile.name) {
        profile.name = fallbackName;
    }
}

function getFirstProfileId(profiles: Record<string, NormalizerProfile>): string {
    const ids = Object.keys(profiles);
    return ids.length > 0 ? ids[0] : 'default';
}

function pickTopLevelCustomData(source: Record<string, unknown> | null | undefined): Partial<NormalizerConfigV2> {
    if (!source) {
        return {};
    }

    const next: Partial<NormalizerConfigV2> = {};
    if (Array.isArray(source.customCommands)) {
        next.customCommands = source.customCommands;
    }
    if (Array.isArray(source.customEvals)) {
        next.customEvals = source.customEvals;
    }
    if (Array.isArray(source.favoriteFiles)) {
        next.favoriteFiles = source.favoriteFiles;
    }
    return next;
}

function omitTopLevelCustomData(profile: NormalizerProfile): NormalizerProfile {
    const {
        customCommands: _customCommands,
        customEvals: _customEvals,
        favoriteFiles: _favoriteFiles,
        ...rest
    } = profile;
    void _customCommands;
    void _customEvals;
    void _favoriteFiles;
    return rest;
}

export function normalizeConfigToV2(rawConfig: unknown): NormalizerResult {
    if (!isObject(rawConfig)) {
        return {
            config: {
                version: 2,
                activeProfile: 'default',
                profiles: { default: { name: '默认配置' } }
            },
            migrated: true
        };
    }

    // 恢复历史误迁移：v2 被包进 profiles.default
    const maybeDefault = isObject(rawConfig.profiles) && isObject(rawConfig.profiles.default)
        ? rawConfig.profiles.default
        : null;
    if (
        isObject(maybeDefault) &&
        isObject(maybeDefault.profiles) &&
        typeof maybeDefault.activeProfile === 'string'
    ) {
        const unwrappedProfiles = maybeDefault.profiles as Record<string, NormalizerProfile>;
        const activeProfile = unwrappedProfiles[maybeDefault.activeProfile as string]
            ? (maybeDefault.activeProfile as string)
            : getFirstProfileId(unwrappedProfiles);
        const fixed: NormalizerConfigV2 = {
            version: 2,
            activeProfile,
            profiles: unwrappedProfiles,
            ...pickTopLevelCustomData(rawConfig),
            ...pickTopLevelCustomData(maybeDefault)
        };
        Object.entries(fixed.profiles).forEach(([id, profile]) => ensureProfileName(profile, id));
        return { config: fixed, migrated: true };
    }

    // v2 或 v2-like（缺失 version）
    if (isObject(rawConfig.profiles)) {
        const profiles = rawConfig.profiles as Record<string, NormalizerProfile>;
        const activeProfileRaw = typeof rawConfig.activeProfile === 'string' ? rawConfig.activeProfile : 'default';
        const activeProfile = profiles[activeProfileRaw] ? activeProfileRaw : getFirstProfileId(profiles);
        const hasVersion2 = typeof rawConfig.version === 'number' && rawConfig.version >= 2;
        const fixed: NormalizerConfigV2 = {
            version: 2,
            activeProfile,
            profiles,
            ...pickTopLevelCustomData(rawConfig)
        };
        Object.entries(fixed.profiles).forEach(([id, profile]) => ensureProfileName(profile, id));
        return { config: fixed, migrated: !hasVersion2 || activeProfileRaw !== activeProfile };
    }

    // 旧版单配置
    const profile: NormalizerProfile = omitTopLevelCustomData({ ...rawConfig });
    ensureProfileName(profile, '默认配置');
    return {
        config: {
            version: 2,
            activeProfile: 'default',
            profiles: { default: profile },
            ...pickTopLevelCustomData(rawConfig)
        },
        migrated: true
    };
}
