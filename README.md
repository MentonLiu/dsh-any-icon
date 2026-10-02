# dsh-any-icon

一个 [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) 插件：**上传图片 → 自由裁剪为 1:1 → 应用为会话图标**。

在 dsh 的设置页提供「图标工坊」（Icon Studio）面板，侧栏会话行渲染自定义图标，并支持从任意会话的 `…` 菜单一键分配图标。

## 功能

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

纯客户端插件（与 dshmarket 同款路径），无 Host 侧存储、无额外权限面：

```
client/client.js   # 全部逻辑：ModuleLoader 模块（纯 JS，无构建步骤）
lib/index.js       # Host 存根（v1.1 预留：Host 存储 + set_app_icon 模型工具）
cordis.patch.yml   # bundle 挂载
```

- 存储：localStorage（`dsh-any-icon.icons.v1` / `dsh-any-icon.assign.v1`），经 `actions` 门面隔离，v1.1 可整体替换为 Host 存储 + typert 远程服务（参照 whale-pet 已验证的 `typertRemote` 模式）。
- UI：`ctx.slots.inject` 向宿主 Slot 贡献条目，任一 Slot 不存在时安静降级，不会导致启动失败。
- 机制细节与实证过程见 [docs/spike-notes.md](docs/spike-notes.md)。

## 路线图

- **v1.1**：Host 侧存储 + `set_app_icon` / `list_app_icons` 模型工具（对话式换图标）；跨浏览器同步（随 dsh 数据）
- **待官方 seam**：Agent 预设（模式）图标与工作区图标目前是固定内置图形，官方未提供替换缝；一旦开放即接入

## 已知限制

- 图标数据不跨浏览器/设备同步（localStorage 隔离）；用「导出备份 / 导入备份」手动迁移
- 会话行图标仅在会话处于静息态时显示（活跃/新消息时 dsh 原生状态点优先，属 Slot 契约设计）
- 图标库上限 30 个；单图超过 20MB 拒绝上传

## License

MIT
