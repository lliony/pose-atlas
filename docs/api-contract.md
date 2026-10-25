# 云端 API 接入契约

前端通过同源Cookie获取会话，不自行生成或信任用户身份。未登录的私人接口返回401。所有写操作必须由服务端验证身份、来源及资源归属，不能依赖前端按钮隐藏。

响应均为JSON，失败格式 `{ "error": "可展示的错误信息" }`。工作区与分享数据结构见 `src/lib/types.ts`。

| 方法   | 路径                      | 请求                  | 成功响应                                         |
| ------ | ------------------------- | --------------------- | ------------------------------------------------ |
| GET    | `/api/workspace`          | 无                    | `{state, revision, user:{id,name}, local:false}` |
| PUT    | `/api/workspace`          | `{state, revision}`   | `{revision}`，并发冲突409                        |
| POST   | `/api/images`             | FormData字段`file`    | `{id, src:"/api/media/<id>"}`                    |
| GET    | `/api/media/<id>`         | 可选`?share=<id>`     | 图片二进制，验证拥有者或有效快照引用             |
| POST   | `/api/shares`             | `{albumId, revision}` | `{id,url,state,revision}`                        |
| GET    | `/api/shares/<id>`        | 无，允许匿名          | `{publication,signedIn}`                         |
| GET    | `/api/shares/<id>/export` | 需登录                | `{publication,signedIn:true}`                    |
| DELETE | `/api/shares/<id>`        | 拥有者                | `{ok:true}`                                      |

登录入口：`/signin-with-chatgpt?return_to=/`，分享页使用自身路径作为返回地址。若使用其他身份服务，修改 `src/Atlas.tsx` 中的登录地址，并由后端提供相应回调。

分享POST必须在同一事务中写入快照并更新`album.shareId`与工作区版本，响应带回最新state/revision，防止公开副本失去管理入口。共享内容排除私人备注，只包括册内非删除卡片及相关分类；更新公开版本是显式操作。撤销后图片的分享访问也应失效。

图片每张最大20MB、每卡最多20张。后端需要验证真实图片类型、大小与所有权，返回受控路径，不接受任意外部URL。不得允许客户端伪造登录头或对象存储归属。

`API_PROXY_TARGET`仅用于开发：代理保留浏览器Origin/Host，后端需允许该开发来源并正确处理会话。生产反向代理应将所有`/api/*`、登录及回调路由送至后端，SPA fallback只能应用于前端路由。保持HTTPS与SameSite/HttpOnly会话Cookie设置。

## 本机 AI 推荐接口

`npm run dev:ai` 只监听 `127.0.0.1:5175`，Vite 通过 `AI_PROXY_TARGET` 代理 `/api/ai/*`。此本机服务与上文所述的云端账号 API 是独立接口；它按允许的本机来源与 Host 检查请求，但**不提供用户身份验证**，不可直接公开。三个路由均返回 JSON，响应含 `Cache-Control: no-store`。服务端只从环境变量读取系统默认 `AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL`，`GET` 不返回密钥或地址。

| 方法 | 路由 | 请求 | 成功响应 |
| --- | --- | --- | --- |
| GET | `/api/ai/config` | 无 | `{"defaultAvailable":false}` 或 `true` |
| POST | `/api/ai/test` | `{ "baseUrl":"https://provider.example/v1", "apiKey":"fake-key", "model":"vision-demo" }` | `{"ok":true}`；只测试文字连接 |
| POST | `/api/ai/recommend` | 下方示例 | 下方示例，最多五项 |

推荐请求示例（`image` 可省略；若提供，必须是压缩后的 JPEG base64）：

```json
{
  "mode": "scene",
  "scope": { "kind": "category", "id": "category-1" },
  "description": "傍晚的街道，人物自然行走",
  "image": { "mime": "image/jpeg", "base64": "<fake-jpeg-base64>" },
  "candidates": [{
    "id": "card-01-001", "title": "往前走，拍一个背影", "category": "街道",
    "tags": ["行走"],
    "notes": {"pose":"自然行走","camera":"腰平机位","composition":"留出前进空间","light":"柔光","cautions":"留意路况"},
    "imageNotes": []
  }],
  "selection": { "kind": "default" }
}
```

个人服务将 `selection` 换为 `{"kind":"personal","config":{"baseUrl":"https://provider.example/v1","apiKey":"fake-key","model":"vision-demo","protocol":"openai"}}`。`mode` 可为 `scene` 或 `reference`；`scope` 可为 `{"kind":"all"}`、`{"kind":"album","id":"..."}` 或 `{"kind":"category","id":"..."}`。`candidates` 是当前范围内未删除卡片的教学资料白名单，不能包含私人备注、来源、库内图片二进制或密钥。服务端拒绝内部地址、非 HTTPS 地址和重定向。

`protocol` 支持 `openai`（OpenAI Chat Completions，旧配置省略时的默认值）和 `anthropic`（Anthropic Messages）。连接测试、推荐、填充共用该选择。模型档案可分别指定给推荐或填充。基础地址通常填到 `/v1`，也支持对应格式的完整 `/chat/completions` 或 `/messages` 地址；Anthropic 使用 `x-api-key` 与 `anthropic-version` 请求头，图片转为 base64 source，回复提取文本块。系统默认模型可通过 `AI_PROTOCOL=openai|anthropic` 设置协议，不填时沿用 OpenAI。修改后需同时部署前端和 AI 后端。

```json
{
  "sceneSummary": "傍晚侧光适合带出行走方向",
  "recommendations": [
    { "cardId": "card-01-001", "reason": "步行动作适合街道", "adjustment": "让人物向光处慢走" }
  ]
}
```

错误统一为 `{"error":"可展示的中文消息","code":"RATE_LIMITED"}`，不会透传上游正文。常见代码：`INVALID_INPUT` 400、`NOT_CONFIGURED` 400、`UNSAFE_ENDPOINT` 400、`AUTH_FAILED` 401、`MODEL_UNAVAILABLE` 400、`IMAGE_UNSUPPORTED` 400、`PAYLOAD_TOO_LARGE` 413、`RATE_LIMITED` 429、`UPSTREAM_FAILED` 502、`INVALID_RESPONSE` 502、`TIMEOUT` 504。来源、方法和类型错误分别返回 `FORBIDDEN` 403、`METHOD_NOT_ALLOWED` 405、`UNSUPPORTED_MEDIA_TYPE` 415。JSON 请求体最多 4 MiB，候选教学资料序列化最多 120,000 字符，默认上游期限 60 秒；服务端同时最多处理两个上游调用、每分钟最多 30 次。
