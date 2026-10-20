import { useState } from "react";
import Dialog from "./Dialog";
import { uid, type State, type Album } from "../lib/types";
export function CategoryDialog({
  state,
  onSave,
  onClose,
}: {
  state: State;
  onSave: (state: State) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(structuredClone(state)),
    [name, setName] = useState(""),
    [target, setTarget] = useState(state.categories[0]?.id || ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const move = (i: number, step: number) => {
    const a = [...value.categories],
      j = i + step;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    setValue({ ...value, categories: a });
  };
  const remove = (id: string) => {
    if (value.categories.length === 1) {
      setError("至少保留一个分类");
      return;
    }
    const has = value.cards.some((c) => c.categoryId === id);
    if (has && (!target || target === id)) {
      setError("请选择另一个分类接收现有卡片");
      return;
    }
    setValue({
      ...value,
      categories: value.categories.filter((c) => c.id !== id),
      cards: value.cards.map((c) =>
        c.categoryId === id ? { ...c, categoryId: target } : c,
      ),
    });
    setError("");
  };
  return (
    <Dialog title="整理你的场景" onClose={onClose}>
      <div className="dialog-content">
        <p className="helper">调整顺序、修改名称，建立属于你的拍摄索引。</p>
        <div className="category-editor">
          {value.categories.map((c, i) => (
            <div key={c.id}>
              <span>{c.code}</span>
              <input
                aria-label={"分类 " + c.code}
                maxLength={60}
                value={c.name}
                onChange={(e) =>
                  setValue({
                    ...value,
                    categories: value.categories.map((x) =>
                      x.id === c.id ? { ...x, name: e.target.value } : x,
                    ),
                  })
                }
              />
              <button
                aria-label={"上移 " + c.name}
                disabled={!i}
                onClick={() => move(i, -1)}
              >
                ↑
              </button>
              <button
                aria-label={"下移 " + c.name}
                disabled={i === value.categories.length - 1}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
              <button onClick={() => remove(c.id)}>删除</button>
            </div>
          ))}
        </div>
        <form
          className="form-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            if (value.categories.some((c) => c.name === name.trim())) {
              setError("分类名称已存在");
              return;
            }
            setValue({
              ...value,
              categories: [
                ...value.categories,
                {
                  id: uid(),
                  name: name.trim(),
                  code: String(
                    Math.max(
                      ...value.categories.map((c) => Number(c.code) || 0),
                    ) + 1,
                  ).padStart(2, "0"),
                },
              ],
            });
            setName("");
            setError("");
          }}
        >
          <label>
            新增分类
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：美术馆"
              maxLength={60}
            />
          </label>
          <button>＋ 添加</button>
        </form>
        <label>
          删除分类时，将卡片移至
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            {value.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <p className="helper">卡片不会随分类删除，编号保持不变以便追溯。</p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="dialog-footer">
        <button onClick={onClose}>取消</button>
        <button
          className="primary"
          disabled={busy || value.categories.some((c) => !c.name.trim())}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave(value);
              onClose();
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "正在保存…" : "保存分类"}
        </button>
      </div>
    </Dialog>
  );
}
export function AlbumDialog({
  state,
  album,
  selected,
  onSave,
  onClose,
}: {
  state: State;
  album?: Album;
  selected: string[];
  onSave: (a: Album) => Promise<void>;
  onClose: () => void;
}) {
  const [a, setA] = useState<Album>(
      album
        ? structuredClone(album)
        : { id: uid(), name: "", description: "", cardIds: selected },
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const cards = a.cardIds
    .map((id) => state.cards.find((c) => c.id === id && !c.deleted))
    .filter(Boolean);
  const move = (i: number, d: number) => {
    const ids = [...a.cardIds],
      j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setA({ ...a, cardIds: ids });
  };
  return (
    <Dialog title={album ? "编辑卡片册" : "新建一本灵感册"} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSave(a);
            onClose();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="dialog-content">
          <label>
            卡片册名称
            <input
              required
              maxLength={100}
              value={a.name}
              onChange={(e) => setA({ ...a, name: e.target.value })}
              placeholder="例如：周末咖啡馆拍摄清单"
            />
          </label>
          <label>
            一句介绍
            <textarea
              maxLength={1000}
              value={a.description}
              onChange={(e) => setA({ ...a, description: e.target.value })}
            />
          </label>
          <div className="album-order">
            {cards.map((c, i) => (
              <div key={c!.id}>
                <span>
                  {c!.code} · {c!.title}
                </span>
                <button type="button" disabled={!i} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button
                  type="button"
                  disabled={i === cards.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setA({
                      ...a,
                      cardIds: a.cardIds.filter((id) => id !== c!.id),
                    })
                  }
                >
                  移除
                </button>
              </div>
            ))}
          </div>
          <label>
            添加卡片
            <select
              value=""
              onChange={(e) => {
                if (e.target.value)
                  setA({ ...a, cardIds: [...a.cardIds, e.target.value] });
              }}
            >
              <option value="">选择一张卡片</option>
              {state.cards
                .filter((c) => !c.deleted && !a.cardIds.includes(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.title}
                  </option>
                ))}
            </select>
          </label>
          <p className="helper">
            第一张卡片作为册子封面，公开后只显示册内内容。
          </p>
          {error && <p className="form-error">{error}</p>}
        </div>
        <div className="dialog-footer">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary" disabled={busy || !a.cardIds.length}>
            {busy ? "正在保存…" : "保存卡片册"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
