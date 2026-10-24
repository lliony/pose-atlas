import { useMemo, useState } from "react";
import type { State, Card } from "../../lib/types";
import type { AiScope, AiResult } from "../../lib/ai-types";
import { selectableRows, addRecommendations } from "../../lib/ai-model";
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
    // 结果提示与角色（status/alert）分开存，避免用「消息文案是否等于成功句」来推断 ARIA 角色。
    [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  // 只在 state/scope/result 变化时重算一次；选择切换不应触发整库候选重建（O(cards) + JSON 预算）。
  const selectable = useMemo(() => {
    try {
      return { error: "", ...selectableRows(state, scope, result.recommendations) };
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : "推荐范围已失效，请重新发起推荐",
        rows: [] as AiResult["recommendations"],
        cards: new Map<string, Card>(),
        categoryById: new Map<string, string>(),
      };
    }
  }, [state, scope, result]);
  const { rows, cards, categoryById, error } = selectable;
  return (
    <section className="ai-results">
      <h3>推荐结果</h3>
      <p>{result.sceneSummary}</p>
      {error ? (
        <p role="alert">{error}</p>
      ) : !rows.length ? (
        <p>当前没有有效推荐，请调整描述或范围后重试。</p>
      ) : null}
      <div className="ai-result-grid">
        {rows.map((row) => {
          const card = cards.get(row.cardId)!;
          return (
            <div key={row.cardId}>
              <PoseCard
                card={card}
                category={categoryById.get(card.categoryId) || ""}
                selected={selected.has(card.id)}
                readonly
                onSelect={() => {
                  setNotice(null);
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
            setNotice(null);
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
          setNotice(null);
          try {
            await onSave(
              addRecommendations(
                state,
                album,
                rows.filter((r) => selected.has(r.cardId)).map((r) => r.cardId),
              ),
            );
            setNotice({ text: "已加入卡片册", ok: true });
          } catch (e) {
            setNotice({
              text: e instanceof Error ? e.message : "保存失败",
              ok: false,
            });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "正在保存…" : "加入卡片册"}
      </button>
      {notice && (
        <p role={notice.ok ? "status" : "alert"}>{notice.text}</p>
      )}
    </section>
  );
}
