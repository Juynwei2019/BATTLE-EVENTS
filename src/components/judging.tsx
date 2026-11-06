"use client";
import { useEffect, useState } from "react";
import {
  Check,
  Save,
  Plus,
  Minus,
  ChevronRight,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { useApp } from "./provider";
import { WorkspaceGate, ScopePicker, useScope, Confirm } from "./workspace";
import { Badge, Empty, Field, Busy } from "./ui";
import { scoreValue } from "@/lib/validation";
import type { ScoreDraft as Draft } from "./provider";
export function Judging() {
  const {
    work,
    mutate,
    loading,
    setNotice,
    scoreDrafts: drafts,
    setScoreDrafts: setDrafts,
    clearScoreDrafts,
  } = useApp();
  const scope = useScope();
  const { event, group } = scope;
  const [selected, setSelected] = useState(""),
    [filter, setFilter] = useState("pending"),
    [discard, setDiscard] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const entries =
    work?.entries.filter((e) => e.group_id === group?.id && e.checked_at) || [];
  const scores = work?.scores.filter((s) => s.judge_id === work.user_id) || [];
  const completed = entries.filter((e) =>
    scores.some((s) => s.entry_id === e.id),
  );
  const visible = entries.filter(
    (e) =>
      filter === "all" ||
      (filter === "pending" &&
        (!scores.some((s) => s.entry_id === e.id) || Boolean(drafts[e.id]))) ||
      (filter === "done" && scores.some((s) => s.entry_id === e.id)),
  );
  const dancer = visible.find((e) => e.id === selected) || visible[0];
  const saved = scores.find((s) => s.entry_id === dancer?.id);
  const draft = dancer ? drafts[dancer.id] : undefined;
  const value = draft || {
    score: saved?.score.toString() || "",
    comment: saved?.comment || "",
    reason: "",
    version: saved?.version || 0,
  };
  const assigned = work?.memberships.some(
    (m) =>
      m.event_id === event?.id &&
      m.user_id === work.user_id &&
      m.role === "judge" &&
      m.group_ids.includes(group?.id || "") &&
      !m.revoked_at &&
      Date.parse(m.starts_at) <= Date.now() &&
      Date.parse(m.ends_at) > Date.now(),
  );
  const matches = work?.matches.filter((m) => m.group_id === group?.id) || [];
  const current = matches.find((m) => m.id === group?.current_match);
  const vote = work?.votes.find(
    (v) => v.match_id === current?.id && v.judge_id === work.user_id,
  );
  const update = (key: keyof Draft, v: string) => {
    if (dancer)
      setDrafts((prev) => ({ ...prev, [dancer.id]: { ...value, [key]: v } }));
  };
  useEffect(() => {
    const navigate = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest("a");
      if (
        Object.keys(drafts).length &&
        link &&
        link.origin === location.origin &&
        link.pathname !== location.pathname
      ) {
        e.preventDefault();
        e.stopPropagation();
        setLeaveTo(link.href);
      }
    };
    document.addEventListener("click", navigate, true);
    return () => {
      document.removeEventListener("click", navigate, true);
    };
  }, [drafts]);
  return (
    <WorkspaceGate
      title="評審工作台"
      description="專注舞蹈，讓每個分數都有依據。"
    >
      {leaveTo ? (
        <Confirm
          title="離開前確認草稿"
          description="此頁仍有未送出的評分草稿。離開會捨棄草稿，雲端分數不受影響。"
          onClose={() => setLeaveTo(null)}
          onConfirm={async () => {
            clearScoreDrafts();
            window.location.assign(leaveTo);
            return true;
          }}
        />
      ) : null}
      <div className="page-heading">
        <div>
          <p className="eyebrow">JUDGES / MAKE YOUR CALL</p>
          <h1>評審工作台</h1>
          <p className="subtitle">你的觀點，是舞者向前的力量。</p>
        </div>
        <Badge tone="orange">僅顯示本人的分數與評語</Badge>
      </div>
      <ScopePicker scope={scope} />
      {!event || !group ? (
        <Empty title="尚未被指派活動" description="請至登入頁接受評審邀請。" />
      ) : !assigned ? (
        <Empty
          title="你不是本組指定評審"
          description="擁有者或主辦身分不會自動取得評分資格，請先接受本組評審邀請。"
        />
      ) : group.locked_at ? (
        <>
          <div className="phase-banner">
            <CheckCircle2 size={21} />
            <div>
              <strong>海選已鎖定 · Battle 投票</strong>
              <p>僅開放目前場次，可在主辦確認勝方前修改自己的票。</p>
            </div>
          </div>
          {current ? (
            <section className="panel vote-panel">
              <Badge tone="orange">
                ROUND {current.round} · MATCH {current.position}
              </Badge>
              <h2>現在，做出你的選擇。</h2>
              <div className="vote-pair">
                {[current.a, current.b].map((id, i) => (
                  <button
                    key={id}
                    disabled={loading || !!current.winner}
                    className={`vote-choice ${vote?.entry_id === id ? "chosen" : ""}`}
                    onClick={() =>
                      mutate("vote", {
                        event_id: event.id,
                        group_id: group.id,
                        match_id: current.id,
                        entry_id: id,
                        version: vote?.version || 0,
                      })
                    }
                  >
                    <span>{i === 0 ? "A SIDE" : "B SIDE"}</span>
                    <strong>
                      {entries.find((e) => e.id === id)?.dancer || "舞者"}
                    </strong>
                    <small>
                      {vote?.entry_id === id ? (
                        <>
                          <Check size={17} />
                          我的票 · 已儲存
                        </>
                      ) : (
                        "點擊投票"
                      )}
                    </small>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <Empty
              title="目前沒有開放投票的場次"
              description="請等待主辦設定場次，或所有賽程已完成。"
            />
          )}
        </>
      ) : (
        <>
          <div className="progress-panel">
            <div>
              <strong>
                {completed.length === entries.length && entries.length
                  ? "本組評分已完成"
                  : "海選評分進度"}
              </strong>
              <span>
                {completed.length} / {entries.length} 位舞者
              </span>
            </div>
            <progress
              max={Math.max(entries.length, 1)}
              value={completed.length}
            />
          </div>
          <div className="judging-layout">
            <section className="panel dancer-list">
              <div className="panel-heading">
                <h2>舞者名單</h2>
                <span className="muted small">已報到 {entries.length} 人</span>
              </div>
              <div className="tabs">
                {[
                  ["pending", "待評"],
                  ["done", "已評"],
                  ["all", "全部"],
                ].map(([f, l]) => (
                  <button
                    key={f}
                    className={filter === f ? "selected" : ""}
                    onClick={() => setFilter(f)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div className="dancer-scroll">
                {visible.map((e, i) => (
                  <button
                    key={e.id}
                    className={`dancer-row ${dancer?.id === e.id ? "selected" : ""}`}
                    onClick={() => setSelected(e.id)}
                  >
                    <span className="dancer-index">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>
                      <strong>{e.dancer}</strong>
                      <small>
                        #{e.number}
                        {drafts[e.id] ? " · 有未儲存草稿" : ""}
                      </small>
                    </span>
                    {scores.some((s) => s.entry_id === e.id) ? (
                      <CheckCircle2 size={18} className="green-text" />
                    ) : (
                      <ChevronRight size={18} />
                    )}
                  </button>
                ))}
              </div>
              {!visible.length ? (
                <Empty
                  title={
                    filter === "pending" ? "所有舞者都已評分" : "目前沒有舞者"
                  }
                >
                  <button
                    className="button secondary"
                    onClick={() => setFilter("done")}
                  >
                    回看已評名單
                  </button>
                </Empty>
              ) : null}
            </section>
            <section className="panel score-card">
              {dancer ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    let score;
                    try {
                      score = scoreValue(value.score);
                    } catch (err) {
                      setNotice((err as Error).message);
                      return;
                    }
                    const result = await mutate("score", {
                      event_id: event.id,
                      group_id: group.id,
                      entry_id: dancer.id,
                      score,
                      comment: value.comment,
                      reason: value.reason,
                      version: value.version,
                    });
                    if (result) {
                      setDrafts((prev) => {
                        const next = { ...prev };
                        delete next[dancer.id];
                        return next;
                      });
                      const next = entries.find(
                        (e) =>
                          e.id !== dancer.id &&
                          !scores.some((s) => s.entry_id === e.id),
                      );
                      setSelected(next?.id || "");
                      if (!next) setFilter("done");
                    }
                  }}
                >
                  <div className="panel-heading">
                    <span className="eyebrow">NOW SCORING</span>
                    <Badge
                      tone={draft ? "orange" : saved ? "green" : "neutral"}
                    >
                      {draft
                        ? "草稿 · 尚未送出"
                        : saved
                          ? "雲端已儲存"
                          : "待評分"}
                    </Badge>
                  </div>
                  <h2 className="dancer-name">{dancer.dancer}</h2>
                  <p className="muted">報名編號 #{dancer.number}</p>
                  {draft && draft.version !== (saved?.version || 0) ? (
                    <div className="error-box" role="alert">
                      <strong>其他裝置已更新此分數</strong>
                      <p>
                        雲端分數：{saved?.score ?? "尚未評分"}
                        。你的草稿仍保留，請先核對再繼續。
                      </p>
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() =>
                          setDrafts((prev) => ({
                            ...prev,
                            [dancer.id]: {
                              ...draft,
                              version: saved?.version || 0,
                              reason: "",
                            },
                          }))
                        }
                      >
                        核對後沿用草稿輸入
                      </button>
                    </div>
                  ) : null}
                  <Field label="海選分數 / 100">
                    <div className="score-control">
                      <button
                        type="button"
                        aria-label="減一分"
                        className="icon-button"
                        onClick={() =>
                          update(
                            "score",
                            String(
                              Math.max(
                                0,
                                Math.round(
                                  (Number(value.score || 0) - 1) * 100,
                                ) / 100,
                              ),
                            ),
                          )
                        }
                      >
                        <Minus />
                      </button>
                      <input
                        required
                        inputMode="decimal"
                        aria-label="海選分數"
                        placeholder="0.00"
                        value={value.score}
                        onChange={(e) => update("score", e.target.value)}
                      />
                      <button
                        type="button"
                        aria-label="加一分"
                        className="icon-button"
                        onClick={() =>
                          update(
                            "score",
                            String(
                              Math.min(
                                100,
                                Math.round(
                                  (Number(value.score || 0) + 1) * 100,
                                ) / 100,
                              ),
                            ),
                          )
                        }
                      >
                        <Plus />
                      </button>
                    </div>
                  </Field>
                  <Field label="評語（選填，僅本人與主辦可見）">
                    <textarea
                      maxLength={1000}
                      rows={3}
                      placeholder="記下這次演出的亮點…"
                      value={value.comment}
                      onChange={(e) => update("comment", e.target.value)}
                    />
                  </Field>
                  {value.version > 0 ? (
                    <Field label="修改原因（必填）">
                      <textarea
                        maxLength={1000}
                        required
                        value={value.reason}
                        placeholder="如為截止線加賽，請記錄加賽結果"
                        onChange={(e) => update("reason", e.target.value)}
                      />
                    </Field>
                  ) : null}
                  <div className="score-actions">
                    <button
                      className="button secondary"
                      type="button"
                      disabled={!draft || loading}
                      onClick={() => setDiscard(true)}
                    >
                      <RotateCcw size={16} />
                      捨棄草稿
                    </button>
                    <button
                      className="button primary"
                      disabled={
                        loading ||
                        !value.score ||
                        (value.version > 0 && !value.reason.trim())
                      }
                    >
                      {loading ? (
                        <Busy />
                      ) : (
                        <>
                          <Save size={17} />
                          儲存並評下一位
                        </>
                      )}
                    </button>
                  </div>
                  <p className="muted small">
                    {saved
                      ? `雲端分數 ${saved.score} · 版本 ${saved.version}`
                      : "尚無雲端分數"}
                    。草稿保留於本頁，重新同步不會覆蓋草稿。
                  </p>
                </form>
              ) : (
                <Empty
                  title="準備好，迎接下一位舞者"
                  description="選擇名單中的舞者開始評分。"
                />
              )}
            </section>
          </div>
        </>
      )}
      {discard && dancer ? (
        <Confirm
          title="捨棄未送出的草稿"
          description={`將捨棄 ${dancer.dancer} 的草稿，雲端已儲存資料不受影響。`}
          onClose={() => setDiscard(false)}
          onConfirm={async () => {
            setDrafts((prev) => {
              const next = { ...prev };
              delete next[dancer.id];
              return next;
            });
            return true;
          }}
        />
      ) : null}
    </WorkspaceGate>
  );
}
