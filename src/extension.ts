import * as vscode from 'vscode';
import * as fs from 'fs';
import * as nodePath from 'path';
import { execFile, type ExecFileException } from 'child_process';
import { TcpClient } from './tcpClient';
import { MessageProvider } from './messageProvider';
import { ButtonProvider } from './buttonProvider';
import { LogManager } from './log/LogManager';
import { ConfigManager } from './config/ConfigManager';
import { PathConverter } from './utils/PathConverter';
import { checkCompilePreconditions } from './utils/CompilePreconditions';
import { shouldAutoDeclareForFile, updateAutoDeclarations } from './utils/AutoDeclaration';
import {
    formatCompilerDiagnosticSummary,
    type CompilerDiagnosticFormatOptions,
    type CompilerDiagnostic,
    type CompilerDiagnosticSeverity
} from './utils/compilerDiagnostics';
import { shouldRevealProblemsPanel, type ProblemsAutoRevealMode } from './utils/diagnosticUi';
import {
    clearMudlibLocalCompileArtifactsCache,
    discoverMudlibLocalCompileArtifacts,
    discoverMudlibLocalCompileArtifactsCached,
    resolveMudlibLocalCompilePlan,
    type LocalLpccSettings,
    type MudlibLocalCompilePlan
} from './utils/localLpcc';
import {
    filterLocalCompileDiagnostics,
    orderLocalCompileDiagnosticsForTimeline,
    parseLocalCompileDiagnostics,
    partitionLocalCompileDiagnostics,
    pickPrimaryLocalCompileDiagnostic
} from './utils/localCompileDiagnostics';
import {
    createFileLineTextResolver,
    resolveDiagnosticRange
} from './utils/diagnosticRange';
import {
    describeCompilerDiagnosticMessageLanguage,
    formatCompilerDiagnosticMessage,
    normalizeCompilerDiagnosticMessageLanguage,
    type CompilerDiagnosticMessageLanguage
} from './utils/compilerDiagnosticLocalization';
import {
    buildCompileOutputSessionLines,
    type CompileOutputDiagnosticSummary
} from './utils/compileOutput';
import { normalizeWorkspaceStoredPath } from './utils/localCompilePathStorage';
import { decideLocalCompileAssetResolution } from './utils/localCompileResolutionPolicy';
import { choosePreferredVisibleEditor } from './utils/editorSelection';

let tcpClient: TcpClient;
let messageProvider: MessageProvider;
let buttonProvider: ButtonProvider;
let configManager: ConfigManager;
let localCompileOutputChannel: vscode.OutputChannel;
let localCompileDiagnosticCollection: vscode.DiagnosticCollection;
const skipNextAutoLocalCompileForFile = new Set<string>();
let lastKnownFileEditorUri: string | undefined;

interface Config {
    host: string;
    port: number;
    username: string;
    password: string;
    rootPath: string;
    serverKey: string;
    encoding: string;
    loginKey: string;
    compile: {
        defaultDir: string;
        autoCompileOnSave: boolean;
        timeout: number;
        showDetails: boolean;
    };
    loginWithEmail?: boolean;
}

interface MudPathResolution {
    mudPath: string;
    usedRootPath: string;
}

interface LocalCompileSettings extends LocalLpccSettings {
    timeout: number;
    showWarnings: boolean;
    autoCompileOnSave: boolean;
    messageLanguage: CompilerDiagnosticMessageLanguage;
}

interface LocalCompileProcessResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}

interface LocalCompileCommandContext {
    workspaceRoot: string;
    mudlibRoot: string;
    filePath?: string;
}

interface LocalCompileAssetDescriptor {
    kind: 'lpcc' | 'config';
    displayName: string;
    settingKey: 'gameServerCompiler.localCompile.lpccPath' | 'gameServerCompiler.localCompile.configPath';
    detectedPaths: string[];
    configuredPath?: string;
}

interface LocalCompileDisplayState {
    lpccPathLabel: string;
    configPathLabel: string;
    showWarnings: boolean;
    autoCompileOnSave: boolean;
    messageLanguageLabel: string;
}

interface ResolveLocalCompilePlanOptions {
    allowPrompt: boolean;
}

type LocalCompileTrigger = 'manual' | 'autoSave';

interface ExecuteLocalCompileOptions extends ResolveLocalCompilePlanOptions {
    trigger: LocalCompileTrigger;
}

class LocalCompileProcessError extends Error {
    stdout: string;
    stderr: string;
    exitCode: number | null;

    constructor(message: string, stdout: string, stderr: string, exitCode: number | null) {
        super(message);
        this.stdout = stdout;
        this.stderr = stderr;
        this.exitCode = exitCode;
    }
}

// 修改路径转换方法
async function resolveMudPath(fullPath: string): Promise<MudPathResolution> {
    const config = configManager.getConfig();
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
    try {
        return PathConverter.resolveMudPathAutoRoot(
            fullPath,
            workspaceRoot,
            config.rootPath
        );
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(detail);
    }
}

async function convertToMudPath(fullPath: string): Promise<string> {
    const resolved = await resolveMudPath(fullPath);
    return resolved.mudPath;
}

// 检查文件是否可编译
function isCompilableFile(filePath: string): boolean {
    return filePath.endsWith('.c') || filePath.endsWith('.lpc');
}

function isFileEditor(editor: vscode.TextEditor | undefined): editor is vscode.TextEditor {
    return !!editor && editor.document.uri.scheme === 'file';
}

function getEditorIdentity(editor: vscode.TextEditor): string {
    return editor.document.uri.toString();
}

function rememberFileEditor(editor: vscode.TextEditor | undefined): void {
    if (isFileEditor(editor)) {
        lastKnownFileEditorUri = getEditorIdentity(editor);
    }
}

function getPreferredFileEditor(): vscode.TextEditor | undefined {
    const activeEditor = vscode.window.activeTextEditor;
    const preferredEditor = choosePreferredVisibleEditor(
        isFileEditor(activeEditor)
            ? {
                editor: activeEditor,
                id: getEditorIdentity(activeEditor),
                isFile: true
            }
            : undefined,
        vscode.window.visibleTextEditors.map(editor => ({
            editor,
            id: getEditorIdentity(editor),
            isFile: isFileEditor(editor)
        })),
        lastKnownFileEditorUri
    );

    const resolvedEditor = preferredEditor?.editor;
    if (resolvedEditor) {
        rememberFileEditor(resolvedEditor);
    }
    return resolvedEditor;
}

function getWorkspaceRoot(): string {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
    if (!workspaceRoot) {
        throw new Error('未找到工作区目录');
    }
    return workspaceRoot;
}

function getLocalCompileSettings(): LocalCompileSettings {
    const config = vscode.workspace.getConfiguration('gameServerCompiler');
    const lpccPath = config.inspect<string>('localCompile.lpccPath')?.workspaceValue;
    const configPath = config.inspect<string>('localCompile.configPath')?.workspaceValue;
    const showWarnings = config.inspect<boolean>('localCompile.showWarnings')?.workspaceValue;
    const autoCompileOnSave = config.inspect<boolean>('localCompile.autoCompileOnSave')?.workspaceValue;
    const messageLanguage = normalizeCompilerDiagnosticMessageLanguage(
        config.get<string>('diagnostics.messageLanguage', 'dual')
    );

    return {
        lpccPath: typeof lpccPath === 'string' ? lpccPath.trim() : '',
        configPath: typeof configPath === 'string' ? configPath.trim() : '',
        timeout: config.get<number>('localCompile.timeout', 30000),
        showWarnings: showWarnings ?? true,
        autoCompileOnSave: autoCompileOnSave ?? false,
        messageLanguage
    };
}

function getCompilerDiagnosticFormatOptions(): CompilerDiagnosticFormatOptions {
    return {
        languageMode: getLocalCompileSettings().messageLanguage
    };
}

function resolveConfiguredSettingPath(workspaceRoot: string, rawPath: string): string {
    return nodePath.resolve(nodePath.isAbsolute(rawPath) ? rawPath : nodePath.join(workspaceRoot, rawPath));
}

function isPathInsideMudlibRoot(mudlibRoot: string, targetPath: string): boolean {
    const relativePath = nodePath.relative(mudlibRoot, targetPath);
    return !relativePath.startsWith('..') && !nodePath.isAbsolute(relativePath);
}

function summarizeLocalCompileError(stderr: string, stdout: string): string {
    const candidate = [stderr, stdout]
        .flatMap(section => section.split(/\r?\n/))
        .map(line => line.trim())
        .find(line => line.length > 0);
    return candidate ?? '未返回错误详情';
}

