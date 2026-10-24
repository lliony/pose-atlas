/**
 * Cloudflare Worker 入口：静态资产由 ASSETS 提供（SPA 回退见 wrangler.jsonc），
 * /api/ai/* 反代到 Render 上的 server/index.ts。
 * server/app.ts 校验 Host 必须命中 AI_ALLOWED_ORIGINS 的 host，而 fetch 无法伪造 Host，
 * 因此 Origin 统一改写为上游自身 origin；Render 侧把 AI_ALLOWED_ORIGINS 配上游 origin 即可。
 * 系统不配默认密钥时，上游被直接调用也只消耗调用者自己的 key。
 */

interface Env {
  /** Render 服务的 HTTPS 地址，如 https://pose-atlas-ai.onrender.com */
  AI_UPSTREAM: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/ai/")) return env.ASSETS.fetch(request);
    if (!env.AI_UPSTREAM) {
      return Response.json(
        { error: "AI 服务未配置（缺少 AI_UPSTREAM）", code: "NOT_CONFIGURED" },
        { status: 503 },
      );
    }
    const upstream = new URL(env.AI_UPSTREAM);
    const target = new URL(url.pathname + url.search, upstream);
    const headers = new Headers(request.headers);
    headers.set("Origin", upstream.origin);
    headers.delete("host");
    // 站点无会话，去掉 cookie，避免上游按会话区分调用方。
    headers.delete("cookie");
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    return fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : null,
      redirect: "manual",
    });
  },
};
