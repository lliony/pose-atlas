import { useCallback, useEffect, useRef, useState } from "react";
import type { AiRequest, AiResult } from "../lib/ai-types.ts";
import { createRequestSession } from "../lib/ai-request-session.ts";
import { requestRecommendations } from "../services/ai.ts";

export function useAiRecommendation() {
  const session = useRef<ReturnType<typeof createRequestSession> | null>(null);
  if (session.current === null) session.current = createRequestSession();
  const [result, setResult] = useState<AiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => session.current?.cancel(), []);

  const cancel = useCallback(() => {
    session.current!.cancel();
    setLoading(false);
  }, []);

  const run = useCallback(async (input: AiRequest): Promise<void> => {
    const activeSession = session.current!;
    const { id, signal } = activeSession.begin();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const next = await requestRecommendations(input, signal);
      if (activeSession.isCurrent(id)) setResult(next);
    } catch (cause) {
      if (activeSession.isCurrent(id)) {
        setError(
          cause instanceof Error ? cause.message : "AI 推荐失败，请重试",
        );
      }
    } finally {
      if (activeSession.isCurrent(id)) setLoading(false);
    }
  }, []);

  return { run, cancel, result, loading, error };
}
