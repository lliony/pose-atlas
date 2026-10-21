import { useEffect, useState } from "react";
import Dialog from "./Dialog";

export type ConfirmOptions = {
  title?: string;
  message: string;
  detail?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

type Pending = {
  options: ConfirmOptions;
  resolve: (ok: boolean) => void;
};

let show: ((pending: Pending) => void) | null = null;

/** 用应用内的确认框代替 window.confirm，返回是否确认。 */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!show) {
      // 宿主还没挂载时的兜底：不静默执行危险操作
      resolve(false);
      return;
    }
    show({ options, resolve });
  });
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  useEffect(() => {
    show = setPending;
    return () => {
      show = null;
    };
  }, []);
  if (!pending) return null;
  const settle = (ok: boolean) => {
    pending.resolve(ok);
    setPending(null);
  };
  const { options } = pending;
  return (
    <Dialog title={options.title ?? "请确认"} onClose={() => settle(false)}>
      <div className="dialog-content confirm-body">
        <p>{options.message}</p>
        {options.detail && <p className="helper">{options.detail}</p>}
      </div>
      <div className="dialog-footer">
        <span className="helper" />
        <button onClick={() => settle(false)}>
          {options.cancelText ?? "取消"}
        </button>
        <button
          className={options.danger ? "danger-btn" : "primary"}
          onClick={() => settle(true)}
          autoFocus
        >
          {options.confirmText ?? "确定"}
        </button>
      </div>
    </Dialog>
  );
}
