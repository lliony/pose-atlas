import dns from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { AiError } from "./errors.ts";
import type { AiProtocol } from "../../src/lib/ai-types.ts";

export function isPublicAddress(address: string): boolean {
  try {
    if (!isIP(address)) return false;
    const parsed = ipaddr.process(address);
    if (parsed.kind() === "ipv6" && !parsed.match(ipaddr.parseCIDR("2000::/3")))
      return false;
    return parsed.range() === "unicast";
  } catch {
    return false;
  }
}
export function parseEndpoint(baseUrl: string, protocol: AiProtocol = "openai"): URL {
  try {
    if (
      typeof baseUrl !== "string" ||
      baseUrl.length > 2048 ||
      /[?#]/.test(baseUrl)
    )
      throw new Error();
    const url = new URL(baseUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !url.hostname
    )
      throw new Error();
    const path = url.pathname.replace(/\/+$/, "");
    const suffix = protocol === "anthropic" ? "/messages" : "/chat/completions";
    url.pathname = path.endsWith(suffix)
      ? path
      : `${path || (protocol === "anthropic" ? "/v1" : "")}${suffix}`;
    return url;
  } catch {
    throw new AiError("UNSAFE_ENDPOINT");
  }
}
export async function resolveEndpoint(
  baseUrl: string,
  protocol: AiProtocol = "openai",
): Promise<{ url: URL; address: string; family: 4 | 6 }> {
  const url = parseEndpoint(baseUrl, protocol);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  try {
    const literalFamily = isIP(hostname);
    const answers = literalFamily
      ? [{ address: hostname, family: literalFamily }]
      : await dns.lookup(hostname, { all: true, verbatim: true });
    if (
      !answers.length ||
      answers.some(
        (a) =>
          !isPublicAddress(a.address) || (a.family !== 4 && a.family !== 6),
      )
    )
      throw new Error();
    const { address, family } = answers[0];
    return { url, address, family: family as 4 | 6 };
  } catch {
    throw new AiError("UNSAFE_ENDPOINT");
  }
}
