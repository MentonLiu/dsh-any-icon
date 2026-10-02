# M0 技术验证笔记（spike notes）

> 结论基于本机实际安装的代码验证，而非仅文档：
> - 桌面版 `/Applications/DeepSeek Harness.app` = **0.2.0-rc.2**（asar 内提取源码核对）
> - npm CLI `@deepseek-ai/dsh` = 0.1.7-rc.2（`~/.local/bin/dsh`）
> - 参照插件：`dshmarket`（web profile，纯客户端第三方插件）、`dsh-plugin-whale-pet`（desktop profile，含 Host 远程服务的第三方插件）、`@deepseek-ai/dsh-client-ui-agent-preset`（一方案例）

## 1. 插件安装与加载（已验证）

- Profile 位于 `~/.dsh/profiles/<name>/`，`package.json` 的 `dsh.profile.bundles` 列出 bundle 包名；第三方包作为依赖（支持 `link:` 本地路径）装入 profile 的 node_modules。
- **desktop profile 由 Electron 应用独占管理**，CLI 写入会报错 `profile "desktop" is managed exclusively by the Electron application`。开发期用 **web profile**（`dsh web --profile web`，http://127.0.0.1:3080）。
- bundle 的 cordis 挂载：包内 `cordis.patch.yml`（`dsh.bundle.patch` 指向），内容 `- insert: [{ id, name }]`。

## 2. Client 模块系统（已验证，any-icon 的核心路径）

- 包声明：`package.json` → `dsh: { client: { platform: "web", inject: [...] } }`，`exports["./client"]` 指向打包产物（惯例 `client/client.js`）。
- 产物格式（rolldown/CJS 包裹，本插件直接手写同构格式，免构建）：

```js
window.__ModuleLoader__.load({
  id: "dsh-any-icon",              // = 包名
  factory: (require) => {
    const react = require("react") // 宿主 React 实例
    const name = "any-icon"
    const inject = ["slots", "locale", "theme"]   // 客户端服务
    function apply(ctx) { /* ctx.slots / ctx.locale / ctx.effect ... */ }
    return { name, inject, apply }
  },
})
```

- 客户端可用服务（已在真实插件中见到）：`slots`、`locale`、`theme`、`sessions`、`conversation`、`uiWorkspace`、`remote`、`configForms`。
- 注册 Slot：`ctx.slots.register({ name, id, order, locale, inject }, Component)`；向他人声明的 Slot 贡献条目用 `ctx.slots.inject('<slot>', () => ctx.slots.register(...))`。
- Slot 键是点分字符串，类型上经 `SlotMap` 声明合并校验（kind: single/list/keyed/chain）。

## 3. 本插件使用的 Slot（0.1.7 与 0.2.0-rc.2 均确认存在）

| Slot | kind | 用途 |
|---|---|---|
| `settings.section` | list | 设置页分区（图标工坊面板）；条目 props 仅 id/order/label，组件自绘 |
| `sidebar.session.row.leading` | list | 会话行标题前 16px 图标位；owner props: `{ sessionId }`；主状态非 idle 时被状态点替代（合理，图标是静息态装饰） |

不可行：Hero 预设 chip（`conversation.hero.agentPreset`）渲染固定内置 SVG 图标、AgentPreset 数据无 icon 字段——**官方无"应用图标"替换 seam**（Q2 结论）。

## 4. Client→Host 与存储（Q3/Q4 结论）

- 一方 API 用 typert 代码生成；第三方可用运行时 TYPERT 描述符 + `service.typertRemote = { service, serviceKey, namespace }` + `ctx.provide(key, service)` 注册远程命名空间（whale-pet 已验证，注意需在注册后用声明了 `remote.<ns>` 的子上下文调用）。
- **v1 决策：纯客户端**——参照 dshmarket（真实第三方插件）用 localStorage 持久化，不发 Host 请求。理由：a) 图标数据量小（512px PNG ≈ 100–300KB）；b) typert 机器复杂且 0.1.7 测试环境与用户 0.2.0-rc.2 桌面版存在版本差，纯客户端对两者行为一致；c) 零审批/零权限面。
- `set_app_icon` 模型工具随 Host 存储一起移到 v1.1（工具在 Host 侧无法触达客户端 localStorage，需要先有 Host 存储）。

## 5. 版本与测试矩阵

