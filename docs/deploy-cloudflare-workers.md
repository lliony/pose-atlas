# 参考部署：Cloudflare Workers + Render（免费）

本文记录一种**已验证可用的免费部署方式**，不是唯一方案：项目本体是 Vite 静态站 + 一个可选的 AI 代理服务（`server/index.ts`），任何「静态托管 + 同源反代」的组合都可以，自建 Nginx 见 [deploy.md](deploy.md#五现成配置样例)。

架构：

```
浏览器
  └─ Cloudflare Worker（免费）
       ├─ 静态资产 ./dist（SPA 回退由平台内置处理）
       └─ /api/ai/* ──反代──> Render 免费 Web Service（server/index.ts）
                                 └─ 调用你在「系统设置」里配置的模型 API
```

仓库已带全部配置，部署过程**不需要改代码**：

| 文件 | 作用 |
| --- | --- |
| `wrangler.jsonc` | Workers 入口：静态资产 `./dist`、SPA 回退、`/api/ai/*` 先进 Worker |
| `worker/index.ts` | `/api/ai/*` 反代到 Render，Origin 改写为上游 origin |
| `render.yaml` | Render Blueprint，免费档直接跑 `server/index.ts` |

## 前置条件

- 代码已推送到 GitHub 仓库
- Cloudflare 账号、Render 账号（均可用免费档）

## 第一步：Render 部署 AI 服务

1. [dashboard.render.com](https://dashboard.render.com) → New → **Blueprint** → 连接本仓库。
2. Render 按 `render.yaml` 创建名为 `pose-atlas-ai` 的 Web Service，等首次部署变绿。
3. 记下服务地址（形如 `https://pose-atlas-ai.onrender.com`）。

> 改名或换账号导致域名不同时，必须把 Render 环境变量 `AI_ALLOWED_ORIGINS` 改成与服务域名一致，否则全部请求 403。

**不配** `AI_API_KEY` 等模型变量：系统默认模型保持关闭，由每位访客在页面「系统设置」里填自己的 key（只存各自浏览器的 localStorage）。这样公网没有可盗用的额度。

## 第二步：Cloudflare Workers 部署静态站

1. [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → Create → **Import repository** → 选本仓库。
2. 检测到仓库里的 `wrangler.jsonc` 后按它部署；构建命令 `npm run build` 即可。
3. 部署成功后进入该 Worker → Settings → **Variables and Secrets**，添加：
   - `AI_UPSTREAM=https://pose-atlas-ai.onrender.com`（第一步的实际地址）
4. 保存变量会触发再部署，等它完成。

## 第三步：验证

```bash
curl https://<你的-worker-域名>/api/ai/config
# 期望：{"defaultAvailable":false}
```

打开 `https://<你的-worker-域名>`，图鉴、打印、导出导入应全部可用；在「系统设置」填入兼容 OpenAI Chat Completions 的模型配置后，AI 推荐与填充可用。

## 常见坑

- **AI 服务提示「未配置（缺少 AI_UPSTREAM）」（503）**：页面和 Worker 都正常，只是 Worker 的环境变量没配或配错了名字。到 Cloudflare 控制台 → Workers & Pages → 该 Worker → Settings → Variables and Secrets，添加文本变量 `AI_UPSTREAM=https://<render-地址>`（不带末尾斜杠），保存即生效，无需重新部署。配好后用第三步的 curl 验证。
- **`Invalid _redirects configuration ... code: 100324`**：画蛇添足加了 `public/_redirects`。Workers 的 `single-page-application` 已内置 SPA 回退，叠加 `/* /index.html 200` 会被判无限循环。本仓库**刻意不带** `_redirects`。
- **`functions/` 目录不生效**：那是 Pages 专属约定，Workers 部署走 `wrangler.jsonc` 的 `main` 入口（`worker/index.ts`）。
- **AI 首次请求等 30–60 秒**：Render 免费档闲置 15 分钟休眠，冷启动期间 Worker 一起等待，之后的请求恢复正常。
- **AI 返回 403「请求来源不允许」**：Render 的 `AI_ALLOWED_ORIGINS` 与 Render 服务自身域名不一致（本方案里 Worker 会把 Origin 改写为上游 origin，见 `worker/index.ts`）。
- **改服务名后忘了同步**：`render.yaml` 的 `name` 决定域名，`AI_ALLOWED_ORIGINS` 与 Cloudflare 的 `AI_UPSTREAM` 都要跟着改。

## 换成别的平台时

- 静态托管可换成任何支持 SPA 回退的平台（Netlify / Vercel / Nginx），AI 反代用该平台能力实现同样语义即可：转发 `/api/ai/*` 并把 `Origin` 改为上游 origin。
- 本机开发不经过这套配置：`npm run dev` + `npm run dev:ai` 直连，见 [README](../README.md)。
