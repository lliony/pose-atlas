const definitions = {
  INVALID_INPUT: [400, "推荐请求格式不正确"],
  NOT_CONFIGURED: [400, "请先配置 AI 服务"],
  UNSAFE_ENDPOINT: [400, "服务地址必须为安全的公网 HTTPS 地址"],
  AUTH_FAILED: [401, "AI 服务身份验证失败，请检查密钥"],
  MODEL_UNAVAILABLE: [400, "所选模型不可用"],
  IMAGE_UNSUPPORTED: [400, "图片格式不支持或内容已损坏"],
  RATE_LIMITED: [429, "AI 服务请求过于频繁，请稍后重试"],
  PAYLOAD_TOO_LARGE: [413, "请求内容超出大小限制，请缩小范围"],
  TIMEOUT: [504, "AI 服务请求超时，请稍后重试"],
  UPSTREAM_FAILED: [502, "AI 服务调用失败，请稍后重试"],
  INVALID_RESPONSE: [502, "AI 服务返回的推荐格式不正确"],
} as const;
export type AiErrorCode = keyof typeof definitions;
export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly status: number;
  constructor(code: AiErrorCode) {
    super(definitions[code][1]);
    this.name = "AiError";
    this.code = code;
    this.status = definitions[code][0];
  }
}
