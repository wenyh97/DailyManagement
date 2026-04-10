# Implementation Plan: TonyBase Desktop Capture

**Branch**: `002-desktop-capture` | **Date**: 2026-04-10
**Input**: 用户确认采用 Tauri 落地桌面快速记录弹窗，PWA 延后到域名与 HTTPS 就绪后再推进。

## Summary

本阶段目标是为现有日常管理系统增加一个 Windows 桌面快速记录客户端。该客户端基于 Tauri 实现，提供系统级快速弹窗，用于将一句话灵感直接提交到现有灵感接口，不替代现有 Web 主系统。

首期范围仅覆盖最小可用闭环：

1. 一个小窗口
2. 一个输入框
3. 一个提交按钮
4. 提交到现有 `/ideas` 接口
5. 一个全局快捷键，按下弹出窗口
6. 关闭后不退出，只缩到托盘
7. 开机自启
8. 设置面板包含用户信息、退出登录、版本更新
9. 网页提供统一下载页，安装包文件放在服务器下载目录

PWA 与移动原生客户端均不纳入本阶段实现，只预留下载页结构和版本元数据设计。

## Product Goals

### Primary Goal

将“在电脑旁时快速记录一句话”的路径从“打开浏览器 -> 登录 -> 切换页面 -> 输入”压缩为“快捷键呼出 -> 输入 -> 提交 -> 自动隐藏”。

### Success Criteria

1. 用户在任意桌面状态下通过快捷键可在 1 秒左右呼出记录窗口
2. 窗口弹出后输入框默认聚焦
3. 一条灵感可在 3 秒内完成提交
4. 关闭窗口时应用继续驻留托盘
5. 安装后支持开机自启
6. 桌面端能够检查新版本并跳转下载最新版安装包

## Scope

### In Scope

1. Tauri Windows 桌面客户端
2. 快速记录单窗体界面
3. 复用现有后端认证与灵感接口
4. 托盘、全局快捷键、开机自启
5. 设置面板
6. 网页下载页
7. 安装包静态分发
8. 版本元数据文件

### Out of Scope

1. 自动静默更新
2. 桌面端复杂多页面
3. 桌面端完整主系统功能
4. PWA 正式发布
5. Android 原生 App
6. 多平台打包（macOS/Linux）
7. 离线本地数据库

## Technical Architecture

### High-Level Design

桌面方案采用“三层结构”：

1. 前端层：一个极简 capture 窗口界面，负责输入、提交、用户信息展示和设置面板交互
2. Tauri 宿主层：负责窗口生命周期、托盘、快捷键、开机自启、版本检查入口
3. 现有 Web API：继续作为数据与认证后端，不重复实现业务逻辑

### Request Flow

1. 用户按下全局快捷键
2. Tauri 显示并聚焦主窗口
3. 用户输入一句话
4. 前端调用现有后端 `/ideas` 接口提交数据
5. 成功后显示短反馈并清空输入框
6. 用户关闭窗口后应用仅隐藏到托盘

### Login Strategy

桌面端不直接复用浏览器 localStorage，而是单独维护自己的登录态。

首期建议：

1. 桌面端首次启动时提供登录入口
2. 登录成功后将 token 与用户信息存本地配置目录
3. 设置页展示当前用户信息与退出登录按钮
4. token 失效时提示重新登录

## Repository Structure Proposal

建议在仓库中新增独立桌面客户端目录，不与现有 `frontend/` 主站耦合。

```text
desktop-capture/
├── package.json
├── src/
│   ├── index.html
│   ├── styles.css
│   ├── main.js
│   ├── settings.js
│   └── assets/
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    └── src/
        └── main.rs
```

说明：

1. `desktop-capture/src/` 只放桌面小窗前端
2. `desktop-capture/src-tauri/` 负责 Rust 宿主逻辑
3. 现有 `frontend/` 保持为主站，不强耦合桌面窗口 UI

## Window Behavior Design

### Default Window Rules

1. 尺寸小而固定，适合一眼输入
2. 打开时默认居中或记忆上次位置
3. 支持置顶
4. 弹出时自动聚焦输入框
5. 提交成功后可选择保留窗口或自动隐藏，首期建议保留并清空输入框

### Close Behavior

1. 点击关闭按钮不真正退出应用
2. 主窗口隐藏到系统托盘
3. 托盘菜单中提供“显示窗口”和“退出程序”

### Shortcut Behavior

默认快捷键建议：`Ctrl+Shift+Space`

行为：

1. 若窗口隐藏，则显示并聚焦
2. 若窗口已显示，则聚焦至前台

首期快捷键可以固定值，后续再开放自定义。

## Settings Panel Design

设置面板首期仅保留必要项，避免喧宾夺主。

### Section A: Account

展示：

1. 当前用户名
2. 当前服务地址
3. 登录状态

操作：

1. 退出登录

### Section B: App

展示：

1. 当前快捷键
2. 开机自启状态

操作：

1. 开机自启开关

### Section C: Updates

展示：

1. 当前版本号
2. 最新版本号
3. 最近检查时间
4. 更新说明摘要

操作：

1. 检查更新
2. 下载最新版
3. 打开下载页

## Distribution Design

### Installer Naming

桌面安装包命名采用如下格式：