function toWorkspaceStoredPath(workspaceRoot: string, selectedPath: string): string {
    return normalizeWorkspaceStoredPath(workspaceRoot, selectedPath);
}

async function persistLocalCompileSetting(fullKey: string, value: unknown): Promise<void> {
    await vscode.workspace.getConfiguration().update(fullKey, value, vscode.ConfigurationTarget.Workspace);
    buttonProvider?.refreshViewState();
}

async function normalizeStoredLocalCompilePathsIfNeeded(workspaceRoot: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('gameServerCompiler');
    const pathKeys = [
        'localCompile.lpccPath',
        'localCompile.configPath'
    ] as const;

    for (const key of pathKeys) {
        const storedValue = config.inspect<string>(key)?.workspaceValue;
        if (typeof storedValue !== 'string' || !storedValue.trim()) {
            continue;
        }

        const normalized = normalizeWorkspaceStoredPath(workspaceRoot, storedValue);
        if (normalized !== storedValue) {
            await vscode.workspace
                .getConfiguration()
                .update(`gameServerCompiler.${key}`, normalized, vscode.ConfigurationTarget.Workspace);
        }
    }
}

function getLocalCompileAssetRelativePath(mudlibRoot: string, filePath: string): string {
    return nodePath.relative(mudlibRoot, filePath).replace(/\\/g, '/');
}

function formatLocalCompileStoredPathLabel(rawPath: string, workspaceRoot: string): string {
    if (!rawPath) {
        return '自动扫描';
    }

    const resolvedPath = resolveConfiguredSettingPath(workspaceRoot, rawPath);
    if (!fs.existsSync(resolvedPath)) {
        return `无效: ${rawPath}`;
    }

    const mudlibRoot = PathConverter.findMudProjectRootFromFile(resolvedPath);
    if (mudlibRoot && isPathInsideMudlibRoot(mudlibRoot, resolvedPath)) {
        return getLocalCompileAssetRelativePath(mudlibRoot, resolvedPath);
    }

    const relativePath = nodePath.relative(workspaceRoot, resolvedPath);
    if (!relativePath.startsWith('..') && !nodePath.isAbsolute(relativePath)) {
        return relativePath.replace(/\\/g, '/');
    }

    return rawPath;
}

function getLocalCompileDisplayState(): LocalCompileDisplayState {
    const workspaceRoot = getWorkspaceRoot();
    const settings = getLocalCompileSettings();
    return {
        lpccPathLabel: formatLocalCompileStoredPathLabel(settings.lpccPath ?? '', workspaceRoot),
        configPathLabel: formatLocalCompileStoredPathLabel(settings.configPath ?? '', workspaceRoot),
        showWarnings: settings.showWarnings,
        autoCompileOnSave: settings.autoCompileOnSave,
        messageLanguageLabel: describeCompilerDiagnosticMessageLanguage(settings.messageLanguage)
    };
}

function resolveValidLocalCompileAssetPath(
    workspaceRoot: string,
    mudlibRoot: string,
    configuredPath: string | undefined
): string | undefined {
    if (!configuredPath) {
        return undefined;
    }

    const resolvedPath = resolveConfiguredSettingPath(workspaceRoot, configuredPath);
    if (
        !fs.existsSync(resolvedPath)
        || !fs.statSync(resolvedPath).isFile()
        || !isPathInsideMudlibRoot(mudlibRoot, resolvedPath)
    ) {
        return undefined;
    }

    return resolvedPath;
}

function describeInvalidLocalCompileAssetPath(
    workspaceRoot: string,
    mudlibRoot: string,
    configuredPath: string
): string {
    const resolvedPath = resolveConfiguredSettingPath(workspaceRoot, configuredPath);
    if (!fs.existsSync(resolvedPath)) {
        return '路径不存在';
    }
    if (!fs.statSync(resolvedPath).isFile()) {
        return '路径不是文件';
    }
    if (!isPathInsideMudlibRoot(mudlibRoot, resolvedPath)) {
        return '路径不在当前 mudlib 目录内';
    }
    return '路径无效';
}

function resolveLocalCompileCommandContext(explicitFilePath?: string): LocalCompileCommandContext {
    const workspaceRoot = getWorkspaceRoot();
    const activeFilePath = getPreferredFileEditor()?.document.uri.fsPath;
    const filePath = explicitFilePath ?? activeFilePath;
    const probePaths = [
        filePath,
        activeFilePath,
        nodePath.join(workspaceRoot, 'adm', '__lpcc_probe__.c'),
        nodePath.join(workspaceRoot, 'cmds', '__lpcc_probe__.c')
    ].filter((value): value is string => !!value);

    for (const probePath of probePaths) {
        const mudlibRoot = PathConverter.findMudProjectRootFromFile(probePath);
        if (mudlibRoot) {
            return {
                workspaceRoot,
                mudlibRoot,
                filePath
            };
        }
    }

    throw new Error('请先打开当前 mudlib 项目中的文件，再选择本地 LPCC 配置');
}

async function showLocalCompileAssetSavedMessage(
    descriptor: LocalCompileAssetDescriptor,
    mudlibRoot: string,
    selectedPath: string
): Promise<void> {
    const relativePath = getLocalCompileAssetRelativePath(mudlibRoot, selectedPath);
    const message = `已保存当前项目${descriptor.displayName}: ${relativePath}`;
    messageProvider?.addMessage(message);
    vscode.window.showInformationMessage(message);
}

async function selectLocalCompileAssetForCurrentProject(
    kind: LocalCompileAssetDescriptor['kind']
): Promise<void> {
    const contextInfo = resolveLocalCompileCommandContext();
    const settings = getLocalCompileSettings();
    clearMudlibLocalCompileArtifactsCache(contextInfo.mudlibRoot);
    const artifacts = discoverMudlibLocalCompileArtifacts(contextInfo.mudlibRoot);
    const descriptor: LocalCompileAssetDescriptor = kind === 'lpcc'
        ? {
            kind,
            displayName: 'LPCC路径',
            settingKey: 'gameServerCompiler.localCompile.lpccPath',
            detectedPaths: artifacts.lpccPaths,
            configuredPath: settings.lpccPath
        }
        : {
            kind,
            displayName: '本地编译配置文件',
            settingKey: 'gameServerCompiler.localCompile.configPath',
            detectedPaths: artifacts.configPaths,
            configuredPath: settings.configPath
        };

    const currentConfiguredPath = resolveValidLocalCompileAssetPath(
        contextInfo.workspaceRoot,
        contextInfo.mudlibRoot,
        descriptor.configuredPath
    );

    if (descriptor.configuredPath && !currentConfiguredPath) {
        const reason = describeInvalidLocalCompileAssetPath(
            contextInfo.workspaceRoot,
            contextInfo.mudlibRoot,
            descriptor.configuredPath
        );
        void vscode.window.showWarningMessage(
            `当前保存的${descriptor.displayName}无效（${reason}）: ${descriptor.configuredPath}`
        );
    }

    const pathItems = descriptor.detectedPaths
        .filter(filePath => filePath !== currentConfiguredPath)
        .map(filePath => ({
            label: getLocalCompileAssetRelativePath(contextInfo.mudlibRoot, filePath),
            description: currentConfiguredPath ? '自动扫描到' : '自动扫描到，选中后保存为当前项目配置',
            detail: filePath,
            action: 'path' as const,
            filePath
        }));

    const quickPickItems = [
        ...(currentConfiguredPath
            ? [{
                label: `当前已选: ${getLocalCompileAssetRelativePath(contextInfo.mudlibRoot, currentConfiguredPath)}`,
                description: '已保存的当前项目配置',
                detail: currentConfiguredPath,
                action: 'path' as const,
                filePath: currentConfiguredPath
            }]
            : []),
        ...pathItems,
        {
            label: descriptor.kind === 'lpcc' ? '手动选择 lpcc.exe...' : '手动选择 config.ini / config.cfg...',
            description: '从当前 mudlib 目录内选择并保存',
            action: 'manual' as const
        },
        ...(currentConfiguredPath
            ? [{
                label: `清空已保存的${descriptor.displayName}`,
                description: '下次编译时重新自动扫描或再手动选择',
                action: 'clear' as const
            }]
            : [])
    ];

    const selected = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: descriptor.kind === 'lpcc'
            ? '选择当前项目使用的 lpcc.exe'
            : '选择当前项目使用的 config.ini 或 config.cfg',
        ignoreFocusOut: true
    });

    if (!selected) {
        return;
    }

    if (selected.action === 'clear') {
        clearMudlibLocalCompileArtifactsCache(contextInfo.mudlibRoot);
        await persistLocalCompileSetting(descriptor.settingKey, '');
        const message = `已清空当前项目${descriptor.displayName}`;
        messageProvider?.addMessage(message);
        vscode.window.showInformationMessage(message);
        return;
    }

    const selectedPath = selected.action === 'manual'
        ? await (descriptor.kind === 'lpcc'
            ? promptForLpccPath(contextInfo.workspaceRoot, contextInfo.mudlibRoot)
            : promptForConfigPath(contextInfo.workspaceRoot, contextInfo.mudlibRoot))
        : selected.filePath;

    if (!selectedPath) {
        return;
    }

    clearMudlibLocalCompileArtifactsCache(contextInfo.mudlibRoot);
    await persistLocalCompileSetting(
        descriptor.settingKey,
        toWorkspaceStoredPath(contextInfo.workspaceRoot, selectedPath)
    );
    await showLocalCompileAssetSavedMessage(descriptor, contextInfo.mudlibRoot, selectedPath);
}

