export type LocalCompileAssetResolutionAction =
    | 'useConfigured'
    | 'useDetected'
    | 'chooseDetected'
    | 'prompt'
    | 'skip';

export interface DecideLocalCompileAssetResolutionOptions {
    hasConfiguredPath: boolean;
    hasValidConfiguredPath: boolean;
    detectedCount: number;
    allowPrompt: boolean;
}

export function decideLocalCompileAssetResolution(
    options: DecideLocalCompileAssetResolutionOptions
): LocalCompileAssetResolutionAction {
    if (options.hasConfiguredPath && options.hasValidConfiguredPath) {
        return 'useConfigured';
    }

    if (options.hasConfiguredPath && !options.allowPrompt) {
        return 'skip';
    }

    if (options.detectedCount === 1) {
        return 'useDetected';
    }

    if (options.detectedCount > 1) {
        return options.allowPrompt ? 'chooseDetected' : 'skip';
    }

    return options.allowPrompt ? 'prompt' : 'skip';
}
