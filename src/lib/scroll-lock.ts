/**
 * 弹窗滚动锁：用计数管理，避免嵌套弹窗（编辑器 → 确认框）以不同顺序卸载时
 * 把 body 的 overflow 永久留在 hidden。
 */
let locks = 0;
let previous = "";

export function lockScroll(): void {
  if (typeof document === "undefined") return;
  if (locks === 0) {
    previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  locks += 1;
}

export function unlockScroll(): void {
  if (typeof document === "undefined") return;
  if (locks === 0) return;
  locks -= 1;
  if (locks === 0) document.body.style.overflow = previous;
}

/** 仅供测试使用：读当前锁定层数。 */
export function scrollLockCount(): number {
  return locks;
}