async function toggleLocalCompileWarningsForCurrentProject(): Promise<void> {
    const { showWarnings } = getLocalCompileSettings();
    const nextValue = !showWarnings;
    await persistLocalCompileSetting('gameServerCompiler.localCompile.showWarnings', nextValue);
    const message = `当前项目本地 LPCC 警告提示已${nextValue ? '开启' : '关闭'}`;
    messageProvider?.addMessage(message);
    vscode.window.showInformationMessage(message);
}

async function toggleLocalCompileAutoCompileOnSaveForCurrentProject(): Promise<void> {
    const { autoCompileOnSave } = getLocalCompileSettings();
    const nextValue = !autoCompileOnSave;
    await persistLocalCompileSetting('gameServerCompiler.localCompile.autoCompileOnSave', nextValue);
    const message = nextValue
        ? '当前项目保存自动本地编译已开启；仅在 LPCC 和配置文件已明确可用时静默执行'
        : '当前项目保存自动本地编译已关闭';
    messageProvider?.addMessage(message);
    vscode.window.showInformationMessage(message);
}

async function selectCompilerDiagnosticMessageLanguageForCurrentProject(): Promise<void> {
    const { messageLanguage } = getLocalCompileSettings();
    const selected = await vscode.window.showQuickPick(
        [
            {
                label: '中英双语',
                description: '默认；先显示中文，再保留原始英文',
                value: 'dual' as const
            },
            {
                label: '仅英文',
                description: '保留驱动原始英文提示',
                value: 'en' as const
            },
            {
                label: '仅中文',
                description: '只显示中文翻译后的提示',
                value: 'zh' as const
            }
        ].map(item => ({
            ...item,
            detail: item.value === messageLanguage ? '当前生效' : undefined
        })),
        {
            placeHolder: '选择当前项目的编译诊断提示语言',
            ignoreFocusOut: true
        }
    );

    if (!selected) {
        return;
    }

    await persistLocalCompileSetting(
        'gameServerCompiler.diagnostics.messageLanguage',
        selected.value
    );
    const message = `当前项目编译诊断提示语言已切换为：${selected.label}`;
    messageProvider?.addMessage(message);
    vscode.window.showInformationMessage(message);
}

async function configureLocalCompileForCurrentProject(): Promise<void> {
    const displayState = getLocalCompileDisplayState();
    const selected = await vscode.window.showQuickPick(
        [
            {
                label: '选择当前项目LPCC路径',
                description: displayState.lpccPathLabel
            },
            {
                label: '选择当前项目本地编译配置文件',
                description: displayState.configPathLabel
            },
            {
                label: `保存自动编译：${displayState.autoCompileOnSave ? '开启' : '关闭'}`,
                description: '保存当前 mudlib 下的 .c/.lpc 文件时自动执行本地 LPCC 编译；缺少 LPCC 或配置文件时静默跳过'
            },
            {
                label: `警告提示：${displayState.showWarnings ? '开启' : '关闭'}`,
                description: '切换本地 LPCC 编译时是否提示警告'
            },
            {
                label: `诊断提示语言：${displayState.messageLanguageLabel}`,
                description: '影响本地 LPCC、远程编译消息、Problems 与输出摘要'
            }
        ],
        {
            placeHolder: '配置当前项目的本地 LPCC 编译设置',
            ignoreFocusOut: true
        }
    );

    if (!selected) {
        return;
    }

    if (selected.label.startsWith('选择当前项目LPCC路径')) {
        await selectLocalCompileAssetForCurrentProject('lpcc');
        return;
    }

    if (selected.label.startsWith('选择当前项目本地编译配置文件')) {
        await selectLocalCompileAssetForCurrentProject('config');
        return;
    }

    if (selected.label.startsWith('诊断提示语言：')) {
        await selectCompilerDiagnosticMessageLanguageForCurrentProject();
        return;
    }

    if (selected.label.startsWith('保存自动编译：')) {
        await toggleLocalCompileAutoCompileOnSaveForCurrentProject();
        return;
    }

    await toggleLocalCompileWarningsForCurrentProject();
}

async function chooseDetectedPath(
    workspaceRoot: string,
    mudlibRoot: string,
    paths: string[],
    placeholder: string,
    settingKey: string
): Promise<string | undefined> {
    if (paths.length === 0) {
        return undefined;
    }

    if (paths.length === 1) {
        return paths[0];
    }

    const selected = await vscode.window.showQuickPick(
        paths.map(filePath => ({
            label: nodePath.relative(mudlibRoot, filePath).replace(/\\/g, '/'),
            description: filePath,
            filePath
        })),
        {
            placeHolder: placeholder,
            ignoreFocusOut: true
        }
    );

    if (!selected) {
        return undefined;
    }

    await persistLocalCompileSetting(settingKey, toWorkspaceStoredPath(workspaceRoot, selected.filePath));
    return selected.filePath;
}

async function promptForLpccPath(workspaceRoot: string, mudlibRoot: string): Promise<string | undefined> {
    const action = await vscode.window.showWarningMessage(
        '未在当前 mudlib 目录发现 lpcc.exe。建议将 lpcc.exe 放到 mudlib 目录下，也可以现在手动选择。',
        '选择 lpcc.exe',
        '取消'
    );
    if (action !== '选择 lpcc.exe') {
        return undefined;
    }

    const selected = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectMany: false,
        canSelectFolders: false,
        defaultUri: vscode.Uri.file(mudlibRoot),
        filters: { Executable: ['exe'] },
        openLabel: '选择 lpcc.exe'
    });

    const selectedPath = selected?.[0]?.fsPath;
    if (!selectedPath) {
        return undefined;
    }
    if (nodePath.basename(selectedPath).toLowerCase() !== 'lpcc.exe') {
        throw new Error('请选择名为 lpcc.exe 的可执行文件');
    }
    if (!isPathInsideMudlibRoot(mudlibRoot, selectedPath)) {
        throw new Error('lpcc.exe 必须位于当前 mudlib 目录内');
    }

    await persistLocalCompileSetting(
        'gameServerCompiler.localCompile.lpccPath',
        toWorkspaceStoredPath(workspaceRoot, selectedPath)
    );
    return selectedPath;
}

async function promptForConfigPath(workspaceRoot: string, mudlibRoot: string): Promise<string | undefined> {
    const action = await vscode.window.showWarningMessage(
        '未在当前 mudlib 目录发现 config.ini 或 config.cfg。建议将配置文件放到 mudlib 目录下，也可以现在手动选择。',
        '选择配置文件',
        '取消'
    );
    if (action !== '选择配置文件') {
        return undefined;
    }

    const selected = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectMany: false,
        canSelectFolders: false,
        defaultUri: vscode.Uri.file(mudlibRoot),
        filters: { Config: ['ini', 'cfg'] },
        openLabel: '选择 config.ini 或 config.cfg'
    });

    const selectedPath = selected?.[0]?.fsPath;
    if (!selectedPath) {
        return undefined;
    }
    const fileName = nodePath.basename(selectedPath).toLowerCase();
    if (fileName !== 'config.ini' && fileName !== 'config.cfg') {
        throw new Error('请选择名为 config.ini 或 config.cfg 的配置文件');
    }
    if (!isPathInsideMudlibRoot(mudlibRoot, selectedPath)) {
        throw new Error('配置文件必须位于当前 mudlib 目录内');
    }

    await persistLocalCompileSetting(
        'gameServerCompiler.localCompile.configPath',
        toWorkspaceStoredPath(workspaceRoot, selectedPath)
    );
    return selectedPath;
}

