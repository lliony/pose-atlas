export type DraftStorage = Pick<Storage, "setItem">;

/**
 * 只有确有改动时（dirty=true）才把编辑器草稿写进本机存储。
 * 这样「打开已有卡片、零改动直接关闭」不会留下一份草稿，下次打开也不会误报「可恢复未保存修改」。
 * 写失败静默降级（草稿是尽力而为，存不下不该中断编辑）。
 *
 * @returns 是否真的写入了。
 */
export function persistDraft(
  storage: DraftStorage,
  draftKey: string,
  value: unknown,
  dirty: boolean,
): boolean {
  if (!dirty) return false;
  try {
    storage.setItem(draftKey, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}