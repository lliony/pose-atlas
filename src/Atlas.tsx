import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CARD_RATIOS, GENDERS, STYLES, normalizeAppearance, matchesPerson, type CardAppearance } from './lib/card-appearance';
import { RATIO_KEYS, cardRatioKeys, aspectOf, type PhotoSize, type RatioKey } from './lib/image-ratio';
import AiRecommendation from "./components/ai/AiRecommendation";
import { createConfigStore } from "./services/ai-config";
import seed from "./lib/seed.json";
import {
  blankNotes,
  labels,
  uid,
  type State,
  type Card,
  type Album,
  type Publication,
} from "./lib/types";
import { resolveNotes } from "./lib/model";
import PoseCard from "./components/PoseCard";
import SystemSettings from "./components/SystemSettings";
import Photo from "./components/Photo";
import Dialog from "./components/Dialog";
import Editor from "./components/Editor";
import PrintView from "./components/PrintView";
import { CategoryDialog, AlbumDialog } from "./components/LibraryDialogs";
import {
  api,
  isLocalMode,
  resolveImageUrl,
  type Workspace,
  type ShareResponse,
  type PublishResponse,
} from "./services/api";
export default function Atlas({ shareId }: { shareId?: string }) {
  const [state, setState] = useState<State>(seed as State),
    [revision, setRevision] = useState(0),
    [userId, setUserId] = useState(""),
    [signed, setSigned] = useState(false),
    [loading, setLoading] = useState(true),
    [local, setLocal] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [publication, setPublication] = useState<Publication>(),
    [category, setCategory] = useState("all"),
    [view, setView] = useState("library"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [editor, setEditor] = useState<Card>(),
    [manage, setManage] = useState(false),
    [albumEditor, setAlbumEditor] = useState<Album | null | undefined>(),
    [printCards, setPrintCards] = useState<Card[]>(),
    [detail, setDetail] = useState<Card>(),
    [shareAlbum, setShareAlbum] = useState<Album>();
  const owner = signed && !shareId;
  const [aiOpen, setAiOpen] = useState(false);
  const [appearance,setAppearance] = useState<CardAppearance>(()=>{
    try{return normalizeAppearance(JSON.parse(localStorage.getItem('pose-atlas:appearance') || 'null'));}catch{return normalizeAppearance(null);}
  });
  const [gender,setGender] = useState('全部');
  const [sizes,setSizes] = useState<Map<string,PhotoSize>>(new Map());
  const [ratioFilter,setRatioFilter] = useState<'全部'|RatioKey>('全部');
  const [styleFilter,setStyleFilter] = useState('全部');
  useEffect(()=>{try{localStorage.setItem('pose-atlas:appearance',JSON.stringify(appearance));}catch{}},[appearance]);
  // 量出每张图的原始尺寸：按比例筛选、按比例排版都靠它（不再裁切）
  useEffect(() => {
    let alive = true;
    const srcs = new Set<string>();
    state.cards.forEach((c) => c.images.forEach((p) => srcs.add(p.src)));
    void (async () => {
      const entries = await Promise.all(
        [...srcs].map(async (src) => {
          try {
            const url = await resolveImageUrl(src, shareId);
            const size = await new Promise<PhotoSize | null>((resolve) => {
              const img = new Image();
              img.onload = () =>
                resolve({ w: img.naturalWidth, h: img.naturalHeight });
              img.onerror = () => resolve(null);
              img.src = url;
            });
            return size ? ([src, size] as [string, PhotoSize]) : null;
          } catch {
            return null;
          }
        }),
      );
      if (alive)
        setSizes(
          new Map(entries.filter((e): e is [string, PhotoSize] => e !== null)),
        );
    })();
    return () => {
      alive = false;
    };
  }, [state.cards, shareId]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configVersion, setConfigVersion] = useState(0);
  const [showGrid, setShowGrid] = useState(() => {
    try {
      return localStorage.getItem("pose-atlas:grid") === "on";
    } catch {
      return false;
    }
  });
  const [editorIntent, setEditorIntent] = useState<"photos">();
  const aiTrigger = useRef<HTMLButtonElement>(null);
  const detailReturnFocus = useRef<HTMLElement | null>(null);
  const openDetail = (card: Card) => {
    detailReturnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setDetail(card);
  };
  const aiStore = useMemo(
    () =>
      createConfigStore(userId, {
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
        removeItem: (key) => localStorage.removeItem(key),
      }),
    [userId],
  );
  const login =
    "/signin-with-chatgpt?return_to=" +
    encodeURIComponent(shareId ? "/share/" + shareId : "/");
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      if (shareId) {
        const r = await api<ShareResponse>("shares/" + shareId);
        setPublication(r.publication);
        setState({ ...r.publication, albums: [] });
        setSigned(r.signedIn);
      } else {
        const r = await api<Workspace>("workspace");
        setState(r.state);
        setRevision(r.revision);
        setUserId(r.user.id);
        setSigned(true);
        setLocal(r.local);
      }
    } catch (e: any) {
      if (e.status !== 401) setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [shareId]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    document.body.dataset.grid = showGrid ? "on" : "off";
    try {
      localStorage.setItem("pose-atlas:grid", showGrid ? "on" : "off");
    } catch {
      /* 存不下就只在本次会话生效 */
    }
  }, [showGrid]);
  const save = async (next: State) => {
    if (!owner) throw new Error("请先登录");
    setBusy(true);
    try {
      const r = await api<{ revision: number }>("workspace", "PUT", {
        state: next,
        revision,
      });
      setState(next);
      setRevision(r.revision);
      setToast("已保存");
      setError("");
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const act = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const active = state.cards.filter((c) => !c.deleted),
    visible = state.cards.filter(
      (c) =>
        (view === "trash" ? c.deleted : !c.deleted) &&
        (category === "all" || c.categoryId === category) &&
        matchesPerson(c,gender,styleFilter) &&
        (ratioFilter==='全部' || cardRatioKeys(c.images, sizes).has(ratioFilter)) &&
        (!query ||
          [c.title, c.code, ...c.tags, c.gender || '', ...(c.styles || [])]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase())),
    );
  const chosen = active.filter((c) => selected.has(c.id));
  const beginPrint = async (cards: Card[]) => {
    if (!signed) {
      location.href = login;
      return;
    }
    try {
      if (shareId) await api("shares/" + shareId + "/export");
      setPrintCards(cards);
    } catch (e: any) {
      setError(e.message);
    }
  };
  const newCard = () => {
    const cat =
      state.categories.find((c) => c.id === category) || state.categories[0];
    setEditor({
      id: uid(),
      categoryId: cat.id,
      code: cat.code + "-" + String(state.cards.length + 1).padStart(3, "0"),
      title: "",
      tags: [],
      notes: { ...blankNotes },
      privateNote: "",
      images: [],
    });
  };
  const publish = async (album: Album) => {
    await act(async () => {
      const r = await api<PublishResponse>("shares", "POST", {
        albumId: album.id,
        revision,
      });
      setState(r.state);
      setRevision(r.revision);
      setShareAlbum(r.state.albums.find((a: Album) => a.id === album.id));
      setToast(isLocalMode ? "本机预览已更新" : "公开版本已更新");
    });
  };
  const download = async () => {
    try {
      if (!signed) {
        location.href = login;
        return;
      }
      if (shareId) await api("shares/" + shareId + "/export");
      const blob = new Blob(
        [JSON.stringify(shareId ? publication : state, null, 2)],
        { type: "application/json" },
      );
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "pose-atlas-notes.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      setToast("已下载文字资料（图片请通过打印保存PDF）");
    } catch (e: any) {
      setError(e.message);
    }
  };
  return (
    <div className="app-shell" data-card-frame={appearance.frame} data-card-ratio={appearance.ratio} style={{'--card-aspect':appearance.ratio.replace(':',' / ')} as CSSProperties}>
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">
            P<span>↗</span>
          </span>
          <div>
            姿势图鉴<small>POSE ATLAS</small>
          </div>
        </a>
        <nav className="side-section overview-nav" aria-label="总览">
          <span className="eyebrow">总览</span>
          <button
            className={
              view === "library" && category === "all" ? "nav active" : "nav"
            }
            onClick={() => {
              setView("library");
              setCategory("all");
            }}
          >
            <span>▦ 全部灵感</span>
            <small>{active.length}</small>
          </button>
          {!shareId && (
            <button
              className={view === "albums" ? "nav active" : "nav"}
              onClick={() => setView("albums")}
            >
              <span>▤ 我的卡片册</span>
              <small>{state.albums.length}</small>
            </button>
          )}
          {owner && (
            <button className="nav" onClick={() => setSettingsOpen(true)}>
              <span>⚙ 系统设置</span>
            </button>
          )}
          {owner && (
            <button
              className={view === "trash" ? "nav active" : "nav"}
              onClick={() => {
                setView("trash");
                setCategory("all");
              }}
            >
              <span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  aria-hidden="true"
                >
                  <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
                </svg>{" "}
                回收站
              </span>
              <small>{state.cards.filter((c) => c.deleted).length}</small>
            </button>
          )}
        </nav>
        <div className="side-section">
          <div className="side-heading">
            <span className="eyebrow">按场景探索</span>
            {owner && (
              <button onClick={() => setManage(true)} aria-label="管理分类">
                ＋
              </button>
            )}
          </div>
          {state.categories.map((c) => (
            <button
              key={c.id}
              className={
                category === c.id && view === "library" ? "nav active" : "nav"
              }
              onClick={() => {
                setCategory(c.id);
                setView("library");
              }}
            >
              <span>
                <i>{c.code}</i>
                {c.name}
              </span>
              <small>
                {active.filter((x) => x.categoryId === c.id).length}
              </small>
            </button>
          ))}
        </div>
        <div className="side-bottom">
          <div className="pocket-note">
            <span>随身的拍摄灵感</span>
            <strong>
              小小一张，
              <br />
              装下好照片的思路。
            </strong>
            <p>70 × 100 mm · 双面口袋卡</p>
            <button
              onClick={() => void beginPrint(chosen.length ? chosen : active)}
            >
              制作我的口袋卡 ↗
            </button>
          </div>
          <p className="side-foot">
            慢一点观察，拍出自己的风格。
            <br />
            POSE ATLAS © 2026
          </p>
        </div>
      </aside>
      <main>
        {isLocalMode && (
          <div className="border-b border-line bg-soft px-5 py-2 text-xs text-ink md:px-12">
            本机演示模式 · 数据保存在当前浏览器，不会自动同步云端。
            <span className="ml-2 text-muted">公开分享需接入 API。</span>
          </div>
        )}
        <header className="topbar">
          <span>
            灵感库 <i>/</i> {shareId ? "公开卡片册" : "个人摄影工作台"}
          </span>
          <div className="topbar-actions">
            {signed ? (
              <span className="account">
                <b />{" "}
                {local
                  ? "本机演示 · IndexedDB"
                  : shareId
                    ? "已登录"
                    : "个人云端空间"}
              </span>
            ) : (
              <a className="primary button" href={login} target="_top">
                登录我的空间 ↗
              </a>
            )}
          </div>
        </header>
        {error && (
          <div className="alert" role="alert">
            {error} <button onClick={() => void load()}>重新加载</button>
          </div>
        )}
        {loading ? (
          <div className="loading">正在打开你的灵感库…</div>
        ) : shareId && !publication ? (
          <div className="empty">
            <h2>这本卡片册暂时无法访问</h2>
            <p>分享可能已取消，请联系分享者获取新链接。</p>
          </div>
        ) : (
          <>
            <section className="hero">
              <div className="hero-copy">
                <span className="eyebrow">
                  {shareId
                    ? "A SHARED COLLECTION"
                    : "COLLECT MOMENTS. CREATE STORIES."}
                </span>
                <h1>
                  {shareId ? (
                    publication?.name
                  ) : (
                    <>
                      让每一次快门，
                      <br />
                      都有<span>灵感可循。</span>
                    </>
                  )}
                </h1>
                <p>
                  {shareId
                    ? publication?.description
                    : "收集姿势，读懂构图。把喜欢的拍摄思路，整理成随时翻看的口袋图鉴。"}
                </p>
                <div className="hero-meta">
                  <span>
                    <b>{active.length.toString().padStart(2, "0")}</b> 姿势灵感
                  </span>
                  <span>
                    <b>{state.categories.length.toString().padStart(2, "0")}</b>{" "}
                    拍摄场景
                  </span>
                  <span>
                    70 × 100 <small>mm</small> 便携打印
                  </span>
                </div>
              </div>
              <div className="hero-visual">
                <div className="hero-photo">
                  <Photo
                    image={(active[3] || active[0] || seed.cards[0]).images[0]}
                    title="咖啡馆的片刻灵感"
                    shareId={shareId}
                  />
                  <span>FIELD GUIDE — 01</span>
                </div>
                <div className="hero-stamp">
                  观察光线
                  <br />
                  留住瞬间<span>LOOK · FEEL · CREATE</span>
                </div>
              </div>
            </section>
            {!signed && !shareId && (
              <div className="demo-note">
                这里是 18 张 AI
                姿势参考示例。登录后即可拥有个人空间，新增图片、整理场景并分享卡册。
                <a href={login} target="_top">
                  开启我的图鉴 →
                </a>
              </div>
            )}
            <section className="library">
              <div className="section-title">
                <div>
                  <span className="eyebrow">
                    {view === "albums"
                      ? "YOUR COLLECTIONS"
                      : view === "trash"
                        ? "RECENTLY REMOVED"
                        : "THE POSE LIBRARY"}
                  </span>
                  <h2>
                    {view === "albums"
                      ? "我的卡片册"
                      : view === "trash"
                        ? "回收站"
                        : category === "all"
                          ? "发现下一张好照片"
                          : state.categories.find((c) => c.id === category)
                              ?.name}
                    <small>
                      {view === "albums" ? state.albums.length : visible.length}
                    </small>
                  </h2>
                </div>
                <div className="actions">
                  {view !== "albums" && (
                    <button
                      type="button"
                      className="grid-toggle"
                      aria-pressed={showGrid}
                      aria-label={showGrid ? "隐藏构图网格" : "显示构图网格"}
                      title="构图网格（3×3）"
                      onClick={() => setShowGrid((v) => !v)}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        aria-hidden="true"
                      >
                        <rect
                          x="3.5"
                          y="3.5"
                          width="17"
                          height="17"
                          rx="1.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        />
                        <path
                          d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"
                          stroke="currentColor"
                          strokeWidth="1.1"
                        />
                      </svg>
                      <span>构图网格</span>
                      <strong>{showGrid ? "开" : "关"}</strong>
                    </button>
                  )}
                  {owner && (
                    <button onClick={() => setManage(true)}>管理分类</button>
                  )}
                  <button
                    onClick={() =>
                      void beginPrint(chosen.length ? chosen : visible)
                    }
                  >
                    ↗ 下载 / 打印
                  </button>
                  {owner && (
                    <button
                      className="primary"
                      onClick={
                        view === "albums" ? () => setAlbumEditor(null) : newCard
                      }
                    >
                      ＋ {view === "albums" ? "新建卡片册" : "新增姿势"}
                    </button>
                  )}
                </div>
              </div>
              {view !== "albums" && (
                <div className="card-display-controls" aria-label="卡片显示与人物筛选">
                  <label>图片比例<select aria-label="图片比例" value={ratioFilter} onChange={e=>setRatioFilter(e.target.value as '全部'|RatioKey)}><option value="全部">全部</option>{RATIO_KEYS.map(r=><option key={r} value={r}>{r}</option>)}</select></label>
                  <label>卡片边框<select value={appearance.frame} onChange={e=>setAppearance({...appearance,frame:e.target.value as CardAppearance['frame']})}><option value="thin">细边框</option><option value="none">无边框</option></select></label>
                  <label>人物性别<select value={gender} onChange={e=>setGender(e.target.value)}>{['全部',...GENDERS,'未分类'].map(x=><option key={x}>{x}</option>)}</select></label>
                  <label>气质风格<select value={styleFilter} onChange={e=>setStyleFilter(e.target.value)}>{['全部',...STYLES,'未分类'].map(x=><option key={x}>{x}</option>)}</select></label>
                  {(gender!=='全部'||styleFilter!=='全部'||ratioFilter!=='全部')&&<button onClick={()=>{setGender('全部');setStyleFilter('全部');setRatioFilter('全部');}}>清除筛选</button>}
                </div>
              )}
              {view !== "albums" && (
                <div className="filterbar">
                  <div className="filter-pills">
                    <button
                      className={category === "all" ? "active" : ""}
                      onClick={() => setCategory("all")}
                    >
                      全部场景
                    </button>
                    {state.categories.map((c) => (
                      <button
                        key={c.id}
                        className={category === c.id ? "active" : ""}
                        onClick={() => setCategory(c.id)}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                  <label className="library-search">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      aria-hidden="true"
                    >
                      <circle cx="10.5" cy="10.5" r="6.5" />
                      <path d="m16 16 5 5" />
                    </svg>
                    <input
                      className="search"
                      aria-label="搜索姿势"
                      placeholder="搜索姿势名称、标签或编号"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                </div>
              )}
              {view === "albums" ? (
                <div className="album-grid">
                  {state.albums.map((a) => {
                    const cover = active.find((c) => a.cardIds.includes(c.id));
                    return (
                      <article className="album-tile" key={a.id}>
                        {cover && (
                          <Photo image={cover.images[0]} title={a.name} />
                        )}
                        <div>
                          <span className="eyebrow">
                            {
                              a.cardIds.filter((id) =>
                                active.some((c) => c.id === id),
                              ).length
                            }{" "}
                            张卡片 ·{" "}
                            {a.shareId
                              ? isLocalMode
                                ? "本机预览"
                                : "已生成分享"
                              : "私人收藏"}
                          </span>
                          <h3>{a.name}</h3>
                          <p>{a.description || "收集属于你的拍摄灵感。"}</p>
                          <div className="actions">
                            <button
                              onClick={() =>
                                void beginPrint(
                                  a.cardIds
                                    .map((id) =>
                                      active.find((c) => c.id === id),
                                    )
                                    .filter(Boolean) as Card[],
                                )
                              }
                            >
                              打印
                            </button>
                            {owner && (
                              <>
                                <button onClick={() => setAlbumEditor(a)}>
                                  编辑
                                </button>
                                <button
                                  className="primary"
                                  onClick={() => setShareAlbum(a)}
                                >
                                  分享 ↗
                                </button>
                                <button
                                  aria-label={"删除 " + a.name}
                                  onClick={() => {
                                    if (
                                      confirm(
                                        "删除这本册子？卡片会保留，公开分享同时取消。",
                                      )
                                    )
                                      void act(async () => {
                                        if (a.shareId)
                                          await api(
                                            "shares/" + a.shareId,
                                            "DELETE",
                                          );
                                        await save({
                                          ...state,
                                          albums: state.albums.filter(
                                            (x) => x.id !== a.id,
                                          ),
                                        });
                                      });
                                  }}
                                >
                                  删除
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : view === "trash" ? (
                <div className="trash-list">
                  {visible.map((c) => (
                    <div key={c.id}>
                      <span>
                        {c.code} · {c.title}
                      </span>
                      <button
                        onClick={() =>
                          void act(() =>
                            save({
                              ...state,
                              cards: state.cards.map((x) =>
                                x.id === c.id ? { ...x, deleted: false } : x,
                              ),
                            }),
                          )
                        }
                      >
                        恢复
                      </button>
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              "永久删除这张卡片？已有公开副本需另行更新或取消。",
                            )
                          )
                            void act(() =>
                              save({
                                ...state,
                                cards: state.cards.filter((x) => x.id !== c.id),
                                albums: state.albums.map((a) => ({
                                  ...a,
                                  cardIds: a.cardIds.filter(
                                    (id) => id !== c.id,
                                  ),
                                })),
                              }),
                            );
                        }}
                      >
                        永久删除
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="card-grid">
                  {visible.map((c) => (
                    <PoseCard
                      key={c.id}
                      card={c}
                      category={
                        state.categories.find((x) => x.id === c.categoryId)
                          ?.name || ""
                      }
                      selected={selected.has(c.id)}
                      readonly={!owner}
                      shareId={shareId}
                      sizes={sizes}
                      onSelect={() =>
                        setSelected((s) => {
                          const n = new Set(s);
                          n.has(c.id) ? n.delete(c.id) : n.add(c.id);
                          return n;
                        })
                      }
                      onRead={() => openDetail(c)}
                      onEdit={() => setEditor(c)}
                      onDelete={() =>
                        void act(() =>
                          save({
                            ...state,
                            cards: state.cards.map((x) =>
                              x.id === c.id ? { ...x, deleted: true } : x,
                            ),
                          }),
                        )
                      }
                    />
                  ))}
                </div>
              )}
              {view !== "albums" && !visible.length && (
                <div className="empty">
                  <h3>为这里收藏一点灵感</h3>
                  <p>试试其他关键词，或新增你的第一张姿势卡。</p>
                </div>
              )}
              <footer className="library-footer">
                <span>每张图，都是一次新的观察。</span>
                <button onClick={() => void download()}>下载文字资料 ↓</button>
                <small>示例图片为 AI 生成 · 参考来源见卡片详情</small>
              </footer>
            </section>
          </>
        )}
        {selected.size > 0 && (
          <div className="selection-bar">
            <span>
              已选 <b>{chosen.length}</b> 张
            </span>
            <button onClick={() => setSelected(new Set())}>取消选择</button>
            {owner && (
              <button onClick={() => setAlbumEditor(null)}>加入新卡片册</button>
            )}
            <button className="primary" onClick={() => void beginPrint(chosen)}>
              打印所选 ↗
            </button>
          </div>
        )}
        {busy && <div className="save-indicator">正在保存…</div>}
        {toast && (
          <div className="toast" role="status">
            ✓ {toast}
          </div>
        )}
      </main>
      {editor && (
        <Editor
          card={editor}
          intent={editorIntent}
          categories={state.categories}
          draftKey={
            "pose-draft-" +
            userId +
            "-" +
            (state.cards.some((c) => c.id === editor.id) ? editor.id : "new")
          }
          onClose={() => {
            setEditor(undefined);
            setEditorIntent(undefined);
          }}
          onSave={async (card) => {
            await save({
              ...state,
              cards: state.cards.some((c) => c.id === card.id)
                ? state.cards.map((c) => (c.id === card.id ? card : c))
                : [...state.cards, card],
            });
            setEditor(undefined);
          }}
        />
      )}
      {manage && (
        <CategoryDialog
          state={state}
          onSave={save}
          onClose={() => setManage(false)}
        />
      )}
      {albumEditor !== undefined && (
        <AlbumDialog
          state={state}
          album={albumEditor || undefined}
          selected={chosen.map((c) => c.id)}
          onClose={() => setAlbumEditor(undefined)}
          onSave={async (a) => {
            await save({
              ...state,
              albums: state.albums.some((x) => x.id === a.id)
                ? state.albums.map((x) => (x.id === a.id ? a : x))
                : [...state.albums, a],
            });
          }}
        />
      )}
      {printCards && (
        <PrintView
          appearance={appearance}
          cards={printCards}
          sizes={sizes}
          shareId={shareId}
          onClose={() => setPrintCards(undefined)}
        />
      )}
      {owner && (
        <button
          ref={aiTrigger}
          className="ai-launcher"
          aria-label="AI 推荐"
          aria-expanded={aiOpen}
          onClick={() => setAiOpen((v) => !v)}
        >
          ✧ AI 推荐
        </button>
      )}
      {settingsOpen && owner && (
        <SystemSettings
          store={aiStore}
          showGrid={showGrid}
          onGrid={setShowGrid}
          onChanged={() => setConfigVersion((v) => v + 1)}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {owner && (
        <AiRecommendation
          open={aiOpen}
          configVersion={configVersion}
          onSettings={() => setSettingsOpen(true)}
          state={state}
          userId={userId}
          store={aiStore}
          onSave={save}
          onRead={openDetail}
          onClose={() => {
            setAiOpen(false);
            requestAnimationFrame(() => aiTrigger.current?.focus());
          }}
        />
      )}
      {detail && (
        <Dialog
          title={detail.title}
          wide
          onClose={() => {
            setDetail(undefined);
            setTimeout(() => {
              if (detailReturnFocus.current?.isConnected)
                detailReturnFocus.current.focus();
              detailReturnFocus.current = null;
            }, 0);
          }}
        >
          <div className="detail-content">
            {detail.images.map((p) => (
              <section key={p.id}>
                <Photo image={p} title={detail.title} shareId={shareId} />
                <div>
                  {Object.entries(labels).map(([key, label]) => (
                    <div className="note-section" key={key}>
                      <h4>{label}</h4>
                      <p>
                        {resolveNotes(detail, p)[key as keyof typeof labels] ||
                          "尚未填写"}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            {owner && detail.privateNote && (
              <div className="private-note">私人笔记：{detail.privateNote}</div>
            )}
            {detail.source && (
              <p className="helper">
                灵感来源：
                <a href={detail.source.url} target="_blank" rel="noreferrer">
                  {detail.source.title} ↗
                </a>{" "}
                · {detail.source.author}。图片为AI参考图，并非原视频截图。
              </p>
            )}
          </div>
          {owner && (
            <div className="dialog-footer">
              <span className="helper">可以继续补拍、加图和改文案。</span>
              <button
                className="danger-link"
                onClick={() => {
                  const target = detail;
                  setDetail(undefined);
                  void act(() =>
                    save({
                      ...state,
                      cards: state.cards.map((x) =>
                        x.id === target.id ? { ...x, deleted: true } : x,
                      ),
                    }),
                  );
                }}
              >
                移入回收站
              </button>
              <button
                onClick={() => {
                  const target = detail;
                  setDetail(undefined);
                  setEditorIntent(undefined);
                  setEditor(target);
                }}
              >
                编辑这张卡
              </button>
              <button
                className="primary"
                onClick={() => {
                  const target = detail;
                  setDetail(undefined);
                  setEditor(target);
                  setEditorIntent("photos");
                }}
              >
                ＋ 添加照片
              </button>
            </div>
          )}
        </Dialog>
      )}
      {shareAlbum && (
        <Dialog
          title={isLocalMode ? "预览你的卡片册" : "把灵感分享出去"}
          onClose={() => setShareAlbum(undefined)}
        >
          <div className="dialog-content">
            <h3>{shareAlbum.name}</h3>
            <p>
              {isLocalMode
                ? "本机模式：链接仅在当前浏览器与同一网址下可用，不能发送给其他用户访问。接入云端 API 后才支持真正的公开分享。"
                : "访客可直接浏览，登录后可下载资料与打印。私人笔记不会出现在分享中。"}
            </p>
            <p className="helper">
              公开版本为独立副本。修改原稿后，点击更新公开版本才会同步。
            </p>
            {shareAlbum.shareId && (
              <>
                <label>
                  {isLocalMode ? "本机预览链接" : "公开链接"}
                  <input
                    readOnly
                    value={
                      typeof location !== "undefined"
                        ? location.origin + "/share/" + shareAlbum.shareId
                        : ""
                    }
                  />
                </label>
                <div className="actions">
                  <a
                    className="button"
                    target="_blank"
                    href={"/share/" + shareAlbum.shareId}
                  >
                    打开分享 ↗
                  </a>
                  <button
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(
                          location.origin + "/share/" + shareAlbum.shareId,
                        )
                        .then(
                          () => setToast("链接已复制"),
                          () => setToast("请选中上方链接复制"),
                        )
                    }
                  >
                    复制链接
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="dialog-footer">
            {shareAlbum.shareId && (
              <button
                onClick={() =>
                  void act(async () => {
                    await api("shares/" + shareAlbum.shareId, "DELETE");
                    const a = { ...shareAlbum, shareId: undefined };
                    await save({
                      ...state,
                      albums: state.albums.map((x) => (x.id === a.id ? a : x)),
                    });
                    setShareAlbum(a);
                  })
                }
              >
                {isLocalMode ? "撤销预览" : "取消公开"}
              </button>
            )}
            <button
              className="primary"
              disabled={busy}
              onClick={() => void publish(shareAlbum)}
            >
              {shareAlbum.shareId
                ? isLocalMode
                  ? "更新本机预览"
                  : "更新公开版本"
                : isLocalMode
                  ? "生成本机预览"
                  : "生成公开链接"}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
