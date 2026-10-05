# dsh-any-icon

一个 [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) 插件：**上传图片 → 自由裁剪为 1:1 → 两类用途**：

1. **App 图标（系统级，v0.3.0）**：把图标设为 **dsh 桌面端自己**的应用图标。机制为「原生 icns 替换 + 实时自定义图标 + 图标缓存刷新」的组合：应用包内 `Contents/Resources/icon.icns` 被替换（ad-hoc 重签名，字节级备份可一键还原），同一张图同时写为应用包的 Finder 自定义图标，并主动刷新 iconservices 与 Dock 图标缓存。**点一下立即生效：访达 / 应用程序 / Dock 一起更新，不重启 dsh、不打断正在运行的任务。** 首次使用 macOS 可能要求「App 管理」权限。
2. **会话图标（dsh 界面内）**：侧栏会话行渲染自定义 16px 图标，任意会话的 `…` 菜单一键分配。

在 dsh 的设置页提供「图标工坊」（Icon Studio）面板完成上述全部流程。

## 功能

**App 图标（系统级，v0.3.0）**

- 工坊底部「dsh 图标」区：从图标库选一个图标，一键「设为 dsh 图标」/「恢复原始图标」
- **实时生效（本次重点）**：访达（应用程序文件夹）、应用程序（Apps / 启动台视图）、Dock 三处**同一瞬间**更新——不重启 dsh、不重启 Dock/Finder、不打断正在运行的任务，整个操作通常在 1–3 秒内完成
- 应用 / 恢复都会刷新以下缓存层：
  1. 应用包内的 `Contents/Resources/icon.icns`（sips + iconutil 生成多尺寸，ad-hoc 重签名）
  2. 应用包的 **Finder 自定义图标**（`Icon\r` + FinderInfo 标志，经 NSWorkspace 写入；访达 / 应用程序 / Dock 优先读这一层）
  3. `iconservicesagent`（SIGKILL，launchd 按需重启）与用户级 iconservices / Dock iconcache
  4. Dock 图标缓存重建通知（`SLSIconAppearanceConfiguration`，即系统设置切换图标外观时发出的同一条通知）→ 正在运行的 dsh 的 Dock 图标立即刷新
  5. `lsregister -f` 重新登记应用包 + 触摸包 mtime，让 LaunchServices / FSEvents 重新读取
- 「恢复原始图标」会把 `icon.icns`、`icon.png`、主可执行文件与 `_CodeSignature/CodeResources` 按字节还原，原始 Developer ID 签名重新有效；自定义图标（`Icon\r` + FinderInfo 标志）被清除
- 状态面板显示目标路径、实时图标 / 原生图标 / 当前签名 / dsh 是否在运行
- 已应用目标记录在 `~/.dsh/any-icon/`（字节级备份 + manifest）
- macOS 首次使用需授予「App 管理」权限（系统会弹窗，或在 系统设置 → 隐私与安全性 → App 管理 中手动开启）

**图标工坊（会话图标）**

- **图标工坊**（设置 → Icon Studio / 图标工坊）
  - 上传 PNG / JPG / WebP（自动降采样超大图）
  - Canvas 裁剪器：**强制 1:1**，拖动定位、滚轮/滑杆缩放、方向键微调（Shift 加速）、90° 旋转、重置；窗口内带形状辅助线
  - **输出规格**（v0.3.0 起）：
    - 「标准 1:1」——方形图标，默认
    - 「macOS Dock」——输出 **1024×1024 文档：824×824 图形 + 四周 100px 透明边距，连续曲率圆角（squircle）遮罩**，符合 macOS 应用图标规格（macOS 的圆角需自绘、系统不会自动加）。做 App 图标请选它；算法与实测校准见 [docs/spike-notes.md](docs/spike-notes.md) 与 [artifacts/squircle-preview.png](artifacts/squircle-preview.png)
  - 图标库：设为默认 / 删除 / 下载多尺寸 PNG 套装（mac-dock 图标含 1024，其余 512/256/128/64）
  - 备份导出 / 导入（JSON，含分配关系）
  - 中英双语（跟随界面语言），存储满额友好提示
- **会话行图标**：侧栏会话标题前 16px 渲染所分配的图标（会话活跃显示状态点时自动让位，遵循 dsh 原生行为）
- **会话菜单入口**：任意会话的 `…` 菜单 → 「自定义图标…」直接从图标库分配或清除
- **默认图标**：未单独分配的会话使用默认图标

图标以 WebP（PNG 兜底）存储在浏览器 localStorage：标准规格为 512px 母版 + 128px 缩略图，mac-dock 规格为 1024px 蒙版文档 + 128px 缩略图，通常每个几 KB 到几十 KB。

