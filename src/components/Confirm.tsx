import { useEffect, useState } from "react";
import Dialog from "./Dialog";

export type ConfirmOptions = {
  title?: string;
  message: string;
  detail?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  /** 可选的附加勾选项，例如「同时删除册内卡片」 */
  checkbox?: { label: string; defaultChecked?: boolean };
};

export type ConfirmResult = { ok: boolean; checked: boolean };

type Pending = {
  options: ConfirmOptions;
  resolve: (result: ConfirmResult) => void;
};

let show: ((pending: Pending) => void) | null = null;

/** 用应用内的确认框代替 window.confirm，返回是否确认。 */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return confirmChoice(options).then((result) => result.ok);
}

/** 带可选勾选项的确认框；没有勾选项时 checked 恒为 false。 */
export function confirmChoice(options: ConfirmOptions): Promise<ConfirmResult> {
  return new Promise((resolve) => {
    if (!show) {
      // 宿主还没挂载时的兜底：不静默执行危险操作
      resolve({ ok: false, checked: false });
      return;
    }
    show({ options, resolve });
  });
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    show = setPending;
    return () => {
      show = null;
    };
  }, []);
  useEffect(() => {
    setChecked(pending?.options.checkbox?.defaultChecked ?? false);
  }, [pending]);
  if (!pending) return null;
  const settle = (ok: boolean) => {
    pending.resolve({ ok, checked: ok && checked });
    setPending(null);
  };
  const { options } = pending;
  return (
    <Dialog title={options.title ?? "请确认"} onClose={() => settle(false)}>
      <div className="dialog-content confirm-body">
        <p>{options.message}</p>
        {options.detail && <p className="helper">{options.detail}</p>}
        {options.checkbox && (
          <label className="confirm-check">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            {options.checkbox.label}
          </label>
        )}
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
