import { useEffect, useRef } from "react";
export default function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "dialog wide" : "dialog"}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-head">
        <div>
          <span className="eyebrow">POSE ATLAS / STUDIO</span>
          <h2>{title}</h2>
        </div>
        <button className="icon-btn" aria-label="关闭" onClick={onClose}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
