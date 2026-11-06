"use client";
import {
  useEffect,
  useRef,
  useId,
  isValidElement,
  cloneElement,
  type ReactNode,
  type ReactElement,
} from "react";
import { X, LoaderCircle } from "lucide-react";
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="modal"
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" aria-label="關閉視窗" onClick={onClose}>
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "orange" | "green" | "neutral";
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Empty({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-mark">BE.</div>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {children}
    </div>
  );
}
export function Busy() {
  return (
    <span className="busy">
      <LoaderCircle size={17} /> 處理中…
    </span>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  const directInput =
    isValidElement(children) &&
    typeof children.type === "string" &&
    ["input", "select", "textarea"].includes(children.type);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {directInput
        ? cloneElement(children as ReactElement<{ id?: string }>, { id })
        : children}
    </div>
  );
}
export function Stat({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