`tonydm-tonybase-capture-0.1.0-x64-setup.exe`

字段含义：

1. `tonydm`：项目标识
2. `tonybase-capture`：产品名
3. `0.1.0`：语义化版本号
4. `x64`：平台架构
5. `setup`：安装包类型

### Server Directory Layout

服务器下载目录采用统一结构：

```text
/home/TonyAdmin/downloads/
├── desktop/
│   └── tonydm-tonybase-capture-0.1.0-x64-setup.exe
├── mobile/
└── metadata/
    └── desktop-latest.json
```

说明：

1. `desktop/` 放 Windows 桌面安装包
2. `mobile/` 预留未来原生移动客户端
3. `metadata/` 放版本元数据 JSON

## Download Page Design

下载页建议单独实现，例如 `downloads.html`。

### First Release Content

1. 页面标题与简介
2. Windows 桌面版下载卡片
3. 当前版本、发布时间、更新说明
4. 下载按钮
5. 安装说明
6. 移动端“即将推出”占位卡片

### Style Direction

保持与现有主站统一：

1. 渐变背景
2. 玻璃卡片
3. 粗体标题
4. 大按钮
5. 信息层级简洁清晰

## Version Metadata Design

桌面端与网页下载页共用同一份版本文件：

`/home/TonyAdmin/downloads/metadata/desktop-latest.json`

建议字段：

```json
{
  "product": "TonyBase Capture",
  "version": "0.1.0",
  "platform": "windows-x64",
  "installerName": "tonydm-tonybase-capture-0.1.0-x64-setup.exe",
  "downloadUrl": "https://example.com/downloads/desktop/tonydm-tonybase-capture-0.1.0-x64-setup.exe",
  "publishedAt": "2026-04-10T12:00:00Z",
  "notes": [
    "首个桌面快速记录版本",
    "支持托盘驻留、全局快捷键、开机自启"
  ],
  "required": false
}
```

## Update Strategy

### Phase 1 Update Behavior

首期不做完整自动升级，只做“检查更新 + 下载最新版”。

流程如下：

1. 用户点击“检查更新”
2. 客户端请求 `desktop-latest.json`
3. 比较当前版本与最新版本
4. 若无更新，则提示当前已是最新版本
5. 若有更新，则展示新版本号和更新说明
6. 用户点击“下载最新版”后，打开下载链接或触发本地下载

### Deferred

以下能力延后：

1. 静默更新
2. 增量更新
3. 自动下载并自动安装

## Security Notes

1. 桌面端调用线上 API 时，优先使用域名，不长期绑定裸 IP
2. 首期安装包分发可不做代码签名，但要预期 Windows 可能出现安全提示
3. 登录 token 需保存在本地应用数据目录，不写入明文脚本文件
4. 服务地址应允许配置，便于后期切换到正式域名

## Development Phases

### Phase 0: Setup

1. 创建 `desktop-capture/` 项目结构
2. 初始化 Tauri 工程
3. 建立最小前端页面
4. 确认能在本地启动空白桌面窗口

### Phase 1: Core Capture Window

1. 实现小窗 UI
2. 输入框默认聚焦
3. 接现有 `/ideas` 接口
4. 成功后清空输入框并提示
5. 失败时展示错误提示

### Phase 2: Desktop Integration

1. 全局快捷键
2. 托盘图标与托盘菜单
3. 关闭改为隐藏
4. 开机自启

### Phase 3: Settings

1. 账户信息展示
2. 退出登录
3. 当前版本展示
4. 检查更新按钮
5. 打开下载页与下载最新版按钮

### Phase 4: Distribution

1. 打包 Windows 安装包
2. 上传安装包到服务器目录
3. 上传 `desktop-latest.json`
4. 新增网页下载页
5. 验证下载与安装流程

## Task Checklist

### Backend / API

1. 确认现有 `/api/auth/login` 与 `/ideas` 可直接复用
2. 如有必要，为桌面端补充服务地址配置约定

### Desktop Client

1. 初始化 Tauri 工程
2. 完成 capture 主窗口 UI
3. 集成登录与 token 存储
4. 接入 `/ideas` 提交
5. 集成全局快捷键
6. 集成托盘
7. 集成关闭隐藏逻辑
8. 集成开机自启
9. 增加设置面板
10. 实现版本检查与下载按钮

### Web Download Page

1. 新增下载页
2. 新增桌面版下载卡片
3. 新增移动端占位卡片
4. 读取版本元数据并展示最新版本

### Release Process

1. 打包安装包
2. 上传 exe 到 `/home/TonyAdmin/downloads/desktop`
3. 更新 `desktop-latest.json`
4. 验证网页下载
5. 验证桌面端设置页“检查更新”

## Recommended First Milestone

第一个可验收里程碑定义为：

1. 可启动桌面小窗
2. 可登录
3. 可提交一句话到灵感接口
4. 可通过快捷键呼出
5. 可缩到托盘而不退出

达到该里程碑后，再推进开机自启、设置页和下载分发。

## Notes

1. PWA 方案延期到域名与 HTTPS 到位后再继续
2. 本方案优先保证桌面快速捕获，不追求一次性做成完整桌面主站
3. 后续若移动端转原生 App，可继续复用下载页与版本元数据结构