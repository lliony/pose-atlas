import { useState } from "react";
import type { State, Card } from "../../lib/types";
import type { AiScope, AiResult } from "../../lib/ai-types";
import { buildCandidates, addRecommendations } from "../../lib/ai-model";
import PoseCard from "../PoseCard";
export default function AiResults({
  state,
  scope,
  result,
  onRead,
  onSave,
}: {
  state: State;
  scope: AiScope;
  result: AiResult;
  onRead: (card: Card) => void;
  onSave: (state: State) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set()),
    [album, setAlbum] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  let valid = new Set<string>();
  try {
    valid = new Set(buildCandidates(state, scope).map((c) => c.id));
  } catch {
    /* expired scope has no selectable results */
  }
  const rows = result.recommendations.filter((r) => valid.has(r.cardId));
  return (
    <section className="ai-results">
      <h3>推荐结果</h3>
      <p>{result.sceneSummary}</p>
      {!rows.length && <p>当前没有有效推荐，请调整描述或范围后重试。</p>}
      <div className="ai-result-grid">
        {rows.map((row) => {
          const card = state.cards.find((c) => c.id === row.cardId)!;
          return (
            <div key={row.cardId}>
              <PoseCard
                card={card}
                category={
                  state.categories.find((c) => c.id === card.categoryId)
                    ?.name || ""
                }
                selected={selected.has(card.id)}
                readonly
                onSelect={() => {
                  setMessage("");
                  setSelected((old) => {
                    const next = new Set(old);
                    next.has(card.id)
                      ? next.delete(card.id)
                      : next.add(card.id);
                    return next;
                  });
                }}
                onEdit={() => {}}
                onDelete={() => {}}
                onRead={() => onRead(card)}
              />
              <p>
                <strong>推荐理由：</strong>
                {row.reason}
              </p>
              <p>
                <strong>拍摄建议：</strong>
                {row.adjustment}
              </p>
              <button onClick={() => onRead(card)}>查看完整说明</button>
            </div>
          );
        })}
      </div>
      <label>
        加入已有卡片册
        <select
          value={album}
          onChange={(e) => {
            setAlbum(e.target.value);
            setMessage("");
          }}
        >
          <option value="">选择卡片册</option>
          {state.albums.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={
          busy ||
          !state.albums.some((a) => a.id === album) ||
          !rows.some((r) => selected.has(r.cardId))
        }
        onClick={async () => {
          setBusy(true);
          setMessage("");
          try {
            await onSave(
              addRecommendations(
                state,
                album,
                rows.filter((r) => selected.has(r.cardId)).map((r) => r.cardId),
              ),
            );
            setMessage("已加入卡片册");
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "保存失败");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "正在保存…" : "加入卡片册"}
      </button>
      {message && (
        <p role={message === "已加入卡片册" ? "status" : "alert"}>{message}</p>
      )}
    </section>
  );
}