async function ensureLocalCompileAssetPath(
    workspaceRoot: string,
    mudlibRoot: string,
    configuredPath: string | undefined,
    settingKey: 'gameServerCompiler.localCompile.lpccPath' | 'gameServerCompiler.localCompile.configPath',
    detectedPaths: string[],
    promptSelector: (workspaceRoot: string, mudlibRoot: string) => Promise<string | undefined>,
    options: ResolveLocalCompilePlanOptions
): Promise<string | undefined> {
    const resolvedConfiguredPath = configuredPath
        ? resolveValidLocalCompileAssetPath(workspaceRoot, mudlibRoot, configuredPath)
        : undefined;
    const action = decideLocalCompileAssetResolution({
        hasConfiguredPath: !!configuredPath,
        hasValidConfiguredPath: !!resolvedConfiguredPath,
        detectedCount: detectedPaths.length,
        allowPrompt: options.allowPrompt
    });

    if (action === 'useConfigured') {
        return resolvedConfiguredPath;
    }

    if (!options.allowPrompt && action === 'skip') {
        return undefined;
    }

    if (configuredPath && !resolvedConfiguredPath) {
        const reason = describeInvalidLocalCompileAssetPath(workspaceRoot, mudlibRoot, configuredPath);
        await vscode.window.showWarningMessage(`已配置的路径无效（${reason}），将重新选择: ${configuredPath}`);
    }

    if (action === 'useDetected') {
        return detectedPaths[0];
    }

    if (action === 'chooseDetected') {
        const detected = await chooseDetectedPath(
            workspaceRoot,
            mudlibRoot,
            detectedPaths,
            settingKey === 'gameServerCompiler.localCompile.lpccPath'
                ? '检测到多个 lpcc.exe，请选择一个并记住'
                : '检测到多个配置文件，请选择一个并记住',
            settingKey
        );
        if (detected) {
            return detected;
        }
    }

    if (action === 'skip') {
        return undefined;
    }

    return promptSelector(workspaceRoot, mudlibRoot);
}

async function resolveLocalCompilePlanForFile(
    filePath: string,
    options: ResolveLocalCompilePlanOptions
): Promise<MudlibLocalCompilePlan | undefined> {
    const workspaceRoot = getWorkspaceRoot();
    const mudlibRoot = PathConverter.findMudProjectRootFromFile(filePath);
    if (!mudlibRoot) {
        throw new Error('无法识别当前文件所属的 mudlib 根目录');
    }

    const artifacts = discoverMudlibLocalCompileArtifactsCached(mudlibRoot);
    const settings = getLocalCompileSettings();

    const lpccPath = await ensureLocalCompileAssetPath(
        workspaceRoot,
        mudlibRoot,
        settings.lpccPath,
        'gameServerCompiler.localCompile.lpccPath',
        artifacts.lpccPaths,
        promptForLpccPath,
        options
    );
    if (!lpccPath) {
        return undefined;
    }

    const configPath = await ensureLocalCompileAssetPath(
        workspaceRoot,
        mudlibRoot,
        settings.configPath,
        'gameServerCompiler.localCompile.configPath',
        artifacts.configPaths,
        promptForConfigPath,
        options
    );
    if (!configPath) {
        return undefined;
    }

    return resolveMudlibLocalCompilePlan({
        workspaceRoot,
        filePath,
        settings: {
            lpccPath,
            configPath
        }
    });
}

async function runLocalCompileProcess(
    plan: MudlibLocalCompilePlan,
    timeout: number
): Promise<LocalCompileProcessResult> {
    return new Promise((resolve, reject) => {
        execFile(
            plan.executablePath,
            [plan.configPath, plan.mudPath],
            {
                cwd: plan.workingDir,
                windowsHide: true,
                timeout,
                maxBuffer: 20 * 1024 * 1024
            },
            (error, stdout, stderr) => {
                if (error) {
                    const execError = error as ExecFileException;
                    reject(new LocalCompileProcessError(
                        error.message,
                        stdout,
                        stderr,
                        typeof execError.code === 'number' ? execError.code : null
                    ));
                    return;
                }

                resolve({
                    exitCode: 0,
                    stdout,
                    stderr
                });
            }
        );
    });
}

function toVsCodeDiagnosticSeverity(severity: CompilerDiagnosticSeverity): vscode.DiagnosticSeverity {
    return severity === 'warning'
        ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Error;
}

function resolveLocalCompileDiagnosticLocalPath(
    mudPath: string,
    mudlibRoot: string,
    workspaceRoot: string
): string | null {
    try {
        return PathConverter.resolveLocalPathWithRoot(
            mudPath,
            mudlibRoot,
            workspaceRoot
        ).localPath;
    } catch {
        return null;
    }
}

async function maybeRevealLocalCompileProblems(diagnostics: CompilerDiagnostic[]): Promise<void> {
    const highestSeverity = diagnostics.some(diagnostic => diagnostic.severity === 'error')
        ? 'error'
        : diagnostics.some(diagnostic => diagnostic.severity === 'warning')
            ? 'warning'
            : null;

    if (!highestSeverity) {
        return;
    }

    const mode = vscode.workspace
        .getConfiguration('gameServerCompiler')
        .get<ProblemsAutoRevealMode>('ui.autoRevealProblems', 'error');

    if (!shouldRevealProblemsPanel(mode, highestSeverity)) {
        return;
    }

    await vscode.commands.executeCommand('workbench.actions.view.problems');
    await vscode.commands.executeCommand('workbench.action.problems.focus')
        .then(undefined, () => undefined);
    await vscode.commands.executeCommand('workbench.panel.markers.view.focus')
        .then(undefined, () => undefined);
}

function clearLocalCompileDiagnostics(): void {
    localCompileDiagnosticCollection.clear();
}

async function publishLocalCompileDiagnostics(
    plan: MudlibLocalCompilePlan,
    diagnostics: CompilerDiagnostic[]
): Promise<void> {
    clearLocalCompileDiagnostics();
    const diagnosticFormatOptions = getCompilerDiagnosticFormatOptions();

    const diagnosticsByFile = new Map<string, vscode.Diagnostic[]>();
    const resolveLineText = createFileLineTextResolver();

    for (const diagnostic of diagnostics) {
        const localPath = resolveLocalCompileDiagnosticLocalPath(
            diagnostic.file,
            plan.mudlibRoot,
            getWorkspaceRoot()
        );

        if (!localPath) {
            messageProvider?.addMessage(
                formatCompilerDiagnosticSummary(diagnostic, diagnosticFormatOptions)
            );
            continue;
        }

        const lineNumber = Math.max(diagnostic.line - 1, 0);
        const lineText = resolveLineText(localPath, diagnostic.line);
        const { startColumn, endColumn } = resolveDiagnosticRange({
            lineText,
            column: diagnostic.column,
            message: diagnostic.message,
            kind: diagnostic.kind
        });
        const range = new vscode.Range(
            new vscode.Position(lineNumber, startColumn),
            new vscode.Position(lineNumber, endColumn)
        );

        const vscodeDiagnostic = new vscode.Diagnostic(
            range,
            formatCompilerDiagnosticMessage(
                diagnostic.message,
                diagnostic.severity,
                diagnosticFormatOptions.languageMode ?? 'en'
            ),
            toVsCodeDiagnosticSeverity(diagnostic.severity)
        );
        vscodeDiagnostic.source = 'LPCC';

        const fileUri = vscode.Uri.file(localPath).toString();
        const fileDiagnostics = diagnosticsByFile.get(fileUri) ?? [];
        fileDiagnostics.push(vscodeDiagnostic);
        diagnosticsByFile.set(fileUri, fileDiagnostics);
    }

    for (const [uriText, fileDiagnostics] of diagnosticsByFile.entries()) {
        localCompileDiagnosticCollection.set(vscode.Uri.parse(uriText), fileDiagnostics);
    }

    await maybeRevealLocalCompileProblems(diagnostics);
}

function appendLocalCompileDiagnosticMessages(
    plan: MudlibLocalCompilePlan,
    diagnostics: CompilerDiagnostic[]
): void {
    const diagnosticFormatOptions = getCompilerDiagnosticFormatOptions();
    for (const diagnostic of orderLocalCompileDiagnosticsForTimeline(diagnostics)) {
        const localPath = resolveLocalCompileDiagnosticLocalPath(
            diagnostic.file,
            plan.mudlibRoot,
            getWorkspaceRoot()
        );

        if (!localPath) {
            messageProvider?.addMessage(
                formatCompilerDiagnosticSummary(diagnostic, diagnosticFormatOptions)
            );
            continue;
        }

        messageProvider?.addCompilerDiagnostic({
            displayPath: diagnostic.file,
            localPath,
            line: diagnostic.line,
            column: diagnostic.column,
            message: diagnostic.message,
            rawMessage: diagnostic.message,
            severity: diagnostic.severity
        });
    }
}