- 开发自测：`dsh web --profile web`（0.1.7-rc.2，link: 装入 web profile）。
- 用户环境：桌面版 0.2.0-rc.2（desktop profile）——两个 Slot 均已在其源码中确认；0.2.0-rc.2 实测由用户安装后进行。
- 防御性设计：Slot 注入全部走 `ctx.slots.inject`（Slot 不存在时不崩溃），`require` 前不假设导出存在。

## 6. App 图标实时生效（v0.3.0 实测，macOS 26.6.2 / 桌面版 0.2.0-rc.2）

旧版（文档内曾称 v2.1）的「应用后 dsh 自动重启」看似可行，实际有两个硬伤：一是 `codesign` 与自定义图标不能共存，二是重启本身就不是「实时」。逐条实测结论：

| # | 结论 | 证据 / 复现 |
|---|---|---|
| 1 | Host 半体运行在**子进程**（`ELECTRON_RUN_AS_NODE` 模式启动的 Electron 二进制 + `@deepseek-ai/dsh-desktop-host`），拿不到 Electron 主进程的 `app.dock.setIcon` | 桌面 `lib/main.js`：`spawn(this.node, ["--expose-internals", entry, ...])`；`ps` 里对应 `.../MacOS/DeepSeek Harness --expose-internals .../dsh-desktop-host/lib/index.js` |
| 2 | **`codesign` 拒绝给带自定义图标的应用包签名**：`resource fork, Finder information, or similar detritus not allowed`。清掉包根 `com.apple.FinderInfo` 后立刻成功 | 克隆应用包实测：带自定义图标 → 失败；`xattr -d com.apple.FinderInfo` → 成功。这解释了旧版「第二次应用必然失败、图标文件已改但界面无反应」 |
| 3 | 1 GB Electron 应用包的 ad-hoc 重签名只需 **~0.9 秒**，不必异步、不必重启应用 | `time codesign --force --sign - <克隆>` |
| 4 | `NSWorkspace.setIcon:forFile:options:` 写的自定义图标落在包根 `Icon\r` 的 **`com.apple.ResourceFork` 扩展属性**里（数据分支为 0 字节），同时置 FinderInfo 的 `kHasCustomIcon`(0x0400) 位；`NSWorkspace.icon(forFile:)` 立刻返回该图 —— 访达 / 应用程序 / Dock 读的就是它 | JXA 写入后读回，并把 `icon(forFile:)` 渲染成 PNG 比对 |
| 5 | 让 **正在运行**的应用的 Dock 图标刷新：调用私有 `SLSIconAppearanceConfiguration.fetchCurrentIconAppearanceConfiguration` → `save`（系统设置切换图标外观时发的同一条通知），Dock 随即重建 `$DARWIN_USER_CACHE_DIR/com.apple.dock.iconcache` | 对照实验：静置 8 秒 iconcache mtime 不变；执行该通知后 3 秒内 mtime 更新。类/选择器在本机存在（`NSClassFromString` 命中，`save` 可调用） |
| 6 | `iconservicesagent` 忽略 SIGTERM，必须 `killall -9`；且必须先杀它再删磁盘缓存，否则它临死把内存里的旧位图写回 | 与旧版注释一致，复测确认 |
| 7 | 不需要 `killall Dock` / `killall Finder`，也不需要 `defaults write com.apple.dock ResetLaunchPad`（后者会清空用户启动台布局，旧版实测已在用户机上留下 `ResetLaunchPad = 1`） | 无 Dock/Finder 进程被杀，访达 / 应用程序 / Dock 均更新 |

端到端实测（`DSH_ANY_ICON_APP_PATH=<克隆>`，`HOME` 重定向以隔离 manifest/backup）：

- 首次应用 4.5 s（冷启动 sips），二次应用 1.5 s，签名 `valid`，`live/native/dockRefreshed` 全为 true；
- 在「旧版遗留状态」（包根已有 `Icon\r` + FinderInfo 标志）的应用包上应用同样成功 —— 迁移路径可用；
- 恢复：450 ms，清掉 `Icon\r` 与 FinderInfo 标志，并从备份还原出**原始 Developer ID 签名**（`codesign --verify` 通过）；
- 备份绑定了 `CFBundleShortVersionString`：版本不匹配时跳过字节还原，避免把 dsh 自动更新后的新可执行文件换回旧版。
