# 🎮 LPC-FluffOS-Toolkit

<div align="center">

[![Version](https://img.shields.io/badge/version-1.4.3-blue.svg?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=BUYI-ZMuy.lpc-server-update)
[![License](https://img.shields.io/badge/license-MIT-green.svg?style=for-the-badge)](LICENSE)
[![QQ](https://img.shields.io/badge/QQ-279631638-red.svg?style=for-the-badge)](https://qm.qq.com/cgi-bin/qm/qr?k=XcJNDH3-8WTdP0snH8g88KbiXyeIcNI5)

A VS Code extension for FluffOS / LPC / MUD projects, mainly built for two jobs: remote update, and local `lpcc.exe` compile with direct error positioning in the editor.

[简体中文 README](README.md) • [Changelog](CHANGELOG.md) • [Configuration](CONFIGURATION.md) • [Compiler Diagnostic Localization Table](COMPILER_DIAGNOSTIC_LOCALIZATION.md)

</div>

---
![0mo98-02eoc.gif](https://imgtolinkx.com/i/3E8eKvZs)
## ⭐ Local LPCC Compile Error Reporting

This is the main feature of the extension.

The extension calls `lpcc.exe` inside the current mudlib and compiles the `.c` / `.lpc` file you are currently editing. After that, errors and warnings are shown directly inside VS Code instead of being left as raw compiler text.

What it does in practice:

- Reads standard compiler messages such as `/cmds/wiz/testcmd.c line 30, column 3: ...`
- Shows errors and warnings in three places:
  - error cards in the monitor panel
  - VS Code `Problems`
  - the unified output channel `LPC-MUD工具`
- Lets you click and jump to the exact file, line, and column
- Tries to highlight the **whole function name or variable name** when the error is on an identifier
- Lets you choose whether warnings should be shown
- Lets you switch between Chinese only, English only, or dual language
- Can run local compile automatically on save without interrupting editing
- Still uses the current visible code file even if focus is on output, Problems, or the sidebar

So this is not just “print an English compiler error”.

It tells you **which file, which line, which column, and what went wrong**, and lets you jump there directly.

### ⭐ Recommended: Use It With the Optimized FluffOS / LPCC Driver

The extension can only show what the driver already reports.  
It does not invent a better column by itself, and it does not magically know which argument is wrong if the driver did not report that correctly. It mainly takes the file, line, column, source line, and caret from the driver and shows them inside VS Code.

So the important point is:

- this extension is already adjusted for the error format produced by the optimized FluffOS driver
- the best results depend on the optimized driver linked below
- older or unmodified drivers can still work, but error positions may be less accurate

With the optimized driver, the visible improvements are:

- syntax errors get more reliable line and column positions
- argument type errors are more likely to point to the **actual bad argument**
- source lines and `^` carets match more closely
- undeclared functions, undefined variables, and unused locals are more likely to point to the right place

If you want to use this extension as your daily LPC compile error tool, you should pair it with the optimized FluffOS / LPCC driver.

### ⬇️ Optimized Driver Downloads

- [Optimized Windows FluffOS driver](http://qn.aimud.cn/driver.exe)
- [Optimized Windows LPCC](http://qn.aimud.cn/lpcc.exe)
- Prebuilt Linux binaries are not provided here. Please build the Linux version from the FluffOS source project below.
- [FluffOS project repository](https://github.com/serenez/fluffos_Z)

---

## What The Extension Can Do

- Connect to a game server with multiple environment profiles
- Remote update for the current file, directory compile, custom command, eval, and server restart
- Local offline compile of the current file via `lpcc.exe`, with diagnostics synced to the message panel, `Problems`, and the unified output channel
- Turn FluffOS / mudlib compiler errors into clickable messages and jump directly to the related file / line / column
- Copy the current file's MUD-relative path
- Generate or refresh the `AUTO DECLARATIONS` block for the current `.c` file
- Bookmark frequently used files for quick access

> Recommended companion extension: [LPC language-server](https://marketplace.visualstudio.com/items?itemName=jlchmura.lpc)  
> Use it for syntax highlighting, completion, hover, and definition navigation. This extension does not implement LSP features by itself.

---

## Recommended Usage Modes

### 1. Develop on the game server machine

Recommended.

The extension connects to the local MUD service directly, so remote update and local files stay naturally aligned.

### 2. Develop through VS Code Remote-SSH

Also recommended.

Your code, config, and driver all live on the server side, so both remote update and local LPCC compile tend to be more stable.

### 3. Local development with a separate game server

Supported, but you are responsible for file synchronization.

Remote update compiles the server-side file. Local LPCC compiles the local file on disk. If those two copies diverge, the results may differ.

---

## Current UI Structure

The extension provides two activity-bar views:

- `📡 Server Monitor`
- `⚡ Command Console`

### Server Monitor

Top buttons currently include:

- `登录KEY`: open `.vscode/muy-lpc-update.json`
- `UTF8 / GBK`: switch remote connection encoding
- `登录:含邮箱 / 不含`: toggle whether login payload includes email
- `原始:开 / 关`: show or hide raw server messages
- `🔒 / 🔓`: toggle auto-scroll
- `❌`: clear messages

The message panel can show:

- normal server messages
- remote compile status
- local LPCC diagnostics
- clickable compiler diagnostic cards

### Command Console

The layout is split into two groups.

#### Local Commands

- `本地LPCC编译`
- `本地LPCC设置`
- `生成函数声明`
- `复制相对路径`
- `常用文件`

#### Remote Commands

- `远程Update当前文件`
- `编译目录`
- `自定义命令`
- `自定义Eval`
- `重启服务器`
- `连接游戏服务器`

At the bottom:

- profile selector
- collapsible current-configuration panel

The current-configuration panel shows:

- server update profile
- server mudlib directory mapping path
- server connection target
- current LPCC
- current config
- local compile on save
- warning visibility
- diagnostic language

---

## Where Configuration Is Stored

The extension uses two separate configuration locations.

### 1. Remote update configuration

Stored in:

```text
.vscode/muy-lpc-update.json
```

This file is responsible for:

- environment `profiles`
- active profile selection
- remote host / port / account / password
- fallback `rootPath` mapping
- remote compile-on-save via `compile.autoCompileOnSave`
- custom commands / eval / favorite files

Minimal example:

```json
{
  "version": 2,
  "activeProfile": "default",
  "profiles": {
    "default": {
      "name": "Local Development",
      "host": "127.0.0.1",
      "port": 8080,
      "username": "wizard",
      "password": "password",
      "rootPath": "C:/mud/duobao",
      "serverKey": "buyi-SerenezZmuy",
      "encoding": "UTF8",
      "loginKey": "buyi-ZMuy",
      "loginWithEmail": false,
      "compile": {
        "defaultDir": "/cmds",
        "autoCompileOnSave": false,
        "timeout": 30000,
        "showDetails": true
      },
      "connection": {
        "timeout": 10000,
        "maxRetries": 3,
        "retryInterval": 5000,
        "heartbeatInterval": 30000
      }
    }
  }
}
```

### 2. VS Code workspace settings

Stored in:

```text
.vscode/settings.json
```

This location is used for:

- local LPCC path
- local compile config path
- local compile timeout
- local compile on save
- warning visibility
- diagnostic language
- message panel and UI behavior

Common settings example:

```json
{
  "gameServerCompiler.compile.autoDeclareFunctionsOnSave": false,
  "gameServerCompiler.localCompile.lpccPath": "duobao/fluffos64/lpcc.exe",
  "gameServerCompiler.localCompile.configPath": "duobao/config.ini",
  "gameServerCompiler.localCompile.autoCompileOnSave": false,
  "gameServerCompiler.localCompile.showWarnings": true,
  "gameServerCompiler.diagnostics.messageLanguage": "dual",
  "gameServerCompiler.ui.autoRevealProblems": "error"
}
```

---

## Core Workflows

## Remote Update Workflow

1. Click `连接游戏服务器` in the command console
2. Open a target `.c` / `.lpc` file
3. Click `远程Update当前文件`
4. Remote compile results will appear in the message panel and the `LPC-MUD工具` output channel

Notes:

- `compile.autoCompileOnSave` controls remote compile-on-save
- it requires an active connection and a logged-in role
- remote compile errors are converted into clickable cards and can also populate `Problems`

## Local LPCC Workflow

1. Open a `.c` / `.lpc` file inside the current mudlib
2. Click `本地LPCC编译`
3. On first use, use `本地LPCC设置` to pick the current project's `lpcc.exe` and `config.ini/config.cfg`
4. Compile results will go to the message panel, `Problems`, and `LPC-MUD工具`

Important local LPCC rules:

- Only `lpcc.exe`, `config.ini`, and `config.cfg` inside the **current file's mudlib** are scanned
- Manually selected LPCC and config files must also stay inside the **current mudlib**
- Local compile-on-save runs in **silent mode**
  - it only runs when LPCC and config are both clearly available
  - if a path is invalid, nothing is found, or multiple candidates exist without manual confirmation, it is skipped
  - it does not interrupt save with dialogs

## Function Declaration Workflow

- `生成函数声明`: manually refresh the `AUTO DECLARATIONS` block of the current `.c` file
- `gameServerCompiler.compile.autoDeclareFunctionsOnSave`: refresh declarations on save, disabled by default

The current declaration logic:

- collects matching declarations scattered in the file
- moves them into the automatic declaration block
- avoids accidentally swallowing dirty text from the previous line into a function signature

## How “Current File” Is Resolved

These commands no longer depend strictly on editor focus:

- `远程Update当前文件`
- `本地LPCC编译`
- `复制相对路径`
- `生成函数声明`
- `本地LPCC设置`

If focus is currently on the output panel, `Problems`, the message view, or another sidebar view, the extension falls back to the most recently visible code editor instead of failing with “only `.c` or `.lpc` files can be compiled”.

---

## Diagnostics And Output

### Unified Output Channel

Only one regular output channel is kept:

```text
LPC-MUD工具
```

It carries:

- remote compile summaries
- local LPCC compile summaries
- copy-path results
- function-declaration results
- other necessary plugin logs

### Problems Integration

Both local LPCC and remote compile diagnostics are written into `Problems`.

Relevant setting:

- `gameServerCompiler.ui.autoRevealProblems = never`
- `gameServerCompiler.ui.autoRevealProblems = error`
- `gameServerCompiler.ui.autoRevealProblems = errorOrWarning`

### Diagnostic Language

`gameServerCompiler.diagnostics.messageLanguage` supports:

- `dual`: Chinese + English
- `en`: English only
- `zh`: Chinese only

It affects:

- local LPCC compile messages
- remote compile messages
- diagnostic cards in the message panel
- `Problems`
- output summaries

### Raw Server Messages

`原始:开 / 关` controls whether raw server payloads are displayed directly.

This is mainly useful for protocol debugging and is not recommended for everyday use.

---

## Important Settings At A Glance

### Remote Compile And Declarations

- `gameServerCompiler.compile.autoCompileOnSave`
  - run remote update on save
- `gameServerCompiler.compile.autoDeclareFunctionsOnSave`
  - refresh function declarations on save

### Local LPCC

- `gameServerCompiler.localCompile.lpccPath`
- `gameServerCompiler.localCompile.configPath`
- `gameServerCompiler.localCompile.timeout`
- `gameServerCompiler.localCompile.autoCompileOnSave`
- `gameServerCompiler.localCompile.showWarnings`

### Diagnostics And UI

- `gameServerCompiler.diagnostics.messageLanguage`
- `gameServerCompiler.ui.autoRevealProblems`
- `gameServerCompiler.messages.showRawData`
- `gameServerCompiler.messages.autoScroll`
- `gameServerCompiler.messages.maxCount`

For complete details, see [CONFIGURATION.md](CONFIGURATION.md).

---

## Commands

The extension currently exposes these commands:

- `连接游戏服务器`
- `远程Update当前文件`
- `本地LPCC编译当前文件`
- `本地LPCC设置`
- `复制当前文件相对路径`
- `生成当前文件函数声明`
- `编译目录`
- `发送自定义命令`
- `重启服务器`
- `显示性能报告`
- `重置性能指标`
- `切换配置环境`

Some of them are meant to be clicked in the command console, while others are more convenient from the command palette.

---

## Documentation

- [Architecture](ARCHITECTURE.md)
- [API](API.md)
- [Development Guide](DEVELOPMENT.md)
- [Configuration](CONFIGURATION.md)
- [Compiler Diagnostic Localization](COMPILER_DIAGNOSTIC_LOCALIZATION.md)
- [Modules](MODULES.md)
- [Testing](TESTING.md)

---

## Development And Verification

```bash
npm install
npm run compile
npm run lint
node --test dist/**/*.test.js
```

---

## FAQ

### 1. Local LPCC compile-on-save does not trigger

Check:

- whether `gameServerCompiler.localCompile.autoCompileOnSave` is enabled
- whether the current file belongs to a recognizable mudlib
- whether `lpcc.exe` and `config.ini/config.cfg` are clearly available inside that mudlib
- whether multiple candidates exist and manual confirmation is still missing

### 2. Remote update compiles code that does not match local edits

This means the server-side file and your local file are out of sync.

Remote update always compiles the server copy. It does not upload your local changes automatically.

### 3. Why can local compile report an error while remote compile does not

Local LPCC and remote driver compilation are two different pipelines.

Local compile is for fast offline validation. Remote compile reflects the code and runtime environment currently present on the server.

### 4. Why does the extension still find the current file after I clicked the output panel

That is intentional.

The extension falls back to the most recently visible code editor instead of relying strictly on focus.

---

## Contact

- QQ: 279631638
- Issues: [GitHub Issues](https://github.com/serenez/lpc-server-update/issues)

---

## License

[MIT License](LICENSE) © 2024 不一