function appendOutputLines(channel: vscode.OutputChannel, lines: readonly string[]): void {
    for (const line of lines) {
        channel.appendLine(line);
    }
}

function writeLocalCompileOutputSummaryBlock(
    scopeLabel: string,
    target: string,
    resultLabel: string,
    summaryLine: string,
    errors: CompilerDiagnostic[] = [],
    warnings: CompilerDiagnostic[] = [],
    formatOptions: CompilerDiagnosticFormatOptions = getCompilerDiagnosticFormatOptions()
): void {
    const diagnosticLines: CompileOutputDiagnosticSummary[] = [
        ...warnings.map(diagnostic => ({
            severity: diagnostic.severity,
            summary: formatCompilerDiagnosticSummary(diagnostic, formatOptions)
        })),
        ...errors.map(diagnostic => ({
            severity: diagnostic.severity,
            summary: formatCompilerDiagnosticSummary(diagnostic, formatOptions)
        }))
    ];

    appendOutputLines(localCompileOutputChannel, buildCompileOutputSessionLines({
        scopeLabel,
        target,
        resultLabel,
        summary: summaryLine,
        diagnostics: diagnosticLines
    }));
}

function extractLocalCompileDiagnostics(result: Pick<LocalCompileProcessResult, 'stdout' | 'stderr'>): CompilerDiagnostic[] {
    return parseLocalCompileDiagnostics([result.stderr, result.stdout].filter(Boolean).join('\n'));
}

function getLocalCompileScopeLabel(trigger: LocalCompileTrigger): string {
    return trigger === 'autoSave' ? '保存自动本地编译' : '本地 LPCC 编译';
}

function shouldEmitLocalCompileTimelineMessages(trigger: LocalCompileTrigger): boolean {
    return trigger === 'manual';
}

function shouldShowLocalCompileNotifications(trigger: LocalCompileTrigger): boolean {
    return trigger === 'manual';
}

async function executeLocalCompileForFile(
    filePath: string,
    options: ExecuteLocalCompileOptions
): Promise<void> {
    let currentPlan: MudlibLocalCompilePlan | undefined;
    const { timeout, showWarnings, messageLanguage } = getLocalCompileSettings();
    const scopeLabel = getLocalCompileScopeLabel(options.trigger);
    const emitTimelineMessages = shouldEmitLocalCompileTimelineMessages(options.trigger);
    const showNotifications = shouldShowLocalCompileNotifications(options.trigger);

    try {
        currentPlan = await resolveLocalCompilePlanForFile(filePath, { allowPrompt: options.allowPrompt });
        if (!currentPlan) {
            return;
        }

        clearLocalCompileDiagnostics();
        if (emitTimelineMessages) {
            messageProvider?.addMessage(`🏠 ${scopeLabel}: ${currentPlan.mudPath}`);
        }

        const result = await runLocalCompileProcess(currentPlan, timeout);
        const diagnostics = extractLocalCompileDiagnostics(result);
        const visibleDiagnostics = filterLocalCompileDiagnostics(diagnostics, showWarnings);

        if (visibleDiagnostics.length > 0) {
            await publishLocalCompileDiagnostics(currentPlan, visibleDiagnostics);
            const { errors, warnings } = partitionLocalCompileDiagnostics(visibleDiagnostics);
            if (emitTimelineMessages) {
                appendLocalCompileDiagnosticMessages(currentPlan, visibleDiagnostics);
            }

            const primaryDiagnostic = pickPrimaryLocalCompileDiagnostic(visibleDiagnostics);
            const primarySummary = primaryDiagnostic
                ? formatCompilerDiagnosticSummary(primaryDiagnostic, { languageMode: messageLanguage })
                : '未返回错误详情';

            if (errors.length > 0) {
                writeLocalCompileOutputSummaryBlock(
                    scopeLabel,
                    currentPlan.mudPath,
                    '失败',
                    `❌ ${scopeLabel}失败: ${primarySummary}`,
                    errors,
                    warnings,
                    { languageMode: messageLanguage }
                );
                if (emitTimelineMessages) {
                    messageProvider?.addMessage(`❌ ${scopeLabel}失败: ${primarySummary}`);
                }
                if (showNotifications) {
                    vscode.window.showErrorMessage(`${scopeLabel}失败: ${primarySummary}`);
                }
                return;
            }

            writeLocalCompileOutputSummaryBlock(
                scopeLabel,
                currentPlan.mudPath,
                '完成（警告）',
                `⚠️ ${scopeLabel}完成，但有警告: ${primarySummary}`,
                [],
                warnings,
                { languageMode: messageLanguage }
            );
            if (emitTimelineMessages) {
                messageProvider?.addMessage(`⚠️ ${scopeLabel}完成，但有警告: ${primarySummary}`);
            }
            if (showNotifications) {
                vscode.window.showWarningMessage(`${scopeLabel}完成，但有警告: ${primarySummary}`);
            }
            return;
        }

        writeLocalCompileOutputSummaryBlock(
            scopeLabel,
            currentPlan.mudPath,
            '成功',
            `✅ ${scopeLabel}完成: ${currentPlan.mudPath}`
        );
        if (emitTimelineMessages) {
            messageProvider?.addMessage(`✅ ${scopeLabel}完成: ${currentPlan.mudPath}`);
        }
        if (showNotifications) {
            vscode.window.showInformationMessage(`${scopeLabel}完成: ${currentPlan.mudPath}`);
        }
    } catch (error) {
        const processDiagnostics = error instanceof LocalCompileProcessError
            ? extractLocalCompileDiagnostics(error)
            : [];
        const visibleProcessDiagnostics = filterLocalCompileDiagnostics(processDiagnostics, showWarnings);
        const partitionedProcessDiagnostics = partitionLocalCompileDiagnostics(visibleProcessDiagnostics);
        if (error instanceof LocalCompileProcessError && visibleProcessDiagnostics.length > 0 && currentPlan) {
            await publishLocalCompileDiagnostics(currentPlan, visibleProcessDiagnostics);
            if (emitTimelineMessages) {
                appendLocalCompileDiagnosticMessages(currentPlan, visibleProcessDiagnostics);
            }
        }

        const errorMessage = error instanceof Error
            ? error instanceof LocalCompileProcessError
                ? visibleProcessDiagnostics.length > 0
                    ? formatCompilerDiagnosticSummary(
                        pickPrimaryLocalCompileDiagnostic(visibleProcessDiagnostics) ?? visibleProcessDiagnostics[0],
                        { languageMode: messageLanguage }
                    )
                    : summarizeLocalCompileError(error.stderr, error.stdout)
                : error.message
            : String(error);

        if (visibleProcessDiagnostics.length > 0) {
            writeLocalCompileOutputSummaryBlock(
                scopeLabel,
                currentPlan?.mudPath ?? filePath,
                '失败',
                `❌ ${scopeLabel}失败: ${errorMessage}`,
                partitionedProcessDiagnostics.errors,
                partitionedProcessDiagnostics.warnings,
                { languageMode: messageLanguage }
            );
        } else {
            writeLocalCompileOutputSummaryBlock(
                scopeLabel,
                currentPlan?.mudPath ?? filePath,
                '失败',
                `❌ ${scopeLabel}失败: ${errorMessage}`
            );
        }

        if (emitTimelineMessages) {
            messageProvider?.addMessage(`❌ ${scopeLabel}失败: ${errorMessage}`);
        }
        if (showNotifications) {
            vscode.window.showErrorMessage(`${scopeLabel}失败: ${errorMessage}`);
        }
    }
}

function isAutoDeclareOnSaveEnabled(): boolean {
    return vscode.workspace
        .getConfiguration('gameServerCompiler')
        .get<boolean>('compile.autoDeclareFunctionsOnSave', false);
}

function buildAutoDeclarationEdits(
    document: vscode.TextDocument,
    options?: { ignoreSetting?: boolean }
): vscode.TextEdit[] {
    const ignoreSetting = options?.ignoreSetting ?? false;
    if ((!ignoreSetting && !isAutoDeclareOnSaveEnabled()) || !shouldAutoDeclareForFile(document.fileName)) {
        return [];
    }

    const originalText = document.getText();
    const updatedText = updateAutoDeclarations(originalText);
    if (updatedText === originalText) {
        return [];
    }

    const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(originalText.length)
    );

    return [vscode.TextEdit.replace(fullRange, updatedText)];
}

