# 发布准备清单

这份文档回答两件事：**现在这个仓库能发布成什么**，以及**要变成正式产品还缺什么**。

结论先说：仓库目前是「静态前端 + 本机数据库（IndexedDB）+ 一个 AI 代理」。
**没有数据后端**——账号、云端同步、公开分享、图片上传到服务器，这些接口在 `src/services/api.ts` 的 `api` 分支里被调用，但仓库里没有对应实现。
所以发布有两条路线，路线 B 需要先补后端。

---

## 一、现在的形态

| 部分 | 现状 |
| --- | --- |
| 前端 | React + Vite 静态站，`npm run build` 产出 `dist/` |
| 数据 | 本机模式：IndexedDB（`pose-atlas` 库），导出/导入走 JSON |
| 打印 | 纯前端，`window.print()` + 注入 `@page`，不依赖服务器 |
| AI | `server/` 里的 Node 代理（默认 `127.0.0.1:5175`），前端只请求同源 `/api/ai/*` |
| 账号 / 分享 / 云端图片 | **只有本机实现**，API 分支需要的后端不在本仓库 |

顶部那条「本机演示模式 · 数据保存在当前浏览器」的横幅就是在说这件事，它只在 `VITE_DATA_MODE` 不是 `api` 时出现。

---

## 二、两条路线

### 路线 A：纯静态发布（今天就能做）

适合：个人使用、作品集、内测演示。

- 能用到：图鉴浏览、筛选、编辑卡片、打印 / 另存 PDF、多模型设置、导出导入、主题。
- 拿不到：跨设备同步、公开分享链接、多人协作。（数据只在本浏览器）
- AI：**必须有 AI 代理**，否则 `/api/ai/*` 直接 404。三种选择：
  1. 同机/同域跑 `npm run dev:ai`（生产用 `node --experimental-strip-types server/index.ts`）；
  2. 不部署 AI，界面上仍然会提示「本地 AI 服务没有这个接口（404）」；
  3. 部署 AI 代理，但**不配系统默认模型**，让用户自己填模型档案（key 存浏览器）。

### 路线 B：完整版（需要补数据后端）

适合：真正对外运营。需要补齐这些接口（前端已经在调用）：

| 接口 | 用途 |
| --- | --- |
| `GET/PUT /api/workspace` | 读取/保存整个工作区 |
| `POST /api/shares`、`GET /api/shares/:id`、`POST /api/shares/:id/export` | 发布与分享快照 |
| `POST /api/images`、`GET /api/media/:id` | 图片上传与读取 |
| `/signin-with-chatgpt`、`/callback`、`/signout-with-chatgpt` | 登录态（如果沿用现有登录流程） |

补齐后把前端 `VITE_DATA_MODE=api`，横幅与「本机演示」字样会自动消失（侧栏显示「个人云端空间」）。

---

## 三、发布前必须准备（路线 A 清单）

1. **域名 + HTTPS**：AI 代理只接受 `https` 的上游地址，页面也必须是 `https`（否则混入内容被拦）。
2. **静态托管**：Cloudflare Pages / Netlify / Vercel / 自建 Nginx 都行；构建命令 `npm ci && npm run build`，产物目录 `dist`。
3. **环境变量**（见 `.env.example`）：
   - `VITE_DATA_MODE=local`（或不设）
   - `VITE_HIDE_DEMO=1` 可选：隐藏演示横幅，侧栏文案变成「本机空间」
   - `AI_PROXY_TARGET` 只影响 `vite dev/preview`，生产由 Nginx 代理，别指望它。
4. **AI 代理进程**：
   - Node ≥ 20（用到 `--experimental-strip-types`）
   - `HOST=127.0.0.1`（前面放 Nginx）、`PORT=5175`
   - `AI_ALLOWED_ORIGINS=https://你的域名`
   - 要提供系统默认模型就填 `AI_BASE_URL / AI_API_KEY / AI_MODEL`；不填则只能用户自备
5. **进程守护**：systemd 或 pm2，崩溃自动拉起；日志用 `journalctl`。
6. **隐私与法律**：
   - 用户自填的 API key 存在 `localStorage`，隐私说明里要写清楚（同源脚本可读）。
   - 图片是 AI 生成或用户上传，页面已标注「AI 生成参考图」；公开部署时补一条免责声明与版权说明。
   - 本机模式下数据只在用户浏览器，**清理浏览器数据就没了**，界面上要提示可导出 JSON 备份。
7. **备份**：本机模式靠用户导出；路线 B 靠数据库备份。
8. **CI**：仓库已有 `.github/workflows/ci.yml`（typecheck + test + build），在 GitHub Actions 里能看到绿灯再发布。

---

## 四、现成配置样例

### Nginx（静态 + AI 反代）

```nginx
server {
  listen 443 ssl http2;
  server_name pose.example.com;
  root /var/www/pose-atlas/dist;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /api/ai/ {
    proxy_pass http://127.0.0.1:5175;
    proxy_set_header Host $host;
    proxy_set_header Origin https://pose.example.com;
    proxy_read_timeout 90s;
  }
}
```

> `Origin` 必须和 `AI_ALLOWED_ORIGINS` 一致，否则代理会返回 403「请求来源不允许」。

### systemd（AI 代理）

```ini
[Unit]
Description=Pose Atlas AI proxy
After=network.target

[Service]
WorkingDirectory=/srv/pose-atlas
Environment=HOST=127.0.0.1
Environment=PORT=5175
Environment=AI_ALLOWED_ORIGINS=https://pose.example.com
# Environment=AI_BASE_URL=...
# Environment=AI_API_KEY=...
# Environment=AI_MODEL=...
ExecStart=/usr/bin/node --experimental-strip-types server/index.ts
Restart=always

[Install]
WantedBy=multi-user.target
```

### 本地验收

```bash
npm ci
npm run build
npm run preview        # http://127.0.0.1:4174
npm run dev:ai         # 另开一个终端，AI 才能用
```

`preview` 也带 `/api/ai` 代理，能验证生产构建下的 AI 链路。

---

## 五、发布前自检

- [ ] `npm test` 全绿（当前 100 项）
- [ ] `npm run typecheck`、`npm run build` 通过
- [ ] `dist/` 在目标域名下打开，控制台无 404（尤其 `/images/*`）
- [ ] 打印预览：A4 一张纸能出整版卡片，正反面顺序正确
- [ ] AI：点「AI 帮我填满」不出现 404；配好 key 能返回内容
- [ ] 手机/窄屏能正常浏览与翻面
- [ ] 隐私说明写明：数据存浏览器、key 存 localStorage、图片为 AI 生成
- [ ] 想隐藏「本机演示模式」横幅时设置 `VITE_HIDE_DEMO=1`

---

## 六、常见坑

- **AI 一直 404**：本地 AI 服务没启动，或启动的是加入 `/api/ai/draft` 之前的旧进程。重启 `npm run dev:ai`。
- **AI 返回 403「请求来源不允许」**：`AI_ALLOWED_ORIGINS` 与页面实际域名不一致（含协议与端口）。
- **改了环境变量没生效**：`VITE_*` 变量在**构建时**注入，改完要重新 `npm run build`。
- **换域名后分享链接失效**：本机模式的分享是本地快照，换设备打不开是预期行为。