## 安装

### Web / CLI（本地开发或体验）

```bash
# 1) 以 link 依赖装入 web profile
cd ~/.dsh/profiles/web
# package.json: dependencies 增加 "dsh-any-icon": "link:<本仓库绝对路径>"
#               dsh.profile.bundles 数组增加 "dsh-any-icon"
ln -sfn <本仓库绝对路径> node_modules/dsh-any-icon

# 2) cordis.patch.yml 追加：
# - insert:
#     - id: any-icon
#       name: dsh-any-icon

# 3) 启动
dsh web --no-open
```

### 桌面版（dsh Desktop）

桌面 profile 由桌面应用独占管理（CLI 写入会被拒绝）。请在桌面版的 **插件管理** 中安装本插件（发布到 npm / GitHub 后可直接安装；发布前可用 `dsh plugin --profile web add link:...` 的方式在 web 端体验）。

> 兼容性：开发与实测基于 CLI 0.1.7-rc.2 与桌面版 0.2.0-rc.2（所用 Slot `settings.section`、`sidebar.session.row.leading`、`sidebar.workspaces.session.menu.item`、`shell.overlay` 均已在 0.2.0-rc.2 源码中确认存在）。dsh 处于开发者预览期，Slot 契约可能变化。

### 卸载

删除上述三处修改（`package.json` 依赖与 bundles、`node_modules` 链接、`cordis.patch.yml` 的 insert 段），或直接从备份恢复：安装脚本在同一目录留下了 `package.json.bak-anyicon` 与 `cordis.patch.yml.bak-anyicon`。浏览器内的图标数据在 `localStorage` 的 `dsh-any-icon.*` 键下，可在工坊中导出备份后清除。

## 架构

双半体插件（Host + Client），通过 dsh 的 Typert 远程服务机制桥接：

```
shared/bridge.js        # 契约单一来源：zod schemas + 调用描述符 + TYPERT_REMOTE
shared/squircle.js      # macOS Dock 图标遮罩算法（G2 连续曲率圆角矩形，纯几何）
lib/index.js            # Host：AnyIconService（applyDshIcon/resetDshIcon/getDshIconState）
lib/remote.js           # Host 契约入口（导入 shared/bridge.js + lib/zod.esm.js）
lib/typert.host.js      # typert-loader 自动发现的反射清单
lib/zod.esm.js          # vendored zod v4（构建产物，已提交）
src/client/main.js      # Client 源码（工坊/裁剪器/侧栏/分配对话框/App 图标区）
client/client.js        # 构建产物：ModuleLoader 包装 + vendored zod/bridge/squircle + main
tools/build-client.mjs  # 构建脚本（node tools/build-client.mjs，见脚本内说明）
tools/verify-squircle.mjs  # squircle 几何断言 + 预览渲染（node tools/verify-squircle.mjs --render）
cordis.patch.yml        # bundle 挂载
```

- **Client → Host**：客户端 `remote.$mount(TYPERT_REMOTE)` 注册本地描述符后，经声明式子上下文 `ctx.inject(['remote.anyIcon'])` 取服务调用；网关在 wire 层用 zod 严格校验双向载荷。此模式与已上架的 whale-pet 插件一致，0.1.x / 0.2.x 均验证可用。
- **客户端持久化**：图标库与分配关系存 localStorage（`dsh-any-icon.*`），经 `actions` 门面隔离。
- **UI**：`ctx.slots.inject` 向宿主 Slot 贡献条目，任一 Slot 不存在时安静降级。
- 机制细节与实证过程见 [docs/spike-notes.md](docs/spike-notes.md)。

### App 图标为什么能「立即生效」

macOS 的应用图标有三个缓存层和一个「谁说了算」的优先级，缺一层就会出现「改了但要等重启」：

| 层 | 位置 | 本插件的处理 |
|---|---|---|
| 原生图标 | `Contents/Resources/icon.icns` | sips + iconutil 生成多尺寸后写回；改了包内容就必须重签名，故随后 `codesign --force --sign -` |
| Finder 自定义图标 | 包根 `Icon\r`（资源分支）+ FinderInfo 的 kHasCustomIcon 位 | `NSWorkspace.setIcon:forFile:options:` 写入；**访达 / 应用程序 / Dock 优先读这一层**，所以它是「看起来立刻变了」的那一层 |
| iconservices 渲染缓存 | `~/Library/Caches/com.apple.iconservices*`、iconservicesagent 内存位图 | SIGKILL `iconservicesagent`（它忽略 SIGTERM）后删除磁盘缓存 |
| Dock 图标缓存 | `$DARWIN_USER_CACHE_DIR/com.apple.dock.iconcache` | 复用系统设置切换图标外观时的那条通知（`SLSIconAppearanceConfiguration`）让 Dock 整表重建——正在运行的 dsh 的 Dock 图标因此无需重启即可刷新 |

