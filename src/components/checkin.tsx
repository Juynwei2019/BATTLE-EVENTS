"use client";
import { useState, useEffect, useRef } from "react";
import {
  Search,
  ScanLine,
  LockKeyhole,
  Unlock,
  Check,
  Wallet,
} from "lucide-react";
import { useApp } from "./provider";
import {
  WorkspaceGate,
  ScopePicker,
  useScope,
  hasRole,
  Confirm,
} from "./workspace";
import { Badge, Stat, Empty, Modal } from "./ui";
import type { Entry } from "@/lib/types";
import { date } from "@/lib/samples";
function Scanner({
  onScan,
  onClose,
}: {
  onScan: (s: string) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const scanned = useRef(false);
  useEffect(() => {
    let scanner: import("html5-qrcode").Html5Qrcode | undefined;
    let disposed = false;
    import("html5-qrcode").then(async ({ Html5Qrcode }) => {
      if (disposed) return;
      scanner = new Html5Qrcode("qr-reader");
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 8, qrbox: { width: 230, height: 230 } },
          (s) => {
            if (!scanned.current) {
              scanned.current = true;
              onScan(s);
            }
          },
          () => {},
        );
        if (disposed && scanner.isScanning) await scanner.stop();
      } catch {
        if (!disposed)
          setError(
            "無法啟用相機。請確認授權，或關閉視窗後使用舞名、手機、報名編號手動搜尋。",
          );
      }
    });
    return () => {
      disposed = true;
      if (scanner?.isScanning) void scanner.stop().catch(() => {});
    };
  }, [onScan]);
  return (
    <Modal title="掃描報到 QR Code" onClose={onClose}>
      <div id="qr-reader" />
      {error ? (
        <div role="alert" className="error-box">
          {error}
        </div>
      ) : (
        <p className="muted">
          將 QR Code 對準鏡頭。掃描後請核對舞者，再確認報到。
        </p>
      )}
      <button className="button secondary" onClick={onClose}>
        改用手動搜尋
      </button>
    </Modal>
  );
}
export function Checkin() {
  const { work, mutate, loading } = useApp();
  const scope = useScope();
  const [q, setQ] = useState(""),
    [filter, setFilter] = useState("all"),
    [scan, setScan] = useState(false),
    [confirm, setConfirm] = useState<{ action: string; entry?: Entry } | null>(
      null,
    );
  const { event, group } = scope;
  const entries = work?.entries.filter((e) => e.group_id === group?.id) || [];
  const visible = entries.filter(
    (e) =>
      (filter === "all" ||
        (filter === "checked" && e.checked_at) ||
        (filter === "pending" && !e.checked_at)) &&
      (!q ||
        `${e.dancer} ${e.phone} ${e.number} ${e.token}`
          .toLowerCase()
          .includes(q.toLowerCase())),
  );
  const allowed =
    event && group && hasRole(work, event.id, ["admin", "checkin"], group.id);
  const manager = event && hasRole(work, event.id, ["admin"]);
  const run = (action: string, entry?: Entry) => {
    if (!event || !group) return;
    return mutate(action, {
      event_id: event.id,
      group_id: group.id,
      entry_id: entry?.id,
      version: entry?.version,
      paid: !entry?.paid,
    });
  };
  return (
    <WorkspaceGate
      title="現場報到"
      description="每一個名字，都是今天舞台上的主角。"
    >
      <div className="page-heading">
        <div>
          <p className="eyebrow">CHECK IN / GET READY</p>
          <h1>現場報到</h1>
          <p className="subtitle">核對、繳費、報到。讓現場有條不紊。</p>
        </div>
        <button
          className="button primary"
          disabled={!allowed}
          onClick={() => setScan(true)}
        >
          <ScanLine size={18} />
          掃描 QR Code
        </button>
      </div>
      <ScopePicker scope={scope} />
      {!event || !group ? (
        <Empty
          title="尚無可操作的活動"
          description="請先接受邀請，或由後臺建立活動。"
        />
      ) : !allowed ? (
        <Empty
          title="你沒有本組報到權限"
          description="請選擇已授權組別，或聯絡活動主辦。"
        />
      ) : (
        <>
          <div className="stats-grid">
            <Stat label="總報名" value={entries.length} />
            <Stat
              label="已報到"
              value={entries.filter((e) => e.checked_at).length}
            />
            <Stat
              label="未報到"
              value={entries.filter((e) => !e.checked_at).length}
            />
            <Stat label="已繳費" value={entries.filter((e) => e.paid).length} />
            <Stat
              label="未繳費"
              value={entries.filter((e) => !e.paid).length}
            />
          </div>
          {group.closed_at ? (
            <div className="phase-banner">
              <LockKeyhole size={20} />
              <div>
                <strong>本組報到已結束</strong>
                <p>{date(group.closed_at, true)} · 繳費狀態仍可獨立操作</p>
              </div>
              {manager ? (
                <button
                  className="button secondary"
                  onClick={() => setConfirm({ action: "reopen_checkin" })}
                >
                  <Unlock size={16} />
                  重新開放報到
                </button>
              ) : null}
            </div>
          ) : (
            <div className="phase-banner">
              <span className="status-dot" />
              <div>
                <strong>報到開放中</strong>
                <p>下一步：完成舞者核對後，由主辦結束本組報到。</p>
              </div>
              {manager ? (
                <button
                  className="button secondary"
                  onClick={() => setConfirm({ action: "close_checkin" })}
                >
                  <LockKeyhole size={16} />
                  結束報到
                </button>
              ) : null}
            </div>
          )}
          <section className="panel">
            <div className="table-toolbar">
              <label className="search">
                <Search size={18} />
                <input
                  aria-label="搜尋報名資料"
                  placeholder="舞名、手機、報名編號或 QR 代碼"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>
              <div className="tabs">
                {[
                  ["all", "全部"],
                  ["checked", "已報到"],
                  ["pending", "未報到"],
                ].map(([v, l]) => (
                  <button
                    key={v}
                    className={filter === v ? "selected" : ""}
                    onClick={() => setFilter(v)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>編號 / 舞名</th>
                    <th>手機</th>
                    <th>繳費</th>
                    <th>報到狀態</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <span className="mono muted">#{e.number}</span>
                        <strong>{e.dancer}</strong>
                      </td>
                      <td>{e.phone}</td>
                      <td>
                        <button
                          className="status-toggle"
                          disabled={loading}
                          onClick={() => run("payment", e)}
                        >
                          <Wallet size={15} />
                          <Badge tone={e.paid ? "green" : "neutral"}>
                            {e.paid ? "已繳費" : "未繳費"}
                          </Badge>
                        </button>
                      </td>
                      <td>
                        <Badge tone={e.checked_at ? "green" : "neutral"}>
                          {e.checked_at ? "已報到" : "未報到"}
                        </Badge>
                        {e.checked_at ? (
                          <small className="block muted">
                            {date(e.checked_at, true)}
                          </small>
                        ) : null}
                      </td>
                      <td>
                        {e.checked_at ? (
                          <button
                            disabled={loading || !!group.closed_at}
                            className="text-button"
                            onClick={() =>
                              setConfirm({ action: "cancel_checkin", entry: e })
                            }
                          >
                            取消報到
                          </button>
                        ) : (
                          <button
                            disabled={loading || !!group.closed_at}
                            className="button compact primary"
                            onClick={() => run("checkin", e)}
                          >
                            <Check size={15} />
                            確認報到
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!visible.length ? (
              <Empty
                title="沒有符合的報名資料"
                description="請確認組別，或改用其他搜尋條件。"
              />
            ) : null}
          </section>
        </>
      )}
      {scan ? (
        <Scanner
          onScan={(s) => {
            setQ(s);
            setScan(false);
          }}
          onClose={() => setScan(false)}
        />
      ) : null}
      {confirm && event && group ? (
        <Confirm
          title={
            confirm.action === "close_checkin"
              ? "結束本組報到"
              : confirm.action === "reopen_checkin"
                ? "重新開放報到"
                : "取消舞者報到"
          }
          needsReason={confirm.action !== "close_checkin"}
          description={`${event.title} / ${group.name}。已報到 ${entries.filter((e) => e.checked_at).length} 人，未報到 ${entries.filter((e) => !e.checked_at).length} 人。${confirm.action === "close_checkin" ? "確認後凍結本組新增及取消報到，繳費與其他組別不受影響。" : confirm.action === "reopen_checkin" ? "已有評分、晉級鎖定或賽程時不可重開。" : `確認取消 ${confirm.entry?.dancer} 的報到狀態？`}`}
          onClose={() => setConfirm(null)}
          onConfirm={async (reason) =>
            !!(await mutate(confirm.action, {
              event_id: event.id,
              group_id: group.id,
              entry_id: confirm.entry?.id,
              version: confirm.entry?.version ?? group.version,
              reason,
            }))
          }
        />
      ) : null}
    </WorkspaceGate>
  );
}
