# dsh-any-icon

一个 [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) 插件：**上传图片 → 裁成 1:1 图标 → 设为 dsh 桌面端自己的应用图标**。

访达 / 应用程序 / Dock **立即同步更新**（1–3 秒），不重启 dsh、不打断运行中的任务；可一键恢复原图标。全部流程在 dsh 设置页的「图标工坊」（Icon Studio）面板完成。

> **验证范围**：原有深度实测基于 **macOS 26 + dsh 桌面版 0.2.0-rc.2**。v0.3.4 改为只设置 Finder 自定义图标，以保留 dsh 官方代码签名；此修复尚未做新的深度桌面端验证。兼容范围声明为 dsh `>=0.2.1-rc.2 <0.3.0-0`。**Windows 尚未做深度验证**，行为不作保证（App 图标替换本身也仅实现了 macOS）。

## 功能一览

### 图标工坊

- **上传**：PNG / JPG / WebP，单图 ≤ 20MB，建议边长 ≥ 1024px
- **裁剪器**：强制 1:1；拖动定位、滚轮 / 滑杆缩放、方向键微调（Shift 加速）、90° 旋转、重置
- **输出规格**：
  - 「标准 1:1」——方形图标，适合导出通用图片
  - 「macOS Dock」（默认，记住上次选择）——输出 1024×1024 的 macOS 应用图标文档：824×824 图形 + 四周 100px 透明边距，图形按**连续曲率圆角（squircle）**遮罩（macOS 的应用图标圆角由开发者自绘，系统不会自动加）

  ![squircle 与同半径普通圆角矩形对比](artifacts/squircle-preview.png)
- **图标库**：删除 / 下载多尺寸 PNG 套装（macOS Dock 图标含 1024px，其余 512/256/128/64）
- **备份**：导出 / 导入 JSON，可跨浏览器迁移
- 中英双语（跟随界面语言），存储满额友好提示

### dsh App 图标

- 工坊底部「dsh 图标」区：从图库选一个图标 → 「设为 dsh 图标」/「恢复原始图标」
- 应用前统一处理为带透明圆角和边距的 macOS Dock PNG，只设置 Finder 自定义图标；不改写签名保护的 `Contents/` 文件，也不执行 ad-hoc 重签名
- 点一下立即生效：访达（应用程序文件夹）、应用程序 / 启动台视图、Dock 三处同一瞬间更新——不重启 dsh、不重启 Dock/Finder、不打断正在运行的任务
- 状态面板：目标路径、Finder 自定义图标、当前签名 / 应用版本 / 是否运行；若检测到旧版插件留下的 ad-hoc 签名，会提示恢复方式
- dsh 自身的「关于」面板可能继续显示应用包内的原始图标；dsh 自动更新可能清除 Finder 自定义图标，更新后重新应用即可

## 使用说明

1. **打开工坊**：dsh 设置 → 图标工坊。
2. **上传并裁剪**：点「上传图片」选图，拖动 / 缩放把想保留的画面摆进裁剪窗；点「保存图标」入图库。默认输出「macOS Dock」规格，应用旧图标或「标准 1:1」图标时也会自动补上透明圆角和边距。
3. **设为 dsh 图标**：在「dsh 图标」区从图库选中图标 → 「设为 dsh 图标」→ 确认。首次使用 macOS 会弹出「App 管理」权限请求，请允许（或在 系统设置 → 隐私与安全性 → App 管理 中手动开启）。
4. **还原与迁移**：随时「恢复原始图标」还原 dsh 图标；「导出备份」把图库存为 JSON，在别的浏览器里「导入备份」即可迁移。

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

> 兼容性：`package.json` 的 `engines.dsh` 声明支持 `>=0.2.1-rc.2 <0.3.0-0`。本机桌面版 0.2.1-rc.2 已完成上述运行验证；插件对接的设置 Slot 与 Typert 远程服务接口无需迁移。**Windows 未做深度验证**；dsh 处于开发者预览期，Slot 契约可能变化。

### 卸载

删除上述修改（`package.json` 依赖与 bundles、`node_modules` 链接、`cordis.patch.yml` 的 insert 段），或从备份恢复：同目录下留有 `package.json.bak-anyicon` 与 `cordis.patch.yml.bak-anyicon`。浏览器内的图标数据在 `localStorage` 的 `dsh-any-icon.*` 键下，可在工坊中导出备份后清除。