两个必须遵守的顺序约束（都是实测结论）：

1. `codesign` 拒绝给带自定义图标的应用包签名（`resource fork, Finder information, or similar detritus not allowed`）——所以流程是「先撤掉自定义图标 → 写 icns → 重签名 → 再写回自定义图标」。
2. 杀 `iconservicesagent` 必须在删缓存之前：它临死会把自己的内存位图写回磁盘，顺序反了会永久落后一版。


## 变更记录

> 版本号说明：历史分支与早期文档中出现过 v2.0 / v2.1 / v2.2 这类内部叫法，它们对应 `package.json` 仍是 `0.1.0` 的开发阶段。从本版起统一使用语义化版本，当前最新为 **v0.3.0**。

**未发布（dev 分支）**

- 新增：「macOS Dock」裁剪输出规格——1024×1024 文档、824×824 图形、四周 100px 透明边距，图形按 **G2 连续曲率圆角矩形（squircle）** 遮罩（1024 画布 / R185.4 弧段 + 曲率渐变过渡，参数与实测校准见 `docs/spike-notes.md` §7）。裁剪器可选、选择跨会话记忆；图库卡片显示「macOS」徽标；PNG 套装下载含 1024 档
- 变更：Host 的 iconset 生成补齐 `icon_512x512@2x`（1024px）档，Retina 大图标场景不再缺表示
- 兼容：旧备份（无 spec 字段）按「标准 1:1」兼容导入；`package.json` 版本号未变

**v0.3.0 · App 图标改为「立即生效」**

- 修复：第二次应用图标必定失败（`codesign` 因包内残留自定义图标报 `resource fork, Finder information, or similar detritus not allowed`），失败发生在写 icns 之后，于是「图标文件变了、界面却没反应」——这正是「不是实时」的根因
- 新增：Finder 自定义图标这一实时层（`NSWorkspace.setIcon:forFile:options:`），访达 / 应用程序 / Dock 优先读它
- 新增：Dock 图标缓存重建通知（`SLSIconAppearanceConfiguration`），正在运行的 dsh 的 Dock 图标无需重启即可刷新
- 移除：`killall -9 Dock Finder`、应用包自动重启（`pkill` + `open`）、`defaults write com.apple.dock ResetLaunchPad`（会清空用户的启动台布局）
- 新增：签名重做前先撤掉自定义图标（顺序约束）；`恢复原始图标` 现在真正会清除自定义图标（旧版本因 `ICON_FILE_NAME` 未定义而静默失败）
- 新增：状态面板显示实时图标 / 原生图标 / 签名 / 版本；备份绑定应用版本，dsh 自动更新后不会把旧可执行文件还原回去
- 性能：整个应用流程 1–3 秒（多尺寸 sips 并发、签名 ~1 秒）
- 版本：`package.json` 0.1.0 → **0.3.0**（统一版本号，`package-lock.json` 同步）

## 路线图

- **v0.4+**：图标库 Host 侧存储（跨浏览器同步）；`set_app_icon` 模型工具（对话式换图标，复用 anyIcon 服务的存储层）
- **待定**：Windows .exe 资源级图标（需 Resource Hacker 类工具链）；更多平台目录扫描

## 已知限制

- **App 图标**：应用/恢复在 1–3 秒内让访达 / 应用程序 / Dock 同步更新，**不需要重启 dsh**；dsh 自身的「关于」面板（App 进程内的图标）会在下次启动 dsh 时更新。dsh 自动更新会整体替换应用包并还原图标，重新应用即可。
- **App 图标写入**：需要 macOS「App 管理」权限（写应用包 + 写自定义图标都受它管辖）；若系统拒绝，界面会给出中文提示与授权路径。
- 「恢复原始图标」恢复的是 any-icon 首次应用前的备份；如果该应用在 any-icon 接管前就已有第三方自定义图标，插件不会覆盖它，并会明确报错。
- **macOS Dock 规格**：建议原图边长 ≥ 1024px（不足会放大，略软）；图标边缘由插件按模板自绘 squircle，与 macOS 26 系统实际渲染的遮罩存在 ≤2.5% 的形状系统差（Dock 显示尺寸下不可见，见 spike-notes §7）。
- **会话图标**：仅在会话处于静息态时显示（活跃/新消息时 dsh 原生状态点优先，属 Slot 契约设计）
- 图标库上限 30 个；单图超过 20MB 拒绝上传；图标数据不跨浏览器/设备同步（用「导出备份 / 导入备份」手动迁移）

## License

MIT
