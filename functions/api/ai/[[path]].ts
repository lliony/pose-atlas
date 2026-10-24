/**
 * /api/ai/* 反代：浏览器 → Pages Function → Render 上的 server/index.ts。
 * server/app.ts 校验 Host 必须命中 AI_ALLOWED_ORIGINS 的 host，而 fetch 无法伪造 Host，
 * 因此 Origin 统一改写为上游自身 origin；Render 侧把 AI_ALLOWED_ORIGINS 配上游 origin 即可，
 * 与 Pages 实际域名解耦。系统不配默认密钥时，上游被直接调用也只消耗调用者自己的 key。
 */

// Pages Functions 最小类型声明，避免引入 @cloudflare/workers-types。
interface PagesEventContext<Env> {
  request: Request;
  env: Env;
}
type PagesFunction<Env> = (
  context: PagesEventContext<Env>,
) => Response | Promise<Response>;

interface Env {
  /** Render 服务的 HTTPS 地址，如 https://pose-atlas-ai.onrender.com */
  AI_UPSTREAM: string;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AI_UPSTREAM) {
    return Response.json(
      { error: "AI 服务未配置（缺少 AI_UPSTREAM）", code: "NOT_CONFIGURED" },
      { status: 503 },
    );
  }
  const incoming = new URL(request.url);
  const upstream = new URL(env.AI_UPSTREAM);
  const target = new URL(incoming.pathname + incoming.search, upstream);

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
};
