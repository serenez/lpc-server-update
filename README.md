<div align="center">

# 🎮 LPC服务器连接器

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)]()
[![License](https://img.shields.io/badge/license-MIT-green.svg)]()

一个强大的 VS Code 扩展，为 LPC 游戏开发者提供完整的服务器连接和管理解决方案。

[安装](#安装) • [使用说明](#使用说明) • [配置说明](#配置说明) • [问题反馈](#问题反馈)

</div>

## 📝 目录

- [功能特性](#功能特性)
- [安装](#安装)
- [使用说明](#使用说明)
- [配置说明](#配置说明) 
- [注意事项](#注意事项)
- [问题反馈](#问题反馈)
- [许可证](#许可证)

## ✨ 功能特性

### 🔌 服务器连接管理
- 一键连接/断开服务器
- 智能重连机制
- 实时连接状态显示

### 🛠 文件编译
- 自动编译当前文件
- 支持整个目录批量编译
- 实时编译状态反馈

### ⚙️ 服务器操作
- 发送自定义命令
- 服务器重启功能
- 实时消息监控

## 📥 安装

1. 打开 VS Code
2. 使用快捷键 `Ctrl+Shift+X` 打开扩展视图
3. 搜索 "LPC服务器连接器"
4. 点击安装

## 📖 使用说明

### 1. 配置服务器
- 在设置中配置服务器地址和端口
- 设置巫师账号和密码(请自行注册一个巫师账号，用于执行相关指令)
- 配置 MUD 项目根目录(自动配置,如未配置请输入当前项目根目录，如:D://MUD MUD文件夹为项目根目录文件夹)

### 2. 连接服务器
> ⚠️ 重要：需要修改游戏源码中的 `logind.c` 文件

在验证代码中添加以下判断:
```c
 /** 服务器密钥buyi-SerenezZmuy可在VS Code设置中配置，默认为"buyi-SerenezZmuy" 
 * arg!=sha1(config.get("buyi-SerenezZmuy"))为插件验证登录方式。必须增加此验证判断，否则无法连接。
 * arg!=sha1(crypt(ZJKEY,str)+"APPKEY"+sha1("WWWKEY"))为本项目源码验证方式，不需要更改为同案例一样。
 */
if(arg!=sha1(config.get("buyi-SerenezZmuy")) && arg!=sha1(crypt(ZJKEY,str)+"APPKEY"+sha1("WWWKEY"))/**此方式为本人源码验证方式，不需要更改 */){
write("客户端非法\n");
destruct(ob);
return;
}
```

- 点击活动栏中的 LPC 服务器图标
- 使用"连接游戏服务器"按钮进行连接
- 连接成功后即可使用其他功能

### 3. 编译操作
- 打开目标文件，点击"编译当前文件"
- 使用"编译目录"功能可批量编译

### 4. 命令操作
- 通过"发送自定义命令"按钮执行命令
- 在消息面板查看执行结果

## ⚙️ 配置说明

| 配置项 | 说明 |
|--------|------|
| `gameServerCompiler.host` | 服务器地址 |
| `gameServerCompiler.port` | 服务器端口 |
| `gameServerCompiler.username` | 登录账号 |
| `gameServerCompiler.password` | 登录密码 |
| `gameServerCompiler.serverKey` | 服务器验证密钥，默认为"buyi-SerenezZmuy" |

## ❗ 注意事项

- 本地开发：请确保本地代码与服务器代码保持同步
- 服务器开发：使用 `127.0.0.1` 作为服务器地址
- 重启操作：执行前请确认服务器状态
- 批量编译：大型目录编译可能需要较长时间

## 💬 问题反馈

遇到问题或有建议？欢迎通过以下方式联系：

- [GitHub Issues](https://github.com/SereneZmuy/lpc-server-update/issues)
- 邮箱：279631638@qq.com

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件