async function generateAutoDeclarationsForActiveEditor(): Promise<void> {
    const editor = getPreferredFileEditor();
    if (!editor) {
        vscode.window.showErrorMessage('请先打开一个文件');
        return;
    }

    if (!shouldAutoDeclareForFile(editor.document.fileName)) {
        vscode.window.showErrorMessage('仅支持为 MUD 项目中的 .c 文件生成函数声明');
        return;
    }

    const edits = buildAutoDeclarationEdits(editor.document, { ignoreSetting: true });
    if (edits.length === 0) {
        localCompileOutputChannel.appendLine('函数声明已经是最新的');
        messageProvider?.addMessage('函数声明已经是最新的');
        vscode.window.showInformationMessage('函数声明已经是最新的');
        return;
    }

    const fullRange = edits[0].range;
    const updatedText = edits[0].newText;
    const applied = await editor.edit(editBuilder => {
        editBuilder.replace(fullRange, updatedText);
    });

    if (!applied) {
        throw new Error('函数声明写入失败');
    }

    localCompileOutputChannel.appendLine('函数声明已更新，等待保存');
    messageProvider?.addMessage('函数声明已更新，等待保存');
    vscode.window.showInformationMessage('函数声明已更新，等待保存');
}

function isLocalCompileAutoOnSaveEnabled(): boolean {
    return getLocalCompileSettings().autoCompileOnSave;
}

async function maybeAutoLocalCompileOnSave(document: vscode.TextDocument): Promise<void> {
    const filePath = document.uri.fsPath;
    if (!isCompilableFile(filePath)) {
        return;
    }

    if (!isLocalCompileAutoOnSaveEnabled()) {
        return;
    }

    if (skipNextAutoLocalCompileForFile.has(filePath)) {
        skipNextAutoLocalCompileForFile.delete(filePath);
        return;
    }

    await executeLocalCompileForFile(filePath, {
        trigger: 'autoSave',
        allowPrompt: false
    });
}

async function maybeRemoteAutoCompileOnSave(document: vscode.TextDocument): Promise<void> {
    if (!isCompilableFile(document.fileName)) {
        return;
    }

    const config = configManager.getConfig();
    if (!config.compile.autoCompileOnSave) {
        return;
    }

    if (!tcpClient.isLoggedIn() || !tcpClient.isConnected()) {
        return;
    }

    try {
        const filePath = document.uri.fsPath;
        const resolved = await resolveMudPath(filePath);
        messageProvider?.addMessage(`🔨 正在编译: ${resolved.mudPath}`);
        tcpClient.sendUpdateCommand(resolved.mudPath, resolved.usedRootPath);
    } catch (error) {
        messageProvider?.addMessage(`编译失败: ${error}`);
    }
}

// 检查并更新服务器配置
async function checkAndUpdateServerConfig(): Promise<boolean> {
    const config = configManager.getConfig();
    
    // 如果已有完整的服务器配置，直接返回
    if (config.host && config.port) {
        messageProvider?.addMessage('服务器配置已存在');
        return true;
    }

    // 检查服务器配置
    const host = await vscode.window.showInputBox({
        prompt: '请输入服务器地址',
        placeHolder: 'localhost',
        value: config.host || 'localhost'
    });
    if (!host) {return false;}

    const portStr = await vscode.window.showInputBox({
        prompt: '请输入服务器端口',
        placeHolder: '8080',
        value: config.port?.toString() || '8080'
    });
    if (!portStr) {return false;}
    
    const port = parseInt(portStr);
    if (isNaN(port)) {
        vscode.window.showErrorMessage('端口必须是数字');
        return false;
    }

    await configManager.updateConfig({ host, port });
    vscode.window.showInformationMessage('服务器配置已保存');
    return true;
}

// 🚀 处理配置切换
async function handleProfileSwitch(profileId: string): Promise<void> {
    // 检查连接状态
    if (tcpClient.isConnected()) {
        const confirm = await vscode.window.showWarningMessage(
            '切换配置需要断开当前连接，是否继续？',
            { modal: true },
            '继续',
            '取消'
        );

        if (confirm !== '继续') {
            return;
        }

        // 断开连接
        tcpClient.disconnect();
        messageProvider?.addMessage('已断开服务器连接');
    }

    // 切换配置
    await configManager.switchProfile(profileId);

    // 显示提示
    const profiles = configManager.getAllProfiles();
    vscode.window.showInformationMessage(
        `已切换到配置: ${profiles[profileId]?.name || profileId}`
    );
}

// 检查并更新用户配置
async function checkAndUpdateUserConfig(): Promise<boolean> {
    const config = configManager.getConfig();
    
    // 如果已有完整的用户配置，直接返回
    if (config.username && config.password) {
        messageProvider?.addMessage('用户配置已存在');
        return true;
    }

    // 检查用户名和密码
    const username = await vscode.window.showInputBox({
        prompt: '请输入巫师账号',
        placeHolder: 'username',
        value: config.username
    });
    if (!username) {return false;}

    const password = await vscode.window.showInputBox({
        prompt: '请输入密码',
        placeHolder: 'password',
        value: config.password
    });
    if (!password) {return false;}

    await configManager.updateConfig({ username, password });
    vscode.window.showInformationMessage('用户配置已保存');
    return true;
}

async function checkAndUpdateConfig(): Promise<boolean> {
    // 🚀 优化：延迟创建配置文件，在连接时才创建
    await configManager.ensureConfigExists();

    const config = configManager.getConfig();

    // 根目录策略：编译时按当前文件自动识别；这里仅做存在性检查，不强制覆盖配置。

    // 检查是否需要配置
    const needsServerConfig = !config.host || !config.port;
    const needsUserConfig = !config.username || !config.password;
    const needsLoginWithEmail = config.loginWithEmail === undefined;

    // 如果配置完整，直接返回
    if (!needsServerConfig && !needsUserConfig && !needsLoginWithEmail) {
        messageProvider?.addMessage('配置已完整，无需更新');
        return true;
    }

    // 需要服务器配置时才检查
    if (needsServerConfig) {
        if (!await checkAndUpdateServerConfig()) {
            return false;
        }
    }

    // 需要用户配置时才检查
    if (needsUserConfig) {
        if (!await checkAndUpdateUserConfig()) {
            return false;
        }
    }

    // 检查loginWithEmail配置
    if (needsLoginWithEmail) {
        const choice = await vscode.window.showQuickPick(['是', '否'], {
            placeHolder: '是否在登录信息中包含邮箱?'
        });

        if (choice === undefined) {
            return false;
        }

        await configManager.updateConfig({ loginWithEmail: choice === '是' });
        messageProvider?.addMessage(`已设置登录信息${choice === '是' ? '包含' : '不包含'}邮箱`);
    }

    return true;
}

