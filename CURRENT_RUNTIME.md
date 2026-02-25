# 当前运行架构（权威）

最后更新：2026-02-25

## 实际主链路

- 入口：`src/extension.ts`
- 网络与协议：`src/tcpClient.ts`
- 配置：`src/config/ConfigManager.ts`
- 视图：`src/messageProvider.ts`、`src/buttonProvider.ts`
- 路径转换：`src/utils/PathConverter.ts`

## 路径转换规则

- 编译时优先从当前文件向上自动识别项目根目录。
- 识别条件：目录中存在 `log/adm/cmds/feature/include/std/inherit` 这 7 个标记目录中的至少 3 个。
- 转换结果：`<项目根>/<相对路径>.c|.lpc` -> `/<相对路径无扩展名>`
  - 示例：`duobao/adm/daemons/logind.c` -> `/adm/daemons/logind`
- `rootPath` 仅作为兜底配置，不是主要路径依据。

## 兼容说明

- `ARCHITECTURE.md`、`API.md`、`MODULES.md` 中仍保留历史设计说明，阅读时以本文件为准。