## 技术实现（简）

双半体插件：Node.js **Host**（`lib/index.js`，提供 `anyIcon` 远程服务）+ 浏览器 **Client**（`src/client/main.js`，图标工坊 UI），经 dsh 的 Typert 远程服务桥接，契约单源在 `shared/bridge.js`（zod 双端校验）。客户端图标数据存 localStorage；UI 经 dsh Slot 注入，Slot 缺失时安静降级。

App 图标只通过 `NSWorkspace.setIconForFileOptions` 写入 Finder 自定义图标，并刷新 iconservices、LaunchServices 与 Dock 图标缓存。正常应用图标时，插件不改写签名保护的 `Contents/` 文件，也不执行 `codesign`，因此不会把官方签名替换成 ad-hoc 签名。对于旧版本留下的签名损坏，仅当备份版本与已安装 dsh 完全一致时才恢复原始文件和签名，避免误把旧版本覆盖到新版本。macOS Dock 规格的遮罩为 G2 连续曲率圆角矩形（参数经 macOS 26 系统渲染图标实测校准）。

```
shared/bridge.js           Client↔Host 契约（zod + 调用描述符）
shared/squircle.js         macOS Dock 遮罩算法（纯几何）
lib/index.js               Host：AnyIconService
src/client/main.js         Client：工坊 / 裁剪器 UI
client/client.js           构建产物（已提交，安装无需构建）
tools/build-client.mjs     构建脚本
tools/verify-squircle.mjs  遮罩几何断言 + 预览渲染
tools/verify-icon-output.html  浏览器实际应用路径的像素回归检查（仓库根目录启动本地静态服务后打开）
```

## 变更记录

> 历史分支与早期文档中的 v2.0 / v2.1 / v2.2 为内部叫法；自 v0.3.0 起使用语义化版本。

- **v0.3.3**：修复 Dock 图标方角，应用前统一生成透明圆角 PNG；旧图库图标自动转换，已有 Dock 图标避免重复增加边距；默认选择 macOS Dock 输出，缩略图展示真实轮廓；新增 5 项浏览器像素回归检查，并在 dsh 0.2.1-rc.2 验证实际应用
- **v0.3.4**：修复应用更新签名校验失败；停止改写 App 包内图标和 ad-hoc 重签名，只使用 Finder 自定义图标；为旧版留下的签名损坏增加恢复提示和同版本备份恢复
- **v0.3.2**：适配 dsh 0.2.1，声明 `engines.dsh` 兼容范围（`>=0.2.1-rc.2 <0.3.0-0`）
- **v0.3.1**：新增「macOS Dock」裁剪输出规格（1024×1024 画布 + squircle 遮罩）；ICNS 补齐 1024px 档；移除会话图标功能，插件聚焦 dsh App 图标
- **v0.3.0**：App 图标改为「立即生效」——双层图标 + 图标缓存刷新，不再重启 dsh / Dock / Finder；字节级备份 + 一键还原（旧版实现）
- 更早（会话图标 v1 等）的变更：见 Git 历史

## 路线图

- **v0.4+**：图标库 Host 侧存储（跨浏览器同步）；`set_app_icon` 模型工具（对话式换图标）
- **待定**：Windows .exe 资源级图标（需 Resource Hacker 类工具链）；更多平台目录扫描

## 已知限制

- **平台验证范围**：仅在 **macOS 深度验证**（开发、实测、签名与还原流程）；**Windows 未做深度验证**，行为不作保证。App 图标替换本身仅实现 macOS。
- **App 图标**：dsh 自身的「关于」面板可能仍显示应用包内的原始图标；dsh 自动更新可能清除 Finder 自定义图标，重新应用即可。需要 macOS「App 管理」权限，被拒时界面会给出授权指引。
- **旧版签名恢复**：旧版插件可能已把 dsh 改为 ad-hoc 签名。如果备份版本与当前 dsh 完全一致，插件会恢复原始签名；如果版本不一致，插件会提示从官方安装包重新安装当前版本，不会用旧备份覆盖新版 dsh。
- **macOS Dock 规格**：建议原图边长 ≥ 1024px；自绘 squircle 与系统实际遮罩有 ≤2.5% 的形状系统差（Dock 显示尺寸下不可见）。
- 图标库上限 30 个；单图超 20MB 拒绝上传；图标数据不跨浏览器 / 设备自动同步。

## License

MIT