export async function activate(context: vscode.ExtensionContext) {
    console.log('插件初始化...');
    rememberFileEditor(vscode.window.activeTextEditor);
    
    // 创建输出通道
    const outputChannel = vscode.window.createOutputChannel('LPC-MUD工具');
    localCompileOutputChannel = outputChannel;
    localCompileDiagnosticCollection = vscode.languages.createDiagnosticCollection('lpc-local');
    // 初始化日志管理器
    LogManager.initialize(outputChannel);

    // 输出初始化日志
    outputChannel.appendLine('========== LPC-MUD工具初始化 ==========');
    outputChannel.appendLine(`时间: ${new Date().toLocaleString()}`);
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
    outputChannel.appendLine(`工作区: ${workspaceRoot || '未知'}`);
    outputChannel.appendLine('==========================================');

    // 创建视图提供者
    messageProvider = new MessageProvider(context.extensionUri);
    buttonProvider = new ButtonProvider(context.extensionUri, messageProvider);
    
    messageProvider.addMessage('正在初始化插件...');
    
    // 注册视图提供者
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('game-server-messages', messageProvider, {
            webviewOptions: { retainContextWhenHidden: true }
        }),
        vscode.window.registerWebviewViewProvider('game-server-buttons', buttonProvider, {
            webviewOptions: { retainContextWhenHidden: true }
        }),
        vscode.window.onDidChangeActiveTextEditor(editor => {
            rememberFileEditor(editor);
        }),
        vscode.workspace.onDidChangeConfiguration(event => {
            if (
                event.affectsConfiguration('gameServerCompiler.localCompile')
                || event.affectsConfiguration('gameServerCompiler.diagnostics.messageLanguage')
            ) {
                buttonProvider.refreshViewState();
            }
        })
    );

    // 初始化配置管理器
    try {
        configManager = ConfigManager.getInstance();
    } catch (error) {
        outputChannel.appendLine(`配置初始化失败: ${error}`);
        messageProvider.addMessage(`配置初始化失败: ${error}`);
        return;
    }

    if (workspaceRoot) {
        await normalizeStoredLocalCompilePathsIfNeeded(workspaceRoot);
    }

    // 创建TcpClient实例
    tcpClient = new TcpClient(outputChannel, localCompileOutputChannel, buttonProvider, messageProvider);

    // 注册所有命令
    const commands = {
        'game-server-compiler.connect': async () => {
            outputChannel.appendLine('==== 执行连接命令 ====');
            try {
                outputChannel.appendLine(`当前连接状态: ${tcpClient.isConnected()}`);
                outputChannel.appendLine(`当前登录状态: ${tcpClient.isLoggedIn()}`);
                
                if (tcpClient.isConnected()) {
                    const disconnect = await vscode.window.showQuickPick(['是', '否'], {
                        placeHolder: '服务器已连接，是否断开连接？'
                    });
                    if (disconnect === '是') {
                        outputChannel.appendLine('用户选择断开连接');
                        tcpClient.disconnect();
                        messageProvider?.addMessage('已断开服务器连接');
                        await vscode.commands.executeCommand('setContext', 'gameServerCompiler.isConnected', false);
                        await vscode.commands.executeCommand('setContext', 'gameServerCompiler.isLoggedIn', false);
                    }
                    return;
                }

                outputChannel.appendLine('检查配置...');
                if (!await checkAndUpdateConfig()) {
                    outputChannel.appendLine('配置检查失败');
                    return;
                }

                const config = configManager.getConfig();
                outputChannel.appendLine(`准备连接到服务器: ${config.host}:${config.port}`);
                messageProvider?.addMessage('正在连接服务器...');
                await tcpClient.connect(config.host, config.port);
                outputChannel.appendLine('连接命令已发送');

                // 等待登录结果
                const loginTimeout = 10000; // 10秒登录超时
                const startTime = Date.now();
                while (Date.now() - startTime < loginTimeout) {
                    if (tcpClient.isLoggedIn()) {
                        outputChannel.appendLine('登录成功');
                        messageProvider?.addMessage('角色登录成功');
                        // 更新登录状态上下文
                        await vscode.commands.executeCommand('setContext', 'gameServerCompiler.isLoggedIn', true);
                        return;
                    }
                    if (!tcpClient.isConnected()) {
                        throw new Error('连接已断开');
                    }
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                // 登录超时，直接断开连接
                outputChannel.appendLine('登录超时');
                messageProvider?.addMessage('登录超时，请重新连接');
                await vscode.commands.executeCommand('setContext', 'gameServerCompiler.isLoggedIn', false);
                tcpClient.disconnect();
            } catch (error) {
                outputChannel.appendLine(`连接错误: ${error}`);
                const errorMsg = `${error}`;
                // 🚀 移除重复的 addMessage，TcpClient.log() 已经添加了消息
                vscode.window.showErrorMessage(errorMsg);
                await vscode.commands.executeCommand('setContext', 'gameServerCompiler.isLoggedIn', false);
            }
        },
        'game-server-compiler.compileCurrentFile': async () => {
            const editor = getPreferredFileEditor();
            const filePath = editor?.document.uri.fsPath;
            const compileCheck = checkCompilePreconditions(
                { connected: tcpClient.isConnected(), loggedIn: tcpClient.isLoggedIn() },
                filePath
            );
            if (!compileCheck.ok) {
                vscode.window.showErrorMessage(compileCheck.reason || '编译前置检查失败');
                return;
            }
            const safeFilePath = filePath as string;

            try {
                const resolved = await resolveMudPath(safeFilePath);
                tcpClient.sendUpdateCommand(resolved.mudPath, resolved.usedRootPath);
                messageProvider?.addMessage(`🔨 正在编译: ${resolved.mudPath}`);
            } catch (error) {
                messageProvider?.addMessage(`编译文件失败: ${error}`);
                const errorMessage = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`编译文件失败: ${errorMessage}`);
            }
        },
        'game-server-compiler.configureLocalCompile': async () => {
            outputChannel.appendLine('==== 打开本地 LPCC 设置 ====');
            try {
                await configureLocalCompileForCurrentProject();
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                outputChannel.appendLine(`打开本地 LPCC 设置失败: ${errorMessage}`);
                vscode.window.showErrorMessage(`打开本地 LPCC 设置失败: ${errorMessage}`);
            }
        },
        'game-server-compiler.selectLocalCompileLpccPath': async () => {
            outputChannel.appendLine('==== 选择当前项目 LPCC 路径 ====');
            try {
                await selectLocalCompileAssetForCurrentProject('lpcc');
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                outputChannel.appendLine(`选择 LPCC 路径失败: ${errorMessage}`);
                vscode.window.showErrorMessage(`选择 LPCC 路径失败: ${errorMessage}`);
            }
        },
        'game-server-compiler.selectLocalCompileConfigPath': async () => {
            outputChannel.appendLine('==== 选择当前项目本地编译配置文件 ====');
            try {
                await selectLocalCompileAssetForCurrentProject('config');
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                outputChannel.appendLine(`选择本地编译配置文件失败: ${errorMessage}`);
                vscode.window.showErrorMessage(`选择本地编译配置文件失败: ${errorMessage}`);
            }
        },
        'game-server-compiler.localCompileCurrentFile': async () => {
            const editor = getPreferredFileEditor();
            const filePath = editor?.document.uri.fsPath;
            if (!filePath) {
                vscode.window.showErrorMessage('请先打开一个文件');
                return;
            }
            if (!isCompilableFile(filePath)) {
                vscode.window.showErrorMessage('本地 LPCC 只能编译 .c 或 .lpc 文件');
                return;
            }

            if (editor.document.isDirty) {
                const choice = await vscode.window.showWarningMessage(
                    '当前文件还未保存，本地 LPCC 默认编译磁盘上的内容。是否先保存再编译？',
                    '保存后编译',
                    '直接编译',
                    '取消'
                );
                if (choice === '取消' || !choice) {
                    return;
                }
                if (choice === '保存后编译') {
                    skipNextAutoLocalCompileForFile.add(filePath);
                    const saved = await editor.document.save();
                    if (!saved) {
                        skipNextAutoLocalCompileForFile.delete(filePath);
                        vscode.window.showErrorMessage('文件保存失败，本地 LPCC 编译已取消');
                        return;
                    }
                }
            }

            await executeLocalCompileForFile(filePath, {
                trigger: 'manual',
                allowPrompt: true
            });
        },
        'game-server-compiler.copyMudPath': async () => {
            const editor = getPreferredFileEditor();
            const filePath = editor?.document.uri.fsPath;

            if (!filePath) {
                vscode.window.showErrorMessage('请先打开一个文件');
                return;
            }

            try {
                const mudPath = await convertToMudPath(filePath);
                await vscode.env.clipboard.writeText(mudPath);
                outputChannel.appendLine(`已复制路径: ${mudPath}`);
                messageProvider?.addMessage(`已复制路径: ${mudPath}`);
                vscode.window.showInformationMessage(`已复制: ${mudPath}`);
            } catch (error) {
                outputChannel.appendLine(`复制路径失败: ${error}`);
                const errorMessage = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`复制路径失败: ${errorMessage}`);
            }
        },
        'game-server-compiler.generateAutoDeclarations': async () => {
            try {
                await generateAutoDeclarationsForActiveEditor();
            } catch (error) {
                outputChannel.appendLine(`生成函数声明失败: ${error}`);
                const errorMessage = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`生成函数声明失败: ${errorMessage}`);
            }
        },
        'game-server-compiler.compileDir': async () => {
            outputChannel.appendLine('==== 执行编译目录命令 ====');
            if (!tcpClient.isConnected() || !tcpClient.isLoggedIn()) {
                vscode.window.showErrorMessage('请先连接服务器并确保角色已登录');
                return;
            }

            const config = configManager.getConfig();
            const path = await vscode.window.showInputBox({
                prompt: '输入要编译的目录路径',
                placeHolder: '例如: /cmds',
                value: config.compile.defaultDir,
                ignoreFocusOut: true
            });

            if (path) {
                try {
                    outputChannel.appendLine(`编译目录: ${path}`);
                    // 如果是新的目录路径,保存为默认值
                    if (path !== config.compile.defaultDir) {
                        await configManager.updateConfig({
                            compile: {
                                ...config.compile,
                                defaultDir: path
                            }
                        });
                    }

                    // 设置编译超时
                    const timeout = config.compile.timeout;
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('编译超时')), timeout);
                    });

                    // 执行编译命令
                    const compilePromise = new Promise<void>((resolve, reject) => {
                        try {
                            tcpClient.sendCustomCommand(`updateall ${path}`);
                            resolve();
                        } catch (error) {
                            reject(error);
                        }
                    });

                    // 使用Promise.race来处理超时
                    await Promise.race([compilePromise, timeoutPromise]);
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    outputChannel.appendLine(`编译目录失败: ${errorMessage}`);
                    messageProvider?.addMessage(`编译目录失败: ${errorMessage}`);
                    vscode.window.showErrorMessage(`编译目录失败: ${errorMessage}`);
                }
            }
        },
        'game-server-compiler.sendCommand': async (command: string) => {
            outputChannel.appendLine('==== 执行发送命令 ====');
            if (!tcpClient.isConnected() || !tcpClient.isLoggedIn()) {
                vscode.window.showErrorMessage('请先连接服务器并确保角色已登录');
                return;
            }

            try {
                // 如果传入了command参数,直接执行
                if (command) {
                    outputChannel.appendLine(`发送命令: ${command}`);
                    tcpClient.sendCustomCommand(command);
                    messageProvider?.addMessage(`发送命令: ${command}`);
                    return;
                }

                // 否则弹出输入框
                const inputCommand = await vscode.window.showInputBox({
                    prompt: '输入要发送的命令',
                    placeHolder: '例如: update /path/to/file',
                    ignoreFocusOut: true
                });

                if (inputCommand) {
                    outputChannel.appendLine(`发送命令: ${inputCommand}`);
                    tcpClient.sendCustomCommand(inputCommand);
                    messageProvider?.addMessage(`发送命令: ${inputCommand}`);
                }
            } catch (error) {
                outputChannel.appendLine(`发送命令失败: ${error}`);
                messageProvider?.addMessage(`发送命令失败: ${error}`);
                vscode.window.showErrorMessage(`发送命令失败: ${error}`);
            }
        },
        'game-server-compiler.eval': async (code: string) => {
            outputChannel.appendLine('==== 执行Eval命令 ====');
            if (!tcpClient.isConnected() || !tcpClient.isLoggedIn()) {
                vscode.window.showErrorMessage('请先连接服务器并确保角色已登录');
                return;
            }

            try {
                // 如果传入了code参数,直接执行
                if (code) {
                    outputChannel.appendLine(`执行Eval: ${code}`);
                    tcpClient.sendEvalCommand(code);
                    messageProvider?.addMessage(`执行Eval: ${code}`);
                    return;
                }

                // 否则弹出输入框
                const inputCode = await vscode.window.showInputBox({
                    prompt: '输入要执行的代码',
                    placeHolder: '例如: users()',
                    ignoreFocusOut: true
                });

                if (inputCode) {
                    outputChannel.appendLine(`执行Eval: ${inputCode}`);
                    tcpClient.sendEvalCommand(inputCode);
                    messageProvider?.addMessage(`执行Eval: ${inputCode}`);
                }
            } catch (error) {
                outputChannel.appendLine(`执行Eval失败: ${error}`);
                messageProvider?.addMessage(`执行Eval失败: ${error}`);
                vscode.window.showErrorMessage(`执行Eval失败: ${error}`);
            }
        },
        'game-server-compiler.restart': async () => {
            outputChannel.appendLine('==== 执行重启命令 ====');
            if (!tcpClient.isConnected() || !tcpClient.isLoggedIn()) {
                vscode.window.showErrorMessage('请先连接服务器并确保角色已登录');
                return;
            }

            const confirm = await vscode.window.showWarningMessage(
                '确定要重启服务器吗？',
                { modal: true },
                '确定',
                '取消'
            );

            if (confirm === '确定') {
                try {
                    outputChannel.appendLine('发送重启命令');
                    tcpClient.sendRestartCommand();
                    messageProvider?.addMessage('已发送重启命令');
                    vscode.window.showInformationMessage('已发送重启命令');
                } catch (error) {
                    outputChannel.appendLine(`发送重启命令失败: ${error}`);
                    messageProvider?.addMessage(`发送重启命令失败: ${error}`);
                    vscode.window.showErrorMessage(`发送重启命令失败: ${error}`);
                }
            }
        },
        'game-server-compiler.showPerformanceReport': async () => {
            outputChannel.appendLine('==== 显示性能报告 ====');
            try {
                // 获取性能报告
                const report = tcpClient.getPerformanceReport();
                outputChannel.appendLine(report);

                // 检查性能问题
                const issues = tcpClient.checkPerformanceIssues();
                if (issues.length > 0) {
                    messageProvider?.addMessage('⚠️ 发现性能问题:\n' + issues.join('\n'));
                } else {
                    messageProvider?.addMessage('✅ 未发现明显性能问题');
                }
            } catch (error) {
                outputChannel.appendLine(`获取性能报告失败: ${error}`);
                messageProvider?.addMessage(`获取性能报告失败: ${error}`);
                vscode.window.showErrorMessage(`获取性能报告失败: ${error}`);
            }
        },
        'game-server-compiler.resetPerformanceMetrics': async () => {
            outputChannel.appendLine('==== 重置性能指标 ====');
            try {
                const confirm = await vscode.window.showWarningMessage(
                    '确定要重置所有性能指标吗？',
                    '确定',
                    '取消'
                );

                if (confirm === '确定') {
                    tcpClient.resetPerformanceMetrics();
                    messageProvider?.addMessage('✅ 性能指标已重置');
                    vscode.window.showInformationMessage('性能指标已重置');
                }
            } catch (error) {
                outputChannel.appendLine(`重置性能指标失败: ${error}`);
                messageProvider?.addMessage(`重置性能指标失败: ${error}`);
                vscode.window.showErrorMessage(`重置性能指标失败: ${error}`);
            }
        },
        'game-server-compiler.switchProfile': async (profileId?: string) => {
            outputChannel.appendLine('==== 切换配置环境 ====');
            try {
                // 如果没有指定配置ID，显示选择器
                if (!profileId) {
                    const profiles = configManager.getAllProfiles();
                    const profileIds = Object.keys(profiles);

                    if (profileIds.length === 0) {
                        vscode.window.showErrorMessage('没有可用的配置');
                        return;
                    }

                    const items = profileIds.map(id => ({
                        label: profiles[id].name || id,
                        description: `切换到配置: ${id}`,
                        value: id
                    }));

                    const selected = await vscode.window.showQuickPick(items, {
                        placeHolder: '选择要切换的配置'
                    });

                    if (selected) {
                        await handleProfileSwitch(selected.value);
                    }
                } else {
                    await handleProfileSwitch(profileId);
                }
            } catch (error) {
                outputChannel.appendLine(`切换配置失败: ${error}`);
                vscode.window.showErrorMessage(`切换配置失败: ${error}`);
            }
        },
    };

    // 注册所有命令
    Object.entries(commands).forEach(([commandId, handler]) => {
        outputChannel.appendLine(`注册命令: ${commandId}`);
        context.subscriptions.push(vscode.commands.registerCommand(commandId, handler));
        outputChannel.appendLine(`命令 ${commandId} 注册成功`);
    });

    // 注册文件保存监听
    context.subscriptions.push(
        vscode.workspace.onWillSaveTextDocument((event) => {
            try {
                const edits = buildAutoDeclarationEdits(event.document);
                if (edits.length > 0) {
                    event.waitUntil(Promise.resolve(edits));
                }
            } catch (error) {
                outputChannel.appendLine(`自动生成函数声明失败: ${error}`);
            }
        }),
        vscode.workspace.onDidSaveTextDocument(async (document) => {
            await maybeAutoLocalCompileOnSave(document);
            await maybeRemoteAutoCompileOnSave(document);
        })
    );

    // 将输出面板添加到订阅中
    context.subscriptions.push(outputChannel, localCompileDiagnosticCollection);

    outputChannel.appendLine('插件初始化完成');
    messageProvider.addMessage('插件初始化完成');
}

export function deactivate() {
    console.log('停用插件...');
    try {
        if (tcpClient?.isConnected()) {
            tcpClient.disconnect();
        }
        messageProvider?.dispose();
        configManager?.dispose();
        console.log('插件停用完成');
    } catch (error) {
        console.error('插件停用错误:', error);
    }
} 
