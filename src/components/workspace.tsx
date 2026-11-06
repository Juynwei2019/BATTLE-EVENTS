"use client";
import { useState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { ShieldCheck, ArrowUpRight } from "lucide-react";
import { useApp } from "./provider";
import { Empty, Busy, Modal, Field, Badge } from "./ui";
import type { Workspace } from "@/lib/types";
export function useScope() {
  const { work, user } = useApp();
  const [eventId, updateEvent] = useState(""),
    [groupId, updateGroup] = useState("");
  const storageKey = "battle-scope-" + (user?.id || "guest");
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || "{}");
      updateEvent(saved.eventId || "");
      updateGroup(saved.groupId || "");
    } catch {
      /* Storage is optional. */
    }
  }, [storageKey]);
  const event = work?.events.find((e) => e.id === eventId) || work?.events[0];
  const groups = work?.groups.filter((g) => g.event_id === event?.id) || [];
  const group = groups.find((g) => g.id === groupId) || groups[0];
  const setEventId = (id: string) => {
    updateEvent(id);
    updateGroup("");
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ eventId: id, groupId: "" }),
      );
    } catch {}
  };
  const setGroupId = (id: string) => {
    updateGroup(id);
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ eventId: event?.id || eventId, groupId: id }),
      );
    } catch {}
  };
  return { event, groups, group, eventId, setEventId, setGroupId };
}
export function WorkspaceGate({
  children,
  title,
  description,
}: {
  children: ReactNode;
  title: string;
  description: string;
}) {
  const { ready, user, work, loading } = useApp();
  if (!ready || (loading && !work)) return <Busy />;
  if (!user)
    return (
      <>
        <div className="page-heading">
          <div>
            <p className="eyebrow">BATTLE EVENTS WORKSPACE</p>
            <h1>{title}</h1>
            <p className="subtitle">{description}</p>
          </div>
        </div>
        <Empty
          title="登入，開啟你的工作台"
          description="工作台依活動與組別授權。請使用被邀請的 Email 登入。"
        >
          <Link className="button primary" href="/login">
            <ShieldCheck size={18} />
            登入工作台 <ArrowUpRight size={17} />
          </Link>
        </Empty>
      </>
    );
  return <>{children}</>;
}
export function ScopePicker({ scope }: { scope: ReturnType<typeof useScope> }) {
  const { work } = useApp();
  return (
    <div className="scope-bar">
      <Field label="當前活動">
        <select
          value={scope.event?.id || ""}
          onChange={(e) => {
            scope.setEventId(e.target.value);
          }}
        >
          <option value="" disabled>
            選擇活動
          </option>
          {work?.events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
      </Field>
      <Field label="當前組別">
        <select
          value={scope.group?.id || ""}
          onChange={(e) => scope.setGroupId(e.target.value)}
        >
          <option value="" disabled>
            選擇組別
          </option>
          {scope.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="scope-status">
        <span>目前階段</span>
        <Badge tone={scope.group?.locked_at ? "orange" : "neutral"}>
          {scope.group?.locked_at
            ? "Battle 賽程"
            : scope.group?.closed_at
              ? "海選評分"
              : "報到進行中"}
        </Badge>
      </div>
    </div>
  );
}
export function hasRole(
  work: Workspace | null,
  eventId: string,
  roles: string[],
  groupId?: string,
) {
  if (!work) return false;
  return (
    work.events.some((e) => e.id === eventId && e.owner_id === work.user_id) ||
    work.memberships.some(
      (m) =>
        m.event_id === eventId &&
        m.user_id === work.user_id &&
        roles.includes(m.role) &&
        !m.revoked_at &&
        Date.parse(m.starts_at) <= Date.now() &&
        Date.parse(m.ends_at) >= Date.now() &&
        (!groupId || m.role === "admin" || m.group_ids.includes(groupId)),
    )
  );
}
export function Confirm({
  title,
  description,
  needsReason = false,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  needsReason?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<boolean>;
}) {
  const [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  const { notice, setNotice } = useApp();
  useEffect(() => {
    setNotice("");
  }, []);
  return (
    <Modal title={title} onClose={() => !busy && onClose()}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            if (await onConfirm(reason)) onClose();
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="confirm-description">{description}</p>
        {needsReason ? (
          <Field label="操作原因（必填）">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              maxLength={1000}
              autoFocus
            />
          </Field>
        ) : null}
        {notice ? (
          <div role="alert" className="error-box">
            {notice}
          </div>
        ) : null}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={busy}
          >
            取消
          </button>
          <button
            className="button primary"
            disabled={busy || (needsReason && !reason.trim())}
          >
            {busy ? <Busy /> : "確認操作"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
