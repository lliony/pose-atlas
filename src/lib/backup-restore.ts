import type { State } from "./types.ts";
import type { BackupFile } from "./backup.ts";
import { mergeStates } from "./backup.ts";
import { stateSources } from "./image-refs.ts";

/**
 * 恢复备份时要用到的持久化端口。把「读当前工作区 / 落图 / 删图 / 提交状态」抽出来，
 * 让恢复算法可以在不依赖 IndexedDB 的前提下被纯单元测试覆盖。
 */
export type RestorePort = {
  readWorkspace(): Promise<{ revision: number; state: State }>;
  listImageKeys(): Promise<string[]>;
  writeImage(src: string, dataUrl: string): Promise<void>;
  removeImage(src: string): Promise<void>;
  commitWorkspace(state: State, revision: number): Promise<void>;
};

/**
 * 恢复备份。顺序对正确性很关键：
 * 1. 先把备份里的图片全部落盘（幂等的 put，不会破坏任何已有数据）；
 * 2. 再提交工作区（revision 校验的提交点——《仅当》提交成功才算恢复完成）；
 * 3. 只有提交成功之后，才删除新的工作区不再引用的图片（replace 模式）。
 *
 * 这样即使第 2 步失败（版本冲突、存储配额），已有的图片库也完好无损，
 * 不会再有「先清空图片库、再提交失败」导致的数据丢失窗口。
 */
export async function restoreFromBackup(
  backup: BackupFile,
  mode: "merge" | "replace",
  port: RestorePort,
): Promise<void> {
  const current = await port.readWorkspace();
  const nextState =
    mode === "merge" ? mergeStates(current.state, backup.state) : backup.state;

  for (const [src, dataUrl] of Object.entries(backup.images)) {
    await port.writeImage(src, dataUrl);
  }

  await port.commitWorkspace(nextState, current.revision);

  if (mode === "replace") {
    const needed = stateSources(nextState);
    for (const src of await port.listImageKeys()) {
      if (!needed.has(src)) await port.removeImage(src);
    }
  }
}