# dsh-any-icon

一个 [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) 插件：**上传图片 → 自由裁剪为 1:1 → 两类用途**：

1. **App 图标（系统级，v2.1）**：把图标设为 **dsh 桌面端自己**的应用图标。机制为替换应用包内 `Contents/Resources/icon.icns` + ad-hoc 重签名 + 刷新 Dock——原生图标管线，Finder/Dock/启动台全部生效；原始图标字节级备份，一键还原后原签名重新有效。首次使用 macOS 可能要求「App 管理」权限。
2. **会话图标（dsh 界面内）**：侧栏会话行渲染自定义 16px 图标，任意会话的 `…` 菜单一键分配。

在 dsh 的设置页提供「图标工坊」（Icon Studio）面板完成上述全部流程。

## 功能

**App 图标（系统级，v2.0）**

- 工坊底部「App icons / App 图标」区：应用列表（自动扫描 /Applications、/System/Applications、~/Applications 等）、名称筛选、图标选择
- 一键应用 / 一键恢复默认；默认目标自动选中 DeepSeek Harness
- macOS 实现：NSWorkspace 自定义图标（`Icon\r` 资源 + Finder 标志位，均在 `Contents/` 之外）——**代码签名不受影响**，Finder 立即生效（Dock 可能需重启对应应用刷新）
- 已应用目标记录在 `~/.dsh/any-icon/applied.json`；「恢复默认」只回收 any-icon 应用过的图标，不碰用户既有自定义
- Windows（实验性）：重写 .lnk 快捷方式的 `IconLocation`（生成 PNG 内嵌 .ico）；.exe 资源级改图标不在范围内

**图标工坊（会话图标）**

- **图标工坊**（设置 → Icon Studio / 图标工坊）
  - 上传 PNG / JPG / WebP（自动降采样超大图）
  - Canvas 裁剪器：**强制 1:1**，拖动定位、滚轮/滑杆缩放、方向键微调（Shift 加速）、90° 旋转、重置；窗口内带圆形辅助线
  - 图标库：设为默认 / 删除 / 下载多尺寸 PNG 套装（512/256/128/64）
  - 备份导出 / 导入（JSON，含分配关系）
  - 中英双语（跟随界面语言），存储满额友好提示
- **会话行图标**：侧栏会话标题前 16px 渲染所分配的图标（会话活跃显示状态点时自动让位，遵循 dsh 原生行为）
- **会话菜单入口**：任意会话的 `…` 菜单 → 「自定义图标…」直接从图标库分配或清除
- **默认图标**：未单独分配的会话使用默认图标

图标以 WebP（PNG 兜底）存储在浏览器 localStorage，512px 母版 + 128px 缩略图，通常每个仅几 KB。

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
lib/index.js            # Host：AnyIconService（applyAppIcon/resetAppIcon/listApps）
lib/remote.js           # Host 契约入口（导入 shared/bridge.js + lib/zod.esm.js）
lib/typert.host.js      # typert-loader 自动发现的反射清单
lib/zod.esm.js          # vendored zod v4（构建产物，已提交）
src/client/main.js      # Client 源码（工坊/裁剪器/侧栏/分配对话框/App 图标区）
client/client.js        # 构建产物：ModuleLoader 包装 + vendored zod/bridge + main
tools/build-client.mjs  # 构建脚本（node tools/build-client.mjs，见脚本内说明）
cordis.patch.yml        # bundle 挂载
```

- **Client → Host**：客户端 `remote.$mount(TYPERT_REMOTE)` 注册本地描述符后，经声明式子上下文 `ctx.inject(['remote.anyIcon'])` 取服务调用；网关在 wire 层用 zod 严格校验双向载荷。此模式与已上架的 whale-pet 插件一致，0.1.x / 0.2.x 均验证可用。
- **客户端持久化**：图标库与分配关系存 localStorage（`dsh-any-icon.*`），经 `actions` 门面隔离。
- **UI**：`ctx.slots.inject` 向宿主 Slot 贡献条目，任一 Slot 不存在时安静降级。
- 机制细节与实证过程见 [docs/spike-notes.md](docs/spike-notes.md)。

## 路线图

- **v1.1+**：图标库 Host 侧存储（跨浏览器同步）；`set_app_icon` 模型工具（对话式换图标，复用 anyIcon 服务的存储层）
- **待定**：Windows .exe 资源级图标（需 Resource Hacker 类工具链）；更多平台目录扫描

## 已知限制

- **App 图标**：Finder 立即生效，Dock / 启动台可能需要重启对应应用（或重新登录）才刷新；「恢复默认」不会碰 any-icon 之前就存在的自定义图标（会明确报错提示）；Windows 路径为实验性，未经真机验证
- **会话图标**：仅在会话处于静息态时显示（活跃/新消息时 dsh 原生状态点优先，属 Slot 契约设计）
- 图标库上限 30 个；单图超过 20MB 拒绝上传；图标数据不跨浏览器/设备同步（用「导出备份 / 导入备份」手动迁移）

## License

MIT
