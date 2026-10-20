/** IndexedDB is the demo adapter only. API mode never reads this database. */
let connection: Promise<IDBDatabase> | undefined;
export function database(): Promise<IDBDatabase> {
  return (connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("pose-atlas-react-v1", 1);
    request.onupgradeneeded = () => {
      for (const name of ["workspace", "images", "shares"])
        request.result.createObjectStore(name);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      connection = undefined;
      reject(new Error("无法打开本机资料库，请检查浏览器存储权限"));
    };
    request.onblocked = () => {
      connection = undefined;
      reject(new Error("资料库正在升级，请关闭其他图鉴页面后重试"));
    };
  }));
}
export async function read<T>(
  store: string,
  key: string,
): Promise<T | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const r = db.transaction(store).objectStore(store).get(key);
    r.onsuccess = () => resolve(r.result as T | undefined);
    r.onerror = () => reject(r.error);
  });
}
export async function write(
  store: string,
  key: string,
  value: unknown,
): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, "readwrite");
    t.objectStore(store).put(value, key);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(new Error("保存失败：浏览器存储可能已满"));
    t.onabort = () => reject(new Error("保存已中断，请重试"));
  });
}
