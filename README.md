<div align="center">

# 🎮 LPC服务器连接器

[![Version](https://img.shields.io/badge/version-1.0.3-blue.svg)]()
[![License](https://img.shields.io/badge/license-MIT-green.svg)]()
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)]()

一个专业的 VS Code 扩展，为 LPC 游戏开发者提供完整的服务器连接和管理解决方案。

[安装](#安装) • [特性](#特性) • [使用说明](#使用说明) • [配置](#配置) • [常见问题](#常见问题)

</div>

## 📑 目录

- [✨ 特性](#特性)
- [🔧 系统要求](#系统要求)
- [📥 安装](#安装)
- [🚀 快速开始](#快速开始)
- [📖 使用说明](#使用说明)
- [⚙️ 配置](#配置)
- [❓ 常见问题](#常见问题)
- [🤝 贡献指南](#贡献指南)
- [📄 许可证](#许可证)


## 📖 使用说明

### 服务器配置

#### 1. 基础配置
在 VS Code 设置中配置以下信息：
- 服务器地址和端口
- 巫师账号和密码
- MUD 项目根目录

#### 2. 服务器验证
在 `logind.c` 文件中添加验证代码：
```c
// 在验证代码中添加以下判断
if(arg!=sha1("buyi-SerenezZmuy") &&你的原有判断条件条件){
    write("客户端非法\n");
    destruct(ob);
    return;
}
```
#### 3.Eval自定义命令
在cmds/wiz目录下，创建eval.c文件，并添加以下内容
如果有此命令，则将原eval.c文件内容替换为以下内容
```c  
int main(object me, string arg)
{
    object eval_ob;
    string filename, file;
	
    if (!arg)
        return help(me);

    filename = "/debug_eval_file.c";

    if (!wizardp(me))
        return 0;

    /* clean up first */
    if (file_size(filename) != -1)
        rm(filename);
    if (eval_ob = find_object(filename))
        destruct(eval_ob);

    file = "mixed eval(object me) { " + arg + "; }\n";
    write_file(filename, file, 1);
    write(sprintf(ESC+"MUY%O║\n",filename->eval(me)));
    //printf("Result = %O\n", filename->eval(me));

    return 1;
}

int help(object me)
{
    if (!wizardp(me))
        return 0;

    write(@HELP
指令格式: eval <lpc code>
指令说明:
    测试专用，直接执行LPC代码片断，如：eval return me
HELP);

    return 1;
}
```


## ✨ 特性

### 🔌 服务器连接管理
- 一键连接/断开服务器
- 智能重连机制，自动处理网络波动
- 实时连接状态监控
- 安全的身份验证机制
- 支持自定义命令发送
- 支持Eval自定义命令执行
- 支持UTF8和GBK编码

### 🛠 文件编译
- 快速编译当前文件
- 支持整个目录批量编译
- 智能依赖分析和自动编译
- 实时编译状态反馈

### ⚙️ 服务器操作
- 灵活的自定义命令支持
- 安全的服务器重启功能
- 实时消息监控和日志记录
- 错误智能提示

### 🎯 开发体验
- 直观的图形界面
- 快捷键支持
- 实时状态反馈
- 详细的错误提示

## 🔧 系统要求

- VS Code 1.60.0 或更高版本
- Node.js 14.x 或更高版本
- 支持的操作系统：Windows、macOS、Linux
- 网络连接（用于服务器通信）

## 📥 安装

### 手动安装
1. 下载最新的 `.vsix` 文件
2. 在 VS Code 中按下 `Ctrl+Shift+P`
3. 输入 `Install from VSIX`
4. 选择下载的文件

## 🚀 快速开始

1. 安装插件后，点击左侧活动栏的 LPC 图标
2. 在设置中配置服务器信息
3. 点击"连接游戏服务器"按钮
4. 开始享受便捷的开发体验！



### 开发工作流

#### 1. 连接服务器
- 使用活动栏图标打开插件面板
- 点击"连接游戏服务器"
- 等待连接成功提示

#### 2. 文件编译
- 单文件编译：打开文件后点击"编译当前文件"
- 目录编译：点击"编译目录"并输入目录路径
- 编译结果会实时显示在消息面板

#### 3. 服务器操作
- 自定义命令：点击"发送自定义命令"
- 服务器重启：使用"重启服务器"功能
- 所有操作结果都会在消息面板显示

## ⚙️ 配置

### 基础配置项

| 配置项 | 说明 | 默认值 | 必填 |
|--------|------|--------|------|
| `gameServerCompiler.encoding` | 服务器通信编码 | UTF8 | 否 |
| `gameServerCompiler.host` | 服务器地址 | - | 是 |
| `gameServerCompiler.port` | 服务器端口 | - | 是 |
| `gameServerCompiler.username` | 巫师账号 | - | 是 |
| `gameServerCompiler.password` | 巫师密码 | - | 是 |
| `gameServerCompiler.serverKey` | 服务器验证密钥 | "buyi-SerenezZmuy" | 否 |

### 高级配置

- 编码设置
  - UTF8/GBK编码支持
  - 自动编码转换
- 自动重连设置
- 日志级别控制
- 编译选项设置
- 超时时间设置

## ❓ 常见问题

### 1. 连接问题
Q: 无法连接到服务器？  
A: 请检查：
- 服务器地址和端口是否正确
- 网络连接是否正常
- 防火墙设置是否允许连接
- 验证密钥是否正确配置
- 编码设置是否与服务器匹配

### 2. 编译问题
Q: 文件编译失败？  
A: 可能的原因：
- 文件路径不正确
- 代码语法错误
- 依赖文件缺失
- 权限不足
- 编码设置不正确

### 3. 性能问题
Q: 编译大型目录很慢？  
A: 建议：
- 使用增量编译
- 避免不必要的全目录编译
- 优化代码结构减少依赖
- 确保使用正确的编码设置

### 4. 中文显示问题
Q: 中文显示乱码？  
A: 解决方案：
- 检查编码设置是否正确
- 在配置中将encoding设置为"GBK"
- 重新连接服务器使配置生效
- 确保文件本身使用正确的编码保存

## 🤝 贡献指南

我们欢迎所有形式的贡献，包括但不限于：
- 提交问题和建议
- 改进文档
- 提交代码修复
- 添加新功能

贡献步骤：
1. Fork 项目
2. 创建特性分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

## 📞 联系我们

- 问题反馈：[GitHub Issues](https://github.com/serenez/lpc-server-update/issues)
- 邮箱：279631638@qq.com
- QQ：279631638

---

**特别感谢所有贡献者！**
