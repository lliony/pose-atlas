# 发布准备清单

AI 不在这份清单里——**模型接口由系统配置决定**，运维在服务端环境变量里配一次，前端用户不需要填任何东西。
发布这件事只需要关心：**静态站怎么托管**，以及**要不要接数据后端**。

---

## 一、现在的形态

| 部分 | 现状 |
| --- | --- |
| 前端 | React + Vite 静态站，`npm run build` 产出 `dist/` |
| 数据 | 本机模式：IndexedDB（`pose-atlas` 库），导出/导入走 JSON |
| 打印 | 纯前端，`window.print()` + 注入 `@page`，不依赖服务器 |
| AI | 系统级配置：服务端环境变量决定模型地址与密钥，用户无感 |
| 账号 / 分享 / 云端图片 | **只有本机实现**，API 分支需要的后端不在本仓库 |

顶部那条「本机演示模式 · 数据保存在当前浏览器」的横幅说的就是数据这一层，跟 AI 无关。

---

## 二、发布 = 静态托管

适合：个人使用、作品集、内测、公开演示。

### 要做的事

1. **域名 + HTTPS**（AI 请求要求页面同源 HTTPS）。
2. **静态托管**：Cloudflare Pages / Netlify / Vercel / 自建 Nginx 都行；
   构建命令 `npm ci && npm run build`，产物目录 `dist`。
3. **SPA 回退**：所有未知路径回退到 `index.html`（分享链接 `/s/:id` 需要）。
4. **环境变量**（前端只有这两个，见 `.env.example`）：
   - `VITE_DATA_MODE=local`（或不设）
   - `VITE_HIDE_DEMO=1` 可选：隐藏演示横幅，侧栏文案变成「本机空间」
5. **AI 的转发**：页面请求同源 `/api/ai/*`，由网关反代到 AI 服务即可，见下面的 Nginx 片段。不需要改前端。

### 能用到 / 拿不到

| 能用到 | 拿不到 |
| --- | --- |
| 图鉴、筛选、编辑、打印 / 另存 PDF、AI 推荐与填充、导出导入、主题 | 跨设备同步、公开分享链接、多人协作 |

数据只在本浏览器——这是本机模式的设定，不是缺陷；要跨设备就往下看路线 B。

---

## 三、备份（可选）

本机模式的数据在浏览器里，用户自己会丢；服务端提供一个加密备份桶：

```bash
BACKUP_DIR=/var/lib/pose-atlas/backups   # 默认 ./data/backups
```

- 客户端用备份码（22 位）派生出 AES-256-GCM 密钥，**先加密再上传**；服务器只存密文，看不到卡片内容。
- 单个备份上限 40MB（含图片的备份通常几 MB）；`PUT/GET/DELETE /api/backup/<备份码>`。
- 目录要备份，但**即使泄露也读不出内容**（除非备份码同时泄露）。
- Nginx 需要放行 `client_max_body_size 45m;`，并把 `/api/backup/` 反代到同一个 Node 服务。

## 四、AI：系统配置，发布时不用管

运维在 AI 服务的环境变量里填好即可，前端零配置：

```bash
HOST=127.0.0.1
PORT=5175
AI_ALLOWED_ORIGINS=https://你的域名
AI_BASE_URL=https://api.provider.example/v1
AI_API_KEY=服务端密钥
AI_MODEL=视觉模型名
```

- 配好后所有用户直接用「AI 推荐」「AI 帮我填满」，不需要各自填 key。
- 用户仍然可以在系统设置里加自己的模型档案来覆盖系统默认（高级用法，不配也不影响）。
- 系统默认没配时，界面会提示「请先配置 AI 服务」，属于预期提示，不是故障。

---

## 五、路线 B：要跨设备 / 公开分享时

需要补这些接口（前端已经在调用，仓库里只有本机实现）：

| 接口 | 用途 |
| --- | --- |
| `GET/PUT /api/workspace` | 读取/保存整个工作区 |
| `POST /api/shares`、`GET /api/shares/:id`、`POST /api/shares/:id/export` | 发布与分享快照 |
| `POST /api/images`、`GET /api/media/:id` | 图片上传与读取 |
| `/signin-with-chatgpt`、`/callback`、`/signout-with-chatgpt` | 登录态（如果沿用现有登录流程） |

补齐后设 `VITE_DATA_MODE=api`，演示横幅与「本机演示」字样自动消失（侧栏显示「个人云端空间」）。

---

## 六、现成配置样例

### Nginx（静态 + AI 反代）

```nginx
server {
  listen 443 ssl http2;
  server_name pose.example.com;
  root /var/www/pose-atlas/dist;

  location / {
    try_files $uri $uri/ /index.html;
  }

  # 页面的 /api/ai/* 请求转发给 AI 服务
  location /api/ai/ {
    proxy_pass http://127.0.0.1:5175;
    proxy_set_header Host $host;
    proxy_set_header Origin https://pose.example.com;
    proxy_read_timeout 90s;
  }
}
```

> `Origin` 必须与 `AI_ALLOWED_ORIGINS` 完全一致（含协议），否则代理返回 403「请求来源不允许」。

### 本地验收

```bash
npm ci
npm run build
npm run preview   # http://127.0.0.1:4174，带 /api/ai 代理
```

---

## 七、上线前自检

- [ ] `npm test` 全绿（当前 100 项）
- [ ] `npm run typecheck`、`npm run build` 通过
- [ ] `dist/` 部署后控制台无 404（尤其 `/images/*`）
- [ ] 直接访问 `/s/anything` 能打开（SPA 回退生效）
- [ ] 打印预览：A4 一页出整版，正反面顺序正确
- [ ] AI 可用（系统默认已配时点一次就出内容）
- [ ] 手机窄屏翻面正常
- [ ] 隐私说明：数据存浏览器、图片为 AI 生成
- [ ] 想隐藏演示横幅时设置 `VITE_HIDE_DEMO=1`

---

## 八、常见坑

- **AI 一直 404**：AI 服务没启动，或跑的是旧进程（旧进程没有新接口）。重启 AI 服务即可，与前端无关。
- **AI 返回 403「请求来源不允许」**：`AI_ALLOWED_ORIGINS` 与页面实际域名（协议+域名+端口）不一致。
- **改了 `VITE_*` 没生效**：这些变量在**构建时**注入，改完要重新 `npm run build`。
- **换设备看不到自己的卡片**：本机模式的预期行为，卡片没有离开浏览器。
