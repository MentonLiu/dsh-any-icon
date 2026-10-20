
    const React = require("react");
    const ReactDOM = require("react-dom");
    const createElement = React.createElement;

    // ------------------------------------------------------------------
    // Constants
    // ------------------------------------------------------------------
    const NS = "anyIcon";
    const LS_ICONS = "dsh-any-icon.icons.v1";
    const LS_CROP_SPEC = "dsh-any-icon.cropspec";
    const MASTER = 512;          // stored master edge, px
    const THUMB = 128;           // stored thumbnail edge, px
    const MAX_INPUT_BYTES = 20 * 1024 * 1024;
    const MAX_LIBRARY = 30;
    const PACK_SIZES = [512, 256, 128, 64];
    const CANVAS = 640;          // internal crop-editor resolution
    const WINDOW_RATIO = 0.72;   // crop window side / canvas side
    // Output specs. "mac-dock" renders the macOS app-icon document (see
    // __DAI_SQUIRCLE__/shared/squircle.js): 1024 canvas, 824 graphic, 100px
    // transparent margins, continuous-curvature (squircle) mask.
    const SPEC_SQUARE = "square";
    const SPEC_MAC = "mac-dock";
    const { MAC_ICON_SPEC: MAC_SPEC, squirclePathData } = __DAI_SQUIRCLE__;

    // ------------------------------------------------------------------
    // Locale
    // ------------------------------------------------------------------
    const zh = {
      nav: "图标工坊",
      title: "图标工坊",
      intro: "上传图片，裁成 1:1 图标，可设为 dsh 桌面端的应用图标。图标保存在本机浏览器中。",
      specLabel: "输出规格",
      specSquare: "标准 1:1",
      specMac: "macOS Dock",
      specMacNote: "输出 1024×1024：824 图形 + 四周 100px 透明边距，连续曲率圆角（squircle）——符合 macOS 应用图标规格。建议原图边长 ≥ 1024px。",
      badgeMac: "macOS",
      upload: "上传图片",
      uploadHint: "支持 PNG / JPG / WebP，建议边长 ≥ 512px",
      cropTitle: "裁剪为 1:1",
      cropHint: "拖动调整位置，滚轮或滑杆缩放，方向键微调（Shift 加速）",
      zoom: "缩放",
      rotate: "旋转 90°",
      reset: "重置",
      confirm: "保存图标",
      cancel: "取消",
      back: "返回图库",
      library: "图标库",
      emptyLibrary: "还没有图标。点击「上传图片」创建第一个。",
      delete: "删除",
      confirmDelete: "删除图标「{name}」？",
      downloadPack: "下载 PNG 套装",
      exportAll: "导出备份",
      importAll: "导入备份",
      importDone: "已导入 {n} 个图标",
      importInvalid: "备份文件格式不正确",
      errUnsupported: "不支持的文件类型，请选择 PNG / JPG / WebP 图片",
      errTooLarge: "图片超过 20MB，请先压缩",
      errQuota: "浏览器存储空间不足：请删除部分图标后重试",
      errLibraryFull: "图库已满（{n} 个），请先删除部分图标",
      errDecode: "图片解码失败，文件可能已损坏",
      count: "{n} 个图标",
      saved: "已保存",
      appSection: "dsh 图标",
      appIntro: "把裁剪好的图标设为 dsh 桌面端的应用图标。点「设为 dsh 图标」后立即生效：访达 / 应用程序 / Dock 一起更新，不重启 dsh、不打断正在运行的任务。原始图标已字节级备份，可一键还原；dsh 自动更新后会还原图标，重新应用即可。首次使用 macOS 可能要求「App 管理」权限。建议使用「macOS Dock」规格裁剪的图标。",
      appPick: "当前目标",
      appLoading: "正在检测 dsh 桌面端…",
      appNotFound: "未找到 dsh 桌面端（需要 macOS 版并安装在 /Applications 或「应用程序」文件夹）",
      appSelectIcon: "选择图标（来自上方图库）",
      appApply: "设为 dsh 图标",
      appReset: "恢复原始图标",
      confirmApply: "替换 dsh 桌面端的应用图标？立即生效：访达 / 应用程序 / Dock 同步更新，不会重启 dsh。原始图标已自动备份，可随时还原。首次使用 macOS 可能弹出「App 管理」权限请求，请允许。",
      confirmReset: "恢复 dsh 桌面端的原始图标？立即生效：访达 / 应用程序 / Dock 同步更新，不会重启 dsh。",
      appApplyOk: "已应用新图标，访达 / 应用程序 / Dock 已同步更新。",
      appApplyPartial: "图标已生效，但原生图标层（App 包内 icon.icns）更新失败：{msg}",
      appResetOk: "已恢复 dsh 原始图标，访达 / 应用程序 / Dock 已同步更新。",
      appResetNone: "当前没有由 any-icon 替换过的 dsh 图标",
      appCustomized: "当前已使用自定义图标",
      appOriginal: "当前为原始图标",
      appNotRunning: "dsh 桌面端未在运行",
      appRunning: "dsh 桌面端正在运行",
      appLive: "实时图标（访达 / 应用程序 / Dock）",
      appLiveOn: "已生效",
      appLiveOff: "未生效",
      appNative: "原生图标（App 包内）",
      appNativeOn: "已替换",
      appNativeOff: "未替换",
      appSignature: "签名",
      appVersion: "版本",
      appAboutHint: "访达 / 应用程序 / Dock 立即更新；dsh 自身的「关于」面板在下次启动 dsh 时更新。",
      appApplyFail: "操作失败：{msg}",
      appNeedIcon: "请先在下方选择一个图标",
    };
    const en = {
      nav: "Icon Studio",
      title: "Icon Studio",
      intro: "Upload an image, crop it to a 1:1 icon and set it as the dsh desktop app's icon. Icons are stored in this browser.",
      specLabel: "Output spec",
      specSquare: "Standard 1:1",
      specMac: "macOS Dock",
      specMacNote: "Outputs 1024×1024: an 824 graphic with 100px transparent margins and continuous-curvature corners (squircle) — matches the macOS app icon spec. Source edge ≥ 1024px recommended.",
      badgeMac: "macOS",
      upload: "Upload image",
      uploadHint: "PNG / JPG / WebP, edge ≥ 512px recommended",
      cropTitle: "Crop to 1:1",
      cropHint: "Drag to reposition, wheel or slider to zoom, arrow keys to nudge (Shift to speed up)",
      zoom: "Zoom",
      rotate: "Rotate 90°",
      reset: "Reset",
      confirm: "Save icon",
      cancel: "Cancel",
      back: "Back to library",
      library: "Library",
      emptyLibrary: "No icons yet. Click “Upload image” to create the first one.",
      delete: "Delete",
      confirmDelete: "Delete “{name}”?",
      downloadPack: "Download PNG pack",
      exportAll: "Export backup",
      importAll: "Import backup",
      importDone: "Imported {n} icons",
      importInvalid: "Invalid backup file",
      errUnsupported: "Unsupported file type — choose a PNG / JPG / WebP image",
      errTooLarge: "Image exceeds 20MB — compress it first",
      errQuota: "Browser storage is full — remove some icons and retry",
      errLibraryFull: "Library is full ({n}) — remove some icons first",
      errDecode: "Could not decode the image; the file may be corrupted",
      count: "{n} icons",
      saved: "Saved",
      appSection: "dsh icon",
      appIntro: "Set the cropped icon as the dsh desktop app's own icon. It takes effect the moment you apply it: Finder / the Apps view / the Dock all update together, without restarting dsh or interrupting running work. The original icon is backed up byte-for-byte and can be restored anytime; a dsh auto-update reverts the icon — just re-apply. Icons cropped with the “macOS Dock” spec make the best app icons.",
      appPick: "Target",
      appLoading: "Detecting the dsh desktop app…",
      appNotFound: "dsh desktop app not found (macOS build expected under /Applications or your Applications folder)",
      appSelectIcon: "Pick an icon (from the library above)",
      appApply: "Set as dsh icon",
      appReset: "Restore original icon",
      confirmApply: "Replace the dsh desktop app's icon? It takes effect immediately — Finder / the Apps view / the Dock update together and dsh is not restarted. The original is backed up automatically. macOS may show an “App Management” permission prompt on first use — please allow it.",
      confirmReset: "Restore the dsh desktop app's original icon? It takes effect immediately and dsh is not restarted.",
      appApplyOk: "New icon applied — Finder / the Apps view / the Dock are updated.",
      appApplyPartial: "The icon is live, but the native layer (the bundle's icon.icns) failed: {msg}",
      appResetOk: "Original dsh icon restored — Finder / the Apps view / the Dock are updated.",
      appResetNone: "No any-icon replacement on the dsh icon right now",
      appCustomized: "Currently using the custom icon",
      appOriginal: "Currently the original icon",
      appNotRunning: "dsh desktop app is not running",
      appRunning: "dsh desktop app is running",
      appLive: "Live icon (Finder / Apps / Dock)",
      appLiveOn: "active",
      appLiveOff: "not active",
      appNative: "Native icon (inside the bundle)",
      appNativeOn: "replaced",
      appNativeOff: "not replaced",
      appSignature: "Signature",
      appVersion: "Version",
      appAboutHint: "Finder / the Apps view / the Dock update right away; dsh's own About panel picks the icon up the next time dsh starts.",
      appApplyFail: "Operation failed: {msg}",
      appNeedIcon: "Pick an icon below first",
    };
    const FALLBACK = zh;

    // ------------------------------------------------------------------
    // Storage facade (localStorage behind a swappable seam)
    // ------------------------------------------------------------------
    function createStore(initial) {
      let state = initial;
      const listeners = new Set();
      return {
        get: () => state,
        set(next) { state = next; for (const l of listeners) l(); },
        subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
      };
    }

    function loadJSON(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : fallback;
      } catch { return fallback; }
    }

    function saveJSON(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return { ok: true }; }
      catch (err) {
        const quota = err && (err.name === "QuotaExceededError" || err.code === 22 || err.code === 1014);
        return { ok: false, quota };
      }
    }

    const iconStore = createStore(loadJSON(LS_ICONS, { v: 1, icons: [] }));

    const actions = {
      addIcon(icon) {
        const data = iconStore.get();
        if (data.icons.length >= MAX_LIBRARY) return { ok: false, full: true };
        const next = { v: 1, icons: [...data.icons, icon] };
        const res = saveJSON(LS_ICONS, next);
        if (res.ok) iconStore.set(next);
        return res;
      },
      removeIcon(id) {
        const data = iconStore.get();
        const next = { v: 1, icons: data.icons.filter((i) => i.id !== id) };
        if (!saveJSON(LS_ICONS, next).ok) return { ok: false };
        iconStore.set(next);
        return { ok: true };
      },
      importAll(payload) {
        if (!payload || payload.v !== 1 || !Array.isArray(payload.icons)) return { ok: false, invalid: true };
        const icons = payload.icons
          .filter((i) => i && typeof i.id === "string" && typeof i.master === "string" && typeof i.thumb === "string")
          .map((i) => ({ ...i, spec: i.spec === SPEC_MAC ? SPEC_MAC : SPEC_SQUARE }));
        const nextIcons = { v: 1, icons };
        const res = saveJSON(LS_ICONS, nextIcons);
        if (!res.ok) return res;
        iconStore.set(nextIcons);
        return { ok: true, count: icons.length };
      },
    };

    // ------------------------------------------------------------------
    // Image helpers
    // ------------------------------------------------------------------
    function uid() {
      return (globalThis.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : "i" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function encodeCanvas(canvas) {
      // WebP keeps icons small enough for localStorage; PNG is the fallback.
      try {
        const webp = canvas.toDataURL("image/webp", 0.9);
        if (webp.startsWith("data:image/webp")) return webp;
      } catch { /* fall through */ }
      return canvas.toDataURL("image/png");
    }

    function extractSquare(img, sx, sy, sw, size) {
      const out = document.createElement("canvas");
      out.width = size; out.height = size;
      const ctx = out.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, sw, sw, 0, 0, size, size);
      return out;
    }

    function loadImage(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("decode"));
        img.src = src;
      });
    }

    function readFileAsDataURL(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("read"));
        reader.readAsDataURL(file);
      });
    }

    function rotateImage(img) {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalHeight; canvas.height = img.naturalWidth;
      const ctx = canvas.getContext("2d");
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      return loadImage(canvas.toDataURL("image/png"));
    }

    function downscaleTo(img, maxEdge) {
      const edge = Math.max(img.naturalWidth, img.naturalHeight);
      if (edge <= maxEdge) return Promise.resolve(img);
      const scale = maxEdge / edge;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return loadImage(canvas.toDataURL("image/png"));
    }

    function downloadDataURL(filename, dataURL) {
      const a = document.createElement("a");
      a.href = dataURL;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    function sanitizeName(name) {
      return String(name || "icon").replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "icon";
    }

    // Crop-spec preference survives across crops and sessions.
    function loadCropSpec() {
      try { return localStorage.getItem(LS_CROP_SPEC) === SPEC_MAC ? SPEC_MAC : SPEC_SQUARE; }
      catch { return SPEC_SQUARE; }
    }

    function saveCropSpec(spec) {
      try { localStorage.setItem(LS_CROP_SPEC, spec === SPEC_MAC ? SPEC_MAC : SPEC_SQUARE); } catch { /* preference only */ }
    }

    // The macOS Dock document: 1024×1024, the cropped square scaled into the
    // central 824 box and clipped by the squircle (100px transparent margins).
    function renderMacDockDoc(img, sx, sy, sw) {
      const doc = document.createElement("canvas");
      doc.width = MAC_SPEC.canvas; doc.height = MAC_SPEC.canvas;
      const ctx = doc.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.save();
      ctx.translate(MAC_SPEC.margin, MAC_SPEC.margin);
      ctx.clip(new Path2D(squirclePathData(MAC_SPEC.graphic)));
      ctx.drawImage(img, sx, sy, sw, sw, 0, 0, MAC_SPEC.graphic, MAC_SPEC.graphic);
      ctx.restore();
      return doc;
    }

    // ------------------------------------------------------------------
    // Styles (single injected sheet, removed with the plugin)
    // ------------------------------------------------------------------
    const CSS = [
      ".dai-panel{display:flex;flex-direction:column;gap:16px;max-width:760px;color:var(--dsw-alias-label-primary)}",
      ".dai-panel-intro{margin:0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}",
      ".dai-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}",
      ".dai-btn{appearance:none;font:inherit;cursor:pointer;border-radius:var(--dsw-radius-sm,6px);border:1px solid var(--dsw-alias-border-l3,rgba(127,127,127,.35));background:var(--dsw-alias-fill-tsp-secondary,transparent);color:var(--dsw-alias-label-primary);padding:5px 12px;font-size:13px;line-height:20px;display:inline-flex;align-items:center;gap:6px}",
      ".dai-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}",
      ".dai-btn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4c7dff);outline-offset:1px}",
      ".dai-btn[disabled]{opacity:.45;cursor:default}",
      ".dai-btn-danger{color:var(--dsw-alias-state-error-primary,#e5484d)}",
      ".dai-btn-primary{background:var(--dsw-alias-state-business-primary,#4c7dff);border-color:transparent;color:var(--dsw-alias-bg-layer-3,#fff)}",
      ".dai-btn-primary:hover{filter:brightness(1.06);background:var(--dsw-alias-state-business-primary,#4c7dff)}",
      ".dai-note{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}",
      ".dai-error{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-error-primary,#e5484d)}",
      ".dai-ok{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-success-primary,#2f9e63)}",
      ".dai-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:12px;padding:0;margin:0;list-style:none}",
      ".dai-card{border:1px solid var(--dsw-alias-border-l3,rgba(127,127,127,.3));border-radius:var(--dsw-radius-lg,10px);background:var(--dsw-alias-settings-card-fill,transparent);padding:12px;display:flex;flex-direction:column;gap:8px;align-items:center}",
      ".dai-card-img{width:64px;height:64px;border-radius:14px;object-fit:cover;display:block;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1))}",
      ".dai-card-name{font-size:12px;line-height:1.4;color:var(--dsw-alias-label-secondary);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dai-badge{font-size:10px;line-height:16px;padding:0 7px;border-radius:999px;background:var(--dsw-alias-state-business-primary,#4c7dff);color:var(--dsw-alias-bg-layer-3,#fff);align-self:center}",
      ".dai-badge-soft{background:var(--dsw-alias-label-tertiary,rgba(127,127,127,.55))}",
      ".dai-card-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}",
      ".dai-mini{padding:2px 8px;font-size:11px;line-height:17px}",
      ".dai-crop-wrap{display:flex;flex-direction:column;gap:10px;align-items:center}",
      ".dai-canvas{border-radius:var(--dsw-radius-md,8px);touch-action:none;cursor:grab;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.12));outline:none}",
      ".dai-canvas:active{cursor:grabbing}",
      ".dai-canvas:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4c7dff);outline-offset:2px}",
      ".dai-zoom{width:min(320px,100%);accent-color:var(--dsw-alias-state-business-primary,#4c7dff)}",
      ".dai-input{appearance:none;font:inherit;border-radius:var(--dsw-radius-sm,6px);border:1px solid var(--dsw-alias-border-l3,rgba(127,127,127,.35));background:var(--dsw-alias-bg-layer-2,transparent);color:var(--dsw-alias-label-primary);padding:5px 10px;font-size:13px}",
      ".dai-input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4c7dff);outline-offset:1px}",
      ".dai-iconstrip{display:flex;flex-wrap:wrap;gap:8px}",
      ".dai-iconopt{border:2px solid transparent;border-radius:12px;padding:3px;background:none;cursor:pointer;display:flex}",
      ".dai-iconopt:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}",
      ".dai-iconopt-on{border-color:var(--dsw-alias-state-business-primary,#4c7dff)}",
      ".dai-iconopt:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4c7dff);outline-offset:1px}",
      ".dai-iconopt-img{width:40px;height:40px;border-radius:9px;object-fit:cover;display:block}",
      "@media (prefers-reduced-motion:reduce){.dai-btn{transition:none}}",
    ].join("\n");

    // ------------------------------------------------------------------
    // Shared UI atoms
    // ------------------------------------------------------------------
    function Button({ primary, danger, mini, disabled, onClick, children, title, pressed }) {
      const cls = "dai-btn" + (primary ? " dai-btn-primary" : "") + (danger ? " dai-btn-danger" : "") + (mini ? " dai-mini" : "");
      return createElement("button", { type: "button", className: cls, disabled, onClick, title, "aria-pressed": pressed }, children);
    }

    function useStore(store) {
      return React.useSyncExternalStore(store.subscribe, store.get, store.get);
    }

    function format(template, params) {
      return String(template).replace(/\{(\w+)\}/g, (_, k) => (params && params[k] !== undefined ? String(params[k]) : `{${k}}`));
    }

    // ------------------------------------------------------------------
    // anyIcon Remote bridge (Client → Host, Typert gateway)
    // ------------------------------------------------------------------
    // __DAI_BRIDGE__ comes from src/generated/bridge.iife.js (build step).
    const bridge = __DAI_BRIDGE__.bridge;
    let bridgeMountPromise = undefined;
    let anyIconServicePromise = undefined;

    function mountAnyIconRemote(ctx) {
      if (!bridgeMountPromise) {
        // $mount registers the local descriptors; it does not require the
        // Host service to exist yet. Re-mounting the same package throws, so
        // mount exactly once per page and allow a retry after a failure.
        bridgeMountPromise = Promise.resolve(ctx.remote.$mount(bridge.TYPERT_REMOTE)).catch((err) => {
          bridgeMountPromise = undefined;
          throw err;
        });
      }
      return bridgeMountPromise;
    }

    function getAnyIconService(ctx) {
      if (!anyIconServicePromise) {
        // A mounted namespace is its own Cordis capability: acquire it from a
        // child context that declares the dependency (never from the mount
        // owner — the declared access would deadlock that owner's loading).
        anyIconServicePromise = mountAnyIconRemote(ctx).then(() => new Promise((resolve, reject) => {
          const fiber = ctx.inject(["remote.anyIcon"], (scope) => {
            resolve(scope.remote.anyIcon);
          });
          if (fiber && typeof fiber.catch === "function") fiber.catch(reject);
        })).catch((err) => {
          anyIconServicePromise = undefined;
          throw err;
        });
      }
      return anyIconServicePromise;
    }

    async function callAnyIcon(ctx, fn) {
      const service = await getAnyIconService(ctx);
      const raw = await fn(service);
      // Unary proxy results arrive as { ok, value } envelopes on some dsh
      // versions; unwrap when present, pass through otherwise.
      if (raw && typeof raw === "object" && "ok" in raw && "value" in raw && Object.keys(raw).length <= 2) {
        return raw.value;
      }
      return raw;
    }

    function safeJson(value) {
      try {
        const json = JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? String(v) : v));
        return json === undefined ? String(value) : json.slice(0, 600);
      } catch (err) { return "unserializable: " + String(err); }
    }

    // ------------------------------------------------------------------
    // Cropper
    // ------------------------------------------------------------------
    function Cropper({ t, img, name, onCancel, onConfirm, onRotate }) {
      const windowSize = Math.round(CANVAS * WINDOW_RATIO);
      const winX = (CANVAS - windowSize) / 2;
      const winY = (CANVAS - windowSize) / 2;
      const [spec, setSpec] = React.useState(loadCropSpec);

      const cover = Math.max(windowSize / img.naturalWidth, windowSize / img.naturalHeight);
      const maxScale = cover * 8;

      const viewRef = React.useRef({ scale: cover, ox: (CANVAS - img.naturalWidth * cover) / 2, oy: (CANVAS - img.naturalHeight * cover) / 2 });
      const canvasRef = React.useRef(null);
      const dragRef = React.useRef(null);
      const [zoomValue, setZoomValue] = React.useState(0); // 0..1 mapped over [cover, maxScale]

      const clamp = (v) => {
        const iw = img.naturalWidth * v.scale;
        const ih = img.naturalHeight * v.scale;
        v.scale = Math.min(maxScale, Math.max(cover, v.scale));
        // Keep the crop window inside the image whenever the image can cover it.
        if (iw >= windowSize) v.ox = Math.min(winX, Math.max(winX + windowSize - iw, v.ox));
        else v.ox = (CANVAS - iw) / 2;
        if (ih >= windowSize) v.oy = Math.min(winY, Math.max(winY + windowSize - ih, v.oy));
        else v.oy = (CANVAS - ih) / 2;
        return v;
      };

      const draw = React.useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const v = viewRef.current;
        ctx.clearRect(0, 0, CANVAS, CANVAS);
        ctx.drawImage(img, v.ox, v.oy, img.naturalWidth * v.scale, img.naturalHeight * v.scale);
        // Dim outside the crop window.
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(0, 0, CANVAS, winY);
        ctx.fillRect(0, winY + windowSize, CANVAS, CANVAS - winY - windowSize);
        ctx.fillRect(0, winY, winX, windowSize);
        ctx.fillRect(winX + windowSize, winY, CANVAS - winX - windowSize, windowSize);
        // Window frame + guide: the shape the exported icon's graphic will
        // carry — circle for the square spec, the squircle for macOS Dock.
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.lineWidth = 2;
        ctx.strokeRect(winX + 1, winY + 1, windowSize - 2, windowSize - 2);
        if (spec === SPEC_MAC) {
          ctx.save();
          ctx.translate(winX, winY);
          ctx.beginPath();
          ctx.strokeStyle = "rgba(255,255,255,0.4)";
          ctx.lineWidth = 2;
          ctx.stroke(new Path2D(squirclePathData(windowSize)));
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(CANVAS / 2, CANVAS / 2, windowSize / 2 - 2, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(255,255,255,0.4)";
          ctx.stroke();
        }
      }, [img, spec]);

      React.useEffect(() => { draw(); }, [draw]);

      // React attaches wheel listeners passively; bind our own so
      // preventDefault can stop the page from scrolling while zooming.
      React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const handler = (e) => {
          e.preventDefault();
          const v = viewRef.current;
          const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
          zoomAboutCenter(Math.min(maxScale, Math.max(cover, v.scale * factor)));
        };
        canvas.addEventListener("wheel", handler, { passive: false });
        return () => canvas.removeEventListener("wheel", handler);
      });

      const zoomAboutCenter = (nextScale) => {
        const v = viewRef.current;
        const cx = winX + windowSize / 2, cy = winY + windowSize / 2;
        const px = (cx - v.ox) / v.scale, py = (cy - v.oy) / v.scale;
        v.scale = nextScale;
        v.ox = cx - px * nextScale;
        v.oy = cy - py * nextScale;
        clamp(v);
        setZoomValue((v.scale - cover) / (maxScale - cover || 1));
        draw();
      };

      const onPointerDown = (e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = { x: e.clientX, y: e.clientY };
      };
      const onPointerMove = (e) => {
        const d = dragRef.current;
        if (!d) return;
        const v = viewRef.current;
        v.ox += e.clientX - d.x;
        v.oy += e.clientY - d.y;
        d.x = e.clientX; d.y = e.clientY;
        clamp(v);
        draw();
      };
      const onPointerUp = () => { dragRef.current = null; };

      const onKeyDown = (e) => {
        const v = viewRef.current;
        const step = (e.shiftKey ? 10 : 1) * (CANVAS / 320);
        let handled = false;
        if (e.key === "ArrowLeft") { v.ox += step; handled = true; }
        else if (e.key === "ArrowRight") { v.ox -= step; handled = true; }
        else if (e.key === "ArrowUp") { v.oy += step; handled = true; }
        else if (e.key === "ArrowDown") { v.oy -= step; handled = true; }
        if (handled) { e.preventDefault(); clamp(v); draw(); }
      };

      const onReset = () => {
        viewRef.current = { scale: cover, ox: (CANVAS - img.naturalWidth * cover) / 2, oy: (CANVAS - img.naturalHeight * cover) / 2 };
        setZoomValue(0);
        draw();
      };

      const confirm = () => {
        const v = viewRef.current;
        const sx = (winX - v.ox) / v.scale;
        const sy = (winY - v.oy) / v.scale;
        const sw = windowSize / v.scale;
        if (spec === SPEC_MAC) {
          const doc = renderMacDockDoc(img, sx, sy, sw);
          const thumb = document.createElement("canvas");
          thumb.width = THUMB; thumb.height = THUMB;
          const tctx = thumb.getContext("2d");
          tctx.imageSmoothingQuality = "high";
          tctx.drawImage(doc, 0, 0, THUMB, THUMB);
          onConfirm({ master: encodeCanvas(doc), thumb: encodeCanvas(thumb), spec: SPEC_MAC });
          return;
        }
        const master = encodeCanvas(extractSquare(img, sx, sy, sw, MASTER));
        const thumb = encodeCanvas(extractSquare(img, sx, sy, sw, THUMB));
        onConfirm({ master, thumb, spec: SPEC_SQUARE });
      };

      return createElement("div", { className: "dai-panel" },
        createElement("h3", { style: { margin: 0, fontSize: 15 } }, t("cropTitle")),
        createElement("p", { className: "dai-note" }, t("cropHint")),
        createElement("div", { className: "dai-row", role: "group", "aria-label": t("specLabel") },
          createElement("span", { className: "dai-note" }, t("specLabel")),
          createElement(Button, {
            mini: true, primary: spec === SPEC_SQUARE, pressed: spec === SPEC_SQUARE,
            onClick: () => { setSpec(SPEC_SQUARE); saveCropSpec(SPEC_SQUARE); },
          }, t("specSquare")),
          createElement(Button, {
            mini: true, primary: spec === SPEC_MAC, pressed: spec === SPEC_MAC,
            onClick: () => { setSpec(SPEC_MAC); saveCropSpec(SPEC_MAC); },
          }, t("specMac")),
        ),
        spec === SPEC_MAC ? createElement("p", { className: "dai-note" }, t("specMacNote")) : null,
        createElement("div", { className: "dai-crop-wrap" },
          createElement("canvas", {
            ref: canvasRef,
            width: CANVAS, height: CANVAS,
            className: "dai-canvas",
            style: { width: 320, height: 320 },
            tabIndex: 0,
            role: "application",
            "aria-label": t("cropTitle"),
            onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp,
            onKeyDown,
          }),
          createElement("input", {
            type: "range", className: "dai-zoom", min: 0, max: 1000, value: Math.round(zoomValue * 1000),
            "aria-label": t("zoom"),
            onChange: (e) => {
              const ratio = Number(e.target.value) / 1000;
              setZoomValue(ratio);
              zoomAboutCenter(cover + (maxScale - cover) * ratio);
            },
          }),
          createElement("div", { className: "dai-row" },
            createElement(Button, { onClick: onReset }, t("reset")),
            createElement(Button, { onClick: () => onRotate && onRotate() }, t("rotate")),
            createElement(Button, { onClick: onCancel }, t("cancel")),
            createElement(Button, { primary: true, onClick: confirm }, t("confirm")),
          ),
        ),
      );
    }

    // ------------------------------------------------------------------
    // Workshop (settings.section panel)
    // ------------------------------------------------------------------
    function Workshop({ t }) {
      const icons = useStore(iconStore);
      const [draft, setDraft] = React.useState(null); // { img, name }
      const [error, setError] = React.useState("");
      const [notice, setNotice] = React.useState("");
      const fileRef = React.useRef(null);
      const importRef = React.useRef(null);

      const pickFile = async (file) => {
        setError(""); setNotice("");
        if (!file) return;
        if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setError(t("errUnsupported")); return; }
        if (file.size > MAX_INPUT_BYTES) { setError(t("errTooLarge")); return; }
        try {
          const dataURL = await readFileAsDataURL(file);
          const img = await loadImage(dataURL);
          const sized = await downscaleTo(img, 2048);
          setDraft({ img: sized, name: sanitizeName(file.name.replace(/\.[a-z0-9]+$/i, "")), rev: 0 });
        } catch (err) {
          setError(err && err.message === "read" ? t("errUnsupported") : t("errDecode"));
        }
      };

      const rotateDraft = () => {
        if (!draft) return;
        rotateImage(draft.img).then((rotated) => {
          setDraft((d) => (d ? { ...d, img: rotated, rev: d.rev + 1 } : d));
        }).catch(() => {});
      };

      const confirmCrop = ({ master, thumb, spec }) => {
        setError(""); setNotice("");
        const icon = { id: uid(), name: draft.name, master, thumb, spec: spec === SPEC_MAC ? SPEC_MAC : SPEC_SQUARE, createdAt: Date.now() };
        const res = actions.addIcon(icon);
        if (!res.ok) {
          setError(res.full ? format(t("errLibraryFull"), { n: MAX_LIBRARY }) : t("errQuota"));
          return;
        }
        setDraft(null);
        setNotice(t("saved"));
      };

      const doExport = () => {
        const payload = { app: "dsh-any-icon", version: 1, icons: icons.icons };
        downloadDataURL("dsh-any-icon-backup.json", "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload)));
      };

      const doImport = async (file) => {
        setError(""); setNotice("");
        if (!file) return;
        try {
          const text = await file.text();
          const res = actions.importAll(JSON.parse(text));
          if (!res.ok) { setError(res.invalid ? t("importInvalid") : t("errQuota")); return; }
          setNotice(format(t("importDone"), { n: res.count }));
        } catch { setError(t("importInvalid")); }
      };

      const doDownloadPack = async (icon) => {
        const img = await loadImage(icon.master);
        const base = sanitizeName(icon.name);
        const sizes = icon.spec === SPEC_MAC ? [MAC_SPEC.canvas, ...PACK_SIZES] : PACK_SIZES;
        for (const size of sizes) {
          const out = document.createElement("canvas");
          out.width = size; out.height = size;
          const ctx = out.getContext("2d");
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, size, size);
          downloadDataURL(`${base}-${size}.png`, out.toDataURL("image/png"));
          await new Promise((r) => setTimeout(r, 350));
        }
      };

      if (draft) {
        return createElement(Cropper, {
          t, key: draft.rev, img: draft.img, name: draft.name,
          onCancel: () => setDraft(null),
          onConfirm: confirmCrop,
          onRotate: rotateDraft,
        });
      }

      return createElement("div", { className: "dai-panel" },
        createElement("h3", { style: { margin: 0, fontSize: 15 } }, t("title")),
        createElement("p", { className: "dai-panel-intro" }, t("intro")),
        createElement("div", { className: "dai-row" },
          createElement(Button, { primary: true, onClick: () => fileRef.current && fileRef.current.click() }, t("upload")),
          createElement(Button, { onClick: doExport, disabled: icons.icons.length === 0 }, t("exportAll")),
          createElement(Button, { onClick: () => importRef.current && importRef.current.click() }, t("importAll")),
          createElement("span", { className: "dai-note" }, format(t("count"), { n: icons.icons.length })),
        ),
        createElement("p", { className: "dai-note" }, t("uploadHint")),
        error && createElement("p", { className: "dai-error", role: "alert" }, error),
        notice && createElement("p", { className: "dai-ok", role: "status" }, notice),
        createElement("h4", { style: { margin: "4px 0 0", fontSize: 13 } }, t("library")),
        icons.icons.length === 0
          ? createElement("p", { className: "dai-note" }, t("emptyLibrary"))
          : createElement("ul", { className: "dai-grid" },
              icons.icons.map((icon) => createElement("li", { key: icon.id, className: "dai-card" },
                createElement("img", { src: icon.thumb, alt: "", className: "dai-card-img", draggable: false }),
                icon.spec === SPEC_MAC ? createElement("span", { className: "dai-badge dai-badge-soft", title: t("specMac") }, t("badgeMac")) : null,
                createElement("span", { className: "dai-card-name", title: icon.name }, icon.name),
                createElement("div", { className: "dai-card-actions" },
                  createElement(Button, { mini: true, onClick: () => void doDownloadPack(icon) }, t("downloadPack")),
                  createElement(Button, {
                    mini: true, danger: true,
                    onClick: () => { if (window.confirm(format(t("confirmDelete"), { name: icon.name }))) actions.removeIcon(icon.id); },
                  }, t("delete")),
                ),
              )),
            ),
        createElement(DshIconSection, { t }),
        createElement("input", {
          ref: fileRef, type: "file", accept: "image/png,image/jpeg,image/webp", style: { display: "none" },
          onChange: (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; void pickFile(f); },
        }),
        createElement("input", {
          ref: importRef, type: "file", accept: "application/json,.json", style: { display: "none" },
          onChange: (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; void doImport(f); },
        }),
      );
    }

    // ------------------------------------------------------------------
    // dsh app icon: replace the dsh desktop bundle's own icon
    // ------------------------------------------------------------------
    function DshIconSection({ t }) {
      const icons = useStore(iconStore);
      const [state, setState] = React.useState(undefined); // undefined = loading
      const [selectedIconId, setSelectedIconId] = React.useState("");
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState("");
      const [warning, setWarning] = React.useState("");
      const [notice, setNotice] = React.useState("");
      const loadRef = React.useRef(0);

      const loadState = React.useCallback(() => {
        const seq = ++loadRef.current;
        setState(undefined);
        setError("");
        callAnyIcon(boundCtx, (svc) => svc.getDshIconState()).then((result) => {
          if (loadRef.current !== seq) return;
          setState(result);
        }).catch((err) => {
          if (loadRef.current !== seq) return;
          setError(String((err && err.message) || err));
          setState({
            ok: true, found: false, appPath: "", customized: false, running: false,
            customIcon: false, nativeIcon: false, bundleVersion: "", signature: "unknown", native: "idle", nativeError: "",
          });
        });
      }, []);

      React.useEffect(() => { loadState(); }, [loadState]);

      const apply = async () => {
        setError(""); setWarning(""); setNotice("");
        const icon = icons.icons.find((i) => i.id === selectedIconId);
        if (!icon) { setError(t("appNeedIcon")); return; }
        if (!window.confirm(t("confirmApply"))) return;
        setBusy(true);
        try {
          const result = await callAnyIcon(boundCtx, (svc) => svc.applyDshIcon(icon.master));
          if (result && result.native === "failed") {
            setWarning(format(t("appApplyPartial"), { msg: result.nativeError || "" }));
          } else {
            setNotice(t("appApplyOk"));
          }
          loadState();
        } catch (err) {
          setError(format(t("appApplyFail"), { msg: String((err && err.message) || err) }));
        } finally {
          setBusy(false);
        }
      };

      const resetIcon = async () => {
        setError(""); setWarning(""); setNotice("");
        if (!window.confirm(t("confirmReset"))) return;
        setBusy(true);
        try {
          const result = await callAnyIcon(boundCtx, (svc) => svc.resetDshIcon());
          setNotice(result && result.removed ? t("appResetOk") : t("appResetNone"));
          loadState();
        } catch (err) {
          setError(format(t("appApplyFail"), { msg: String((err && err.message) || err) }));
        } finally {
          setBusy(false);
        }
      };

      const statusLine = state === undefined ? null : [
        t("appLive") + "：" + (state.customIcon ? t("appLiveOn") : t("appLiveOff")),
        t("appNative") + "：" + (state.nativeIcon ? t("appNativeOn") : t("appNativeOff")),
        t("appSignature") + "：" + (state.signature || "unknown"),
        state.bundleVersion ? t("appVersion") + "：" + state.bundleVersion : null,
        state.running ? t("appRunning") : t("appNotRunning"),
      ].filter(Boolean).join(" · ");

      return createElement("div", { className: "dai-panel" },
        createElement("h4", { style: { margin: "4px 0 0", fontSize: 13 } }, t("appSection")),
        createElement("p", { className: "dai-note" }, t("appIntro")),
        state === undefined
          ? createElement("p", { className: "dai-note" }, t("appLoading"))
          : createElement("div", { className: "dai-row" },
              createElement("span", { className: "dai-note" },
                state.found
                  ? t("appPick") + ": " + state.appPath + "（" + (state.customized ? t("appCustomized") : t("appOriginal")) + "）"
                  : null,
              ),
            ),
        statusLine ? createElement("div", { className: "dai-row" },
          createElement("span", { className: "dai-note" }, statusLine),
        ) : null,
        state !== undefined && !state.found
          ? createElement("p", { className: "dai-error" }, t("appNotFound"))
          : null,
        createElement("p", { className: "dai-note" }, t("appSelectIcon")),
        icons.icons.length === 0
          ? createElement("p", { className: "dai-note" }, t("emptyLibrary"))
          : createElement("div", { className: "dai-iconstrip", role: "listbox", "aria-label": t("appSelectIcon") },
              icons.icons.map((icon) => createElement("button", {
                key: icon.id, type: "button", role: "option",
                "aria-selected": selectedIconId === icon.id,
                title: icon.name,
                className: "dai-iconopt" + (selectedIconId === icon.id ? " dai-iconopt-on" : ""),
                onClick: () => setSelectedIconId(icon.id),
              }, createElement("img", { src: icon.thumb, alt: icon.name, className: "dai-iconopt-img", draggable: false }))),
            ),
        createElement("div", { className: "dai-row" },
          createElement(Button, { primary: true, disabled: busy || !selectedIconId || (state !== undefined && !state.found), onClick: () => void apply() }, t("appApply")),
          createElement(Button, { disabled: busy, onClick: () => void resetIcon() }, t("appReset")),
          busy ? createElement("span", { className: "dai-note" }, "…") : null,
        ),
        createElement("p", { className: "dai-note" }, t("appAboutHint")),
        error && createElement("p", { className: "dai-error", role: "alert" }, error),
        warning && createElement("p", { className: "dai-error", role: "alert" }, warning),
        notice && createElement("p", { className: "dai-ok", role: "status" }, notice),
      );
    }

    // ------------------------------------------------------------------
    // Plugin
    // ------------------------------------------------------------------
    let boundCtx = undefined;
    function makeT() {
      const ctx = boundCtx;
      if (ctx && ctx.locale && typeof ctx.locale.bind === "function") {
        try { return ctx.locale.bind(NS); } catch { /* fall through */ }
      }
      return (key) => FALLBACK[key] !== undefined ? FALLBACK[key] : key;
    }

    const name = "any-icon";
    const inject = ["slots", "locale", "remote"];

    function apply(ctx) {
      boundCtx = ctx;

      // Locale dictionary is a reversible registration.
      ctx.effect(() => {
        if (ctx.locale && typeof ctx.locale.register === "function") {
          return ctx.locale.register(NS, { zh, en });
        }
        return () => {};
      }, "any-icon.locale");

      ctx.effect(() => {
        const style = document.createElement("style");
        style.setAttribute("data-dsh-any-icon", "");
        style.textContent = CSS;
        document.head.appendChild(style);
        return () => style.remove();
      }, "any-icon.styles");

      // Settings section: 图标工坊.
      ctx.slots.inject("settings.section", () => ctx.slots.register({
        name: "settings.section",
        id: "any-icon",
        order: 46,
        label: () => makeT()("nav"),
        locale: NS,
        inject: () => ({}),
      }, (ownerProps) => createElement(Workshop, { t: makeT() })));

      // Dev self-test hook: set localStorage["dsh-any-icon.selftest"]="1" and
      // reload; the bridge round-trip result lands in
      // localStorage["dsh-any-icon.selftest.result"] for automated checks.
      if (typeof localStorage !== "undefined" && localStorage.getItem("dsh-any-icon.selftest") === "1") {
        callAnyIcon(ctx, (svc) => svc.getDshIconState()).then((result) => {
          localStorage.setItem("dsh-any-icon.selftest.result", JSON.stringify({ ok: true, rawType: typeof result, keys: result && typeof result === "object" ? Object.keys(result) : String(result), raw: safeJson(result) }));
        }).catch((err) => {
          localStorage.setItem("dsh-any-icon.selftest.result", JSON.stringify({ ok: false, error: String((err && err.message) || err), stack: String(err && err.stack || "").slice(0, 500) }));
        });
      }
    }

    exports.name = name;
    exports.inject = inject;
    exports.apply = apply;
