"use client";
import { useState, useEffect } from "react";
import {
  Plus,
  ArrowUpRight,
  Users,
  Download,
  Upload,
  FlaskConical,
  Lock,
  Radio,
  Pause,
  Settings2,
  Trophy,
  Mail,
  Copy,
  CheckCircle2,
} from "lucide-react";
import { useApp } from "./provider";
import {
  WorkspaceGate,
  ScopePicker,
  useScope,
  hasRole,
  Confirm,
} from "./workspace";
import { Badge, Stat, Empty, Modal, Field, Busy } from "./ui";
import { api } from "@/lib/supabase";
import { checksum, validateBackup } from "@/lib/backup";
import { date } from "@/lib/samples";
type ConfirmState = {
  action: string;
  title: string;
  description: string;
  reason?: boolean;
  p?: Record<string, unknown>;
};
const roleLabel = (role: string) =>
  ({ admin: "主辦管理員", judge: "評審", checkin: "報到人員" })[role] || role;
export function Admin() {
  const { work, user, mutate, loading, refresh, setNotice } = useApp();
  const scope = useScope();
  const { event, group } = scope;
  const [tab, setTab] = useState("overview"),
    [form, setForm] = useState<string | null>(null),
    [confirm, setConfirm] = useState<ConfirmState | null>(null),
    [backup, setBackup] = useState<Record<string, any> | null>(null),
    [sampleBusy, setSampleBusy] = useState(false);
  const manager = event && hasRole(work, event.id, ["admin"]);
  const owner = event?.owner_id === work?.user_id;
  const entries = work?.entries.filter((e) => e.group_id === group?.id) || [];
  const matches = work?.matches.filter((m) => m.group_id === group?.id) || [];
  const judges =
    work?.memberships.filter(
      (m) =>
        m.event_id === event?.id &&
        m.role === "judge" &&
        m.group_ids.includes(group?.id || "") &&
        !m.revoked_at &&
        Date.parse(m.starts_at) <= Date.now() &&
        Date.parse(m.ends_at) > Date.now(),
    ) || [];
  const name = (id: string) =>
    entries.find((e) => e.id === id)?.dancer || "舞者";
  const base = {
    event_id: event?.id,
    group_id: group?.id,
    version: group?.version,
  };
  const show = (
    action: string,
    title: string,
    description: string,
    p?: Record<string, unknown>,
    reason = false,
  ) => setConfirm({ action, title, description, p, reason });
  async function exportBackup() {
    const b = await mutate("backup", { event_id: event?.id });
    if (!b) return;
    const envelope = {
      format: "battle-events/1",
      checksum: await checksum(b),
      data: b,
    };
    const blob = new Blob([JSON.stringify(envelope, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `battle-events-${event?.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice("備份已匯出，包含個資，請妥善保管。");
  }
  return (
    <WorkspaceGate
      title="後臺管理"
      description="從第一個報名，到最後一個冠軍。"
    >
      <div className="page-heading">
        <div>
          <p className="eyebrow">BACKSTAGE / RUN THE SHOW</p>
          <h1>後臺管理</h1>
          <p className="subtitle">掌握每個環節，把舞台留給精彩。</p>
        </div>
        <button
          className="button primary"
          onClick={() => setForm("create_event")}
        >
          <Plus size={18} />
          建立活動
        </button>
      </div>
      <ScopePicker scope={scope} />
      <div className="admin-tabs tabs">
        {[
          ["overview", "活動總覽"],
          ["settings", "活動設定"],
          ["team", "團隊與權限"],
          ["battle", "賽程與公布"],
          ["backup", "備份與紀錄"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={tab === id ? "selected" : ""}
          >
            {label}
          </button>
        ))}
      </div>
      {!event ? (
        <Empty
          title="你的下一場精彩，從這裡開始"
          description="建立活動及組別，或產生可重複使用的合成演練情境。"
        >
          <button
            className="button primary"
            onClick={() => setForm("create_event")}
          >
            <Plus size={17} />
            建立第一場活動
          </button>
        </Empty>
      ) : !manager ? (
        <Empty
          title="這是受保護的主辦工作台"
          description="你目前未獲此活動的管理權限，請使用已授權的報到或評審入口。"
        />
      ) : (
        <>
          {tab === "overview" ? (
            <>
              <div className="stats-grid">
                <Stat label="本組報名" value={entries.length} />
                <Stat
                  label="已繳費"
                  value={entries.filter((e) => e.paid).length}
                />
                <Stat
                  label="已報到"
                  value={entries.filter((e) => e.checked_at).length}
                />
                <Stat label="有效評審" value={judges.length} />
                <Stat
                  label="已評筆數"
                  value={
                    work?.scores.filter(
                      (s) =>
                        entries.some((e) => e.id === s.entry_id) &&
                        judges.some((j) => j.user_id === s.judge_id),
                    ).length || 0
                  }
                />
              </div>
              <div className="admin-overview">
                <section className="panel">
                  <div className="panel-heading">
                    <h2>{event.title}</h2>
                    <Badge tone={event.registration_open ? "green" : "neutral"}>
                      {event.registration_open ? "開放報名" : "報名關閉"}
                    </Badge>
                  </div>
                  <p>
                    {event.city} · {event.venue} · {date(event.starts_at, true)}
                  </p>
                  <div className="timeline">
                    {[
                      "建立活動與組別",
                      "開放報名、分組報到",
                      "結束本組報到",
                      "海選評分與核對",
                      "鎖定晉級、Battle 與公布",
                    ].map((s, i) => (
                      <div key={s}>
                        <span>{String(i + 1).padStart(2, "0")}</span>
                        <strong>{s}</strong>
                        {i === 0 ||
                        (i === 1 && event.registration_open) ||
                        (i === 2 && group?.closed_at) ||
                        (i === 4 && group?.locked_at) ? (
                          <CheckCircle2 size={18} className="green-text" />
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <a className="button secondary" href="/checkin">
                    進入現場報到 <ArrowUpRight size={17} />
                  </a>
                </section>
                <section className="panel">
                  <h2>評審完成進度</h2>
                  {judges.map((j) => {
                    const n =
                      work?.scores.filter(
                        (s) =>
                          s.judge_id === j.user_id &&
                          entries.some((e) => e.id === s.entry_id),
                      ).length || 0;
                    return (
                      <div key={j.id} className="judge-progress">
                        <span>評審 {j.user_id.slice(0, 8)}</span>
                        <strong>
                          {n} / {entries.filter((e) => e.checked_at).length}
                        </strong>
                        <progress
                          value={n}
                          max={Math.max(
                            entries.filter((e) => e.checked_at).length,
                            1,
                          )}
                        />
                      </div>
                    );
                  })}
                  {!judges.length ? (
                    <p className="muted">
                      尚無有效評審。請先發送邀請，並由評審接受。
                    </p>
                  ) : null}
                  <button
                    className="button secondary"
                    onClick={() => setTab("team")}
                  >
                    <Users size={17} />
                    管理團隊
                  </button>
                </section>
              </div>
            </>
          ) : null}
          {tab === "settings" ? (
            <>
              <section className="panel">
                <div className="panel-heading">
                  <h2>活動設定</h2>
                  <button
                    className="button secondary"
                    onClick={() => setForm("edit_event")}
                  >
                    <Settings2 size={16} />
                    編輯活動
                  </button>
                </div>
                <p>{event.title}</p>
                <p className="muted">報名截止 {date(event.deadline, true)}</p>
                <button
                  className="button primary"
                  disabled={loading}
                  onClick={() =>
                    show(
                      "edit_event",
                      event.registration_open ? "關閉活動報名" : "開放活動報名",
                      `將${event.registration_open ? "關閉" : "開放"}本活動報名，所有組別仍依各自開關及截止時間判定。`,
                      {
                        event_id: event.id,
                        version: event.version,
                        registration_open: !event.registration_open,
                      },
                    )
                  }
                >
                  {event.registration_open ? "關閉報名" : "開放報名"}
                </button>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>組別設定</h2>
                  <button
                    className="button secondary"
                    onClick={() => setForm("create_group")}
                  >
                    <Plus size={16} />
                    新增組別
                  </button>
                </div>
                {scope.groups.map((g) => (
                  <div className="setting-row" key={g.id}>
                    <div>
                      <strong>{g.name}</strong>
                      <p>
                        {g.style} · NT$ {g.fee} · {g.slots} 強
                      </p>
                    </div>
                    <Badge tone={g.open ? "green" : "neutral"}>
                      {g.open ? "可報名" : "暫停報名"}
                    </Badge>
                    <button
                      className="text-button"
                      onClick={() => {
                        scope.setGroupId(g.id);
                        setForm("edit_group");
                      }}
                    >
                      編輯
                    </button>
                  </div>
                ))}
              </section>
            </>
          ) : null}
          {tab === "team" ? (
            <>
              <section className="panel">
                <div className="panel-heading">
                  <h2>團隊與授權</h2>
                  <button
                    className="button primary"
                    onClick={() => setForm("invite")}
                  >
                    <Mail size={17} />
                    Email 邀請
                  </button>
                </div>
                <p className="muted">
                  受邀者須登入相同
                  Email、完成信箱驗證並接受邀請。所有授權都有指定起訖時間。
                </p>
                {work?.memberships
                  .filter((m) => m.event_id === event.id)
                  .map((m) => (
                    <div className="setting-row" key={m.id}>
                      <div>
                        <strong>{roleLabel(m.role)}</strong>
                        <p className="mono small">{m.user_id}</p>
                        <small>
                          {date(m.starts_at)} — {date(m.ends_at)} ·{" "}
                          {m.group_ids
                            .map(
                              (id) =>
                                scope.groups.find((g) => g.id === id)?.name,
                            )
                            .join("、") || "全活動"}
                        </small>
                      </div>
                      <Badge tone={m.revoked_at ? "neutral" : "green"}>
                        {m.revoked_at
                          ? "已撤銷"
                          : Date.parse(m.starts_at) > Date.now()
                            ? "尚未生效"
                            : Date.parse(m.ends_at) < Date.now()
                              ? "已到期"
                              : "有效"}
                      </Badge>
                      {!m.revoked_at && (owner || m.role !== "admin") ? (
                        <button
                          className="text-button"
                          onClick={() =>
                            show(
                              "revoke_member",
                              "撤銷授權",
                              `確認撤銷此${roleLabel(m.role)}的存取權限？現有評分將保留。`,
                              { event_id: event.id, membership_id: m.id },
                              true,
                            )
                          }
                        >
                          撤銷
                        </button>
                      ) : null}
                    </div>
                  ))}
              </section>
              <section className="panel">
                <h2>邀請紀錄</h2>
                {work?.invitations
                  .filter((i) => i.event_id === event.id)
                  .map((i) => (
                    <div className="setting-row" key={i.id}>
                      <div>
                        <strong>{i.email}</strong>
                        <p>
                          {roleLabel(i.role)} · {date(i.ends_at)} 到期
                        </p>
                      </div>
                      <Badge>
                        {i.status === "pending"
                          ? "待接受"
                          : i.status === "accepted"
                            ? "已接受"
                            : "已撤銷"}
                      </Badge>
                      {i.status === "pending" &&
                      (owner || i.role !== "admin") ? (
                        <button
                          className="text-button"
                          onClick={() =>
                            show(
                              "revoke_invite",
                              "撤銷邀請",
                              "撤銷後，此邀請將無法接受。",
                              { event_id: event.id, invitation_id: i.id },
                              true,
                            )
                          }
                        >
                          撤銷
                        </button>
                      ) : null}
                    </div>
                  ))}
              </section>
              {owner ? (
                <section className="panel">
                  <h2>移轉活動所有權</h2>
                  <p className="muted">
                    僅可移轉給目前有效的主辦管理員；移轉後你的擁有者權限會立即結束。
                  </p>
                  <select
                    aria-label="新擁有者"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value)
                        show(
                          "transfer_owner",
                          "移轉活動所有權",
                          "此操作會立即將活動擁有權移交給所選管理員。",
                          {
                            event_id: event.id,
                            version: event.version,
                            user_id: e.target.value,
                          },
                          true,
                        );
                      e.target.value = "";
                    }}
                  >
                    <option value="">選擇新擁有者</option>
                    {work?.memberships
                      .filter(
                        (m) =>
                          m.event_id === event.id &&
                          m.role === "admin" &&
                          !m.revoked_at &&
                          m.user_id !== work.user_id &&
                          Date.parse(m.starts_at) <= Date.now() &&
                          Date.parse(m.ends_at) > Date.now(),
                      )
                      .map((m) => (
                        <option key={m.id} value={m.user_id}>
                          {m.user_id}
                        </option>
                      ))}
                  </select>
                </section>
              ) : null}
            </>
          ) : null}
          {tab === "battle" ? (
            group ? (
              <>
                <div className="phase-banner">
                  <Lock size={20} />
                  <div>
                    <strong>
                      {group.locked_at
                        ? "晉級已鎖定 · 配對已保存"
                        : "海選核對與晉級"}
                    </strong>
                    <p>
                      {group.locked_at
                        ? "確認本輪所有勝方後，才能建立下一輪。"
                        : "系統會檢查有效評審、報到人數、漏評及截止線同分。"}
                    </p>
                  </div>
                  {!group.locked_at ? (
                    <button
                      className="button primary"
                      onClick={() =>
                        show(
                          "lock",
                          "鎖定晉級並產生首輪配對",
                          `${group.name}：依指定評審平均分選出前 ${group.slots} 名。鎖定後停止改分，首輪隨機配對永久保存。`,
                        )
                      }
                    >
                      鎖定 {group.slots} 強
                    </button>
                  ) : null}
                </div>
                {!group.locked_at ? (
                  <section className="panel">
                    <h2>海選成績核對</h2>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>舞者</th>
                            {judges.map((j) => (
                              <th key={j.id}>{j.user_id.slice(0, 8)}</th>
                            ))}
                            <th>平均分</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entries
                            .filter((e) => e.checked_at)
                            .map((e) => {
                              const ss = judges.map((j) =>
                                work?.scores.find(
                                  (s) =>
                                    s.entry_id === e.id &&
                                    s.judge_id === j.user_id,
                                ),
                              );
                              return (
                                <tr key={e.id}>
                                  <td>{e.dancer}</td>
                                  {ss.map((s, i) => (
                                    <td key={i}>{s?.score ?? "漏評"}</td>
                                  ))}
                                  <td>
                                    {ss.length && ss.every(Boolean)
                                      ? (
                                          ss.reduce(
                                            (sum, s) => sum + Number(s!.score),
                                            0,
                                          ) / ss.length
                                        ).toFixed(2)
                                      : "待完成"}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                    <p className="muted small">
                      截止線同分須加賽，再由原評審修分及記錄原因；系統不以姓名或報名先後決定晉級。
                    </p>
                  </section>
                ) : (
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Battle 賽程</h2>
                      <button
                        className="button secondary"
                        onClick={() =>
                          show(
                            "next_round",
                            "建立下一輪",
                            "本輪全部確認後，依保存的對戰順序將勝方配對。決賽完成後不再建立輪次。",
                          )
                        }
                      >
                        建立下一輪
                      </button>
                    </div>
                    {matches.map((m) => (
                      <div
                        className={`admin-match ${group.current_match === m.id ? "current" : ""}`}
                        key={m.id}
                      >
                        <div>
                          <Badge
                            tone={
                              group.current_match === m.id
                                ? "orange"
                                : "neutral"
                            }
                          >
                            R{m.round} · M{m.position}
                            {group.current_match === m.id ? " 目前場次" : ""}
                          </Badge>
                          <strong>
                            {name(m.a)} <span className="muted">vs</span>{" "}
                            {name(m.b)}
                          </strong>
                          <p>
                            {[m.a, m.b]
                              .map(
                                (id) =>
                                  `${name(id)} ${work?.votes.filter((v) => v.match_id === m.id && v.entry_id === id).length || 0} 票`,
                              )
                              .join(" / ")}
                          </p>
                          {m.winner ? (
                            <p className="green-text">
                              <Trophy size={15} />
                              勝方：{name(m.winner)}
                            </p>
                          ) : null}
                        </div>
                        <div className="match-actions">
                          {!m.winner ? (
                            <button
                              className="button compact secondary"
                              disabled={loading || group.current_match === m.id}
                              onClick={() =>
                                mutate("set_current", {
                                  ...base,
                                  match_id: m.id,
                                })
                              }
                            >
                              設為目前場次
                            </button>
                          ) : null}
                          <select
                            aria-label={`R${m.round} M${m.position} ${m.winner ? "更正" : "確認"}勝方`}
                            value=""
                            onChange={(e) => {
                              if (e.target.value)
                                show(
                                  "confirm_winner",
                                  m.winner ? "更正已確認勝方" : "確認本場勝方",
                                  `${name(e.target.value)} 將成為 R${m.round} M${m.position} 勝方。${m.winner ? "已有後續輪次時，系統將拒絕更正。" : "請先核對評審票況；操作後仍須另行公布。"}`,
                                  {
                                    ...base,
                                    match_id: m.id,
                                    entry_id: e.target.value,
                                    version: m.version,
                                  },
                                  !!m.winner,
                                );
                            }}
                          >
                            <option value="">
                              {m.winner ? "更正勝方…" : "確認勝方…"}
                            </option>
                            <option value={m.a}>{name(m.a)}</option>
                            <option value={m.b}>{name(m.b)}</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </section>
                )}
                <section className="panel publish-panel">
                  <div>
                    <h2>公開畫面由你把關</h2>
                    <p>
                      目前場次及已確認結果會寫入公開快照。請核對名單與勝方後再公布。
                    </p>
                  </div>
                  <div className="button-row">
                    <button
                      disabled={!group.locked_at}
                      className="button primary"
                      onClick={() =>
                        show(
                          "publish",
                          "核對並公布",
                          `將 ${group.name} 的晉級名單、目前場次及 ${matches.filter((m) => m.winner).length} 場已確認勝方公開。公開資料不含手機、繳費或私人評語。`,
                        )
                      }
                    >
                      <Radio size={17} />
                      確認並公布
                    </button>
                    <button
                      className="button secondary"
                      onClick={() =>
                        show(
                          "pause",
                          "暫停公布",
                          "公開畫面將顯示等待狀態，直到你再次確認並公布。",
                        )
                      }
                    >
                      <Pause size={17} />
                      暫停公布
                    </button>
                  </div>
                </section>
              </>
            ) : (
              <Empty title="請先建立組別" />
            )
          ) : null}
          {tab === "backup" ? (
            <>
              <section className="panel">
                <h2>活動完整備份</h2>
                <p className="muted">
                  匯出包含個資、成績、賽程與權限。還原限同一活動及擁有者，現有團隊權限與稽核紀錄會保留。已鎖定晉級或建立賽程時不可還原。
                </p>
                <div className="button-row">
                  <button
                    disabled={!owner || loading}
                    className="button secondary"
                    onClick={exportBackup}
                  >
                    <Download size={17} />
                    匯出完整備份
                  </button>
                  <label
                    className={`button secondary ${!owner ? "disabled" : ""}`}
                  >
                    <Upload size={17} />
                    驗證與還原預覽
                    <input
                      hidden
                      type="file"
                      accept="application/json,.json"
                      disabled={!owner}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !event) return;
                        try {
                          if (
                            work?.groups.some(
                              (g) => g.event_id === event.id && g.locked_at,
                            ) ||
                            work?.matches.some((m) =>
                              work.groups.some(
                                (g) =>
                                  g.id === m.group_id &&
                                  g.event_id === event.id,
                              ),
                            )
                          )
                            throw new Error(
                              "本活動已有晉級鎖定或賽程，不可還原",
                            );
                          setBackup(
                            await validateBackup(file, event.id, work!.user_id),
                          );
                        } catch (err) {
                          setNotice((err as Error).message);
                        }
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <p className="muted small">
                  舊系統遷移尚需原始資料格式，請保留原檔。此匯入僅接受 BATTLE
                  EVENTS v1 備份。
                </p>
              </section>
              <section className="panel">
                <h2>操作紀錄</h2>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>時間</th>
                        <th>操作</th>
                        <th>操作者</th>
                        <th>原因 / 詳細</th>
                      </tr>
                    </thead>
                    <tbody>
                      {work?.audit
                        .filter((a) => a.event_id === event.id)
                        .map((a) => (
                          <tr key={a.id}>
                            <td>{date(a.created_at, true)}</td>
                            <td>{a.action}</td>
                            <td className="mono small">
                              {a.actor.slice(0, 8)}
                            </td>
                            <td className="small">
                              {String(
                                a.payload.reason ||
                                  a.payload.title ||
                                  a.payload.scenario ||
                                  "—",
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : null}
        </>
      )}
      <section className="sample-panel">
        <FlaskConical size={24} />
        <div>
          <strong>上場之前，先來一場演練。</strong>
          <p>
            24 人報到、海選正常／同分／漏評與 8
            強現場。全部為標示清楚的合成資料。
          </p>
        </div>
        <button
          className="button secondary"
          disabled={sampleBusy}
          onClick={() =>
            setConfirm({
              action: "samples",
              title: "產生合成演練情境",
              description:
                "將建立 5 場【範例】活動，並將你指派為範例評審。重複執行不會複製既有資料。",
            })
          }
        >
          {sampleBusy ? <Busy /> : "產生範例情境"}
        </button>
      </section>
      {form ? (
        <AdminForm
          kind={form}
          onClose={() => setForm(null)}
          event={event}
          group={group}
          owner={owner}
          onSubmit={async (p) => {
            const result = await mutate(form, p);
            if (result) {
              if (form === "create_event") {
                scope.setEventId(String(result.id));
                scope.setGroupId("");
                setTab("settings");
              }
              if (form === "invite")
                setNotice(
                  result.email_sent
                    ? "邀請已儲存，登入邀請信已寄出。"
                    : "邀請已儲存，但寄信未成功。請通知對方以該 Email 登入並接受邀請。",
                );
              setForm(null);
            }
          }}
        />
      ) : null}
      {confirm ? (
        <Confirm
          title={confirm.title}
          description={confirm.description}
          needsReason={confirm.reason}
          onClose={() => setConfirm(null)}
          onConfirm={async (reason) => {
            if (confirm.action === "samples") {
              setSampleBusy(true);
              try {
                await api("samples", {});
                await refresh();
                setNotice("範例情境已備妥，重複執行不會複製資料。");
                return true;
              } catch (err) {
                setNotice((err as Error).message);
                return false;
              } finally {
                setSampleBusy(false);
              }
            }
            return !!(await mutate(confirm.action, {
              ...(confirm.p || base),
              reason,
            }));
          }}
        />
      ) : null}
      {backup ? (
        <Confirm
          title="備份驗證通過 · 還原預覽"
          description={`活動：${backup.event.title}。${backup.groups.length} 個組別、${backup.registrations.length} 筆報名、${backup.scores.length} 筆評分。將覆蓋目前活動資料，現有權限與操作紀錄保留。`}
          needsReason
          onClose={() => setBackup(null)}
          onConfirm={async (reason) =>
            !!(await mutate("restore", { event_id: event?.id, backup, reason }))
          }
        />
      ) : null}
    </WorkspaceGate>
  );
}
function AdminForm({
  kind,
  event,
  group,
  owner,
  onClose,
  onSubmit,
}: {
  kind: string;
  event: ReturnType<typeof useScope>["event"];
  group: ReturnType<typeof useScope>["group"];
  owner: boolean;
  onClose: () => void;
  onSubmit: (p: Record<string, unknown>) => Promise<void>;
}) {
  const { work, notice, setNotice } = useApp();
  useEffect(() => {
    setNotice("");
  }, []);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const isEvent = kind.endsWith("event"),
    isGroup = kind.endsWith("group");
  const title =
    kind === "create_event"
      ? "建立活動"
      : kind === "edit_event"
        ? "編輯活動"
        : kind === "create_group"
          ? "新增組別"
          : kind === "edit_group"
            ? "編輯組別"
            : "邀請團隊成員";
  const close = () => {
    if (busy) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  const local = (s?: string) =>
    s
      ? new Date(new Date(s).getTime() + 8 * 3600_000)
          .toISOString()
          .slice(0, 16)
      : "";
  return (
    <>
      <Modal title={title} onClose={close}>
        <form
          onChange={() => setDirty(true)}
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const p: Record<string, unknown> = {
              event_id: event?.id,
              group_id: group?.id,
              version: isEvent ? event?.version : group?.version,
            };
            for (const [k, v] of f.entries()) p[k] = v;
            if (isEvent) {
              p.starts_at = new Date(
                String(p.starts_at) + "+08:00",
              ).toISOString();
              p.deadline = new Date(
                String(p.deadline) + "+08:00",
              ).toISOString();
            }
            if (isGroup) {
              p.fee = Number(p.fee);
              p.slots = Number(p.slots);
              if (kind === "edit_group") p.open = f.get("open") === "true";
            }
            if (kind === "invite") {
              p.group_ids = f.getAll("group_ids");
              p.starts_at = new Date(
                String(p.starts_at) + "+08:00",
              ).toISOString();
              p.ends_at = new Date(String(p.ends_at) + "+08:00").toISOString();
            }
            setBusy(true);
            try {
              await onSubmit(p);
            } finally {
              setBusy(false);
            }
          }}
        >
          {isEvent ? (
            <>
              <Field label="活動名稱">
                <input
                  name="title"
                  required
                  maxLength={120}
                  defaultValue={kind === "edit_event" ? event?.title : ""}
                />
              </Field>
              <div className="form-grid">
                <Field label="城市">
                  <input
                    name="city"
                    required
                    defaultValue={event?.city || "台北"}
                  />
                </Field>
                <Field label="場地">
                  <input
                    name="venue"
                    required
                    defaultValue={kind === "edit_event" ? event?.venue : ""}
                  />
                </Field>
                <Field label="開始時間（台灣時間）">
                  <input
                    type="datetime-local"
                    name="starts_at"
                    required
                    defaultValue={
                      kind === "edit_event" ? local(event?.starts_at) : ""
                    }
                  />
                </Field>
                <Field label="報名截止（台灣時間）">
                  <input
                    type="datetime-local"
                    name="deadline"
                    required
                    defaultValue={
                      kind === "edit_event" ? local(event?.deadline) : ""
                    }
                  />
                </Field>
                <Field label="DJ">
                  <input
                    name="dj"
                    defaultValue={kind === "edit_event" ? event?.dj : ""}
                  />
                </Field>
                <Field label="MC">
                  <input
                    name="mc"
                    defaultValue={kind === "edit_event" ? event?.mc : ""}
                  />
                </Field>
              </div>
              <Field label="賽事規則與同分判定方式">
                <textarea
                  name="rules"
                  required
                  rows={4}
                  defaultValue={
                    kind === "edit_event"
                      ? event?.rules
                      : "截止線同分採加賽，由原評審記錄結果與修分原因。"
                  }
                />
              </Field>
              <Field label="公開評審陣容（舞名，不含登入帳號）">
                <input
                  name="judges"
                  defaultValue={kind === "edit_event" ? event?.judges : ""}
                  placeholder="如：Bboy Jay、Popper Lin"
                />
              </Field>
            </>
          ) : isGroup ? (
            <>
              <Field label="組別名稱">
                <input
                  name="name"
                  required
                  maxLength={80}
                  defaultValue={kind === "edit_group" ? group?.name : ""}
                />
              </Field>
              <Field label="舞風">
                <select
                  name="style"
                  defaultValue={
                    kind === "edit_group" ? group?.style : "All Style"
                  }
                >
                  {[
                    "All Style",
                    "Hip Hop",
                    "Breaking",
                    "Popping",
                    "Locking",
                    "House",
                    "Waacking",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <div className="form-grid">
                <Field label="費用（NT$）">
                  <input
                    type="number"
                    min={0}
                    max={100000}
                    name="fee"
                    required
                    defaultValue={kind === "edit_group" ? group?.fee : 500}
                  />
                </Field>
                <Field label="晉級名額">
                  <select
                    name="slots"
                    defaultValue={kind === "edit_group" ? group?.slots : 8}
                  >
                    {[2, 4, 8, 16, 32].map((n) => (
                      <option key={n} value={n}>
                        {n} 強
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              {kind === "edit_group" ? (
                <Field label="組別報名開關">
                  <select name="open" defaultValue={String(group?.open)}>
                    <option value="true">開放報名</option>
                    <option value="false">暫停報名</option>
                  </select>
                </Field>
              ) : null}
            </>
          ) : (
            <>
              <Field label="受邀者 Email">
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="judge@example.com"
                />
              </Field>
              <Field label="角色">
                <select name="role">
                  <option value="judge">評審</option>
                  <option value="checkin">報到人員</option>
                  {owner ? <option value="admin">主辦管理員</option> : null}
                </select>
              </Field>
              <fieldset>
                <legend>授權組別（評審與報到人員必選）</legend>
                {work?.groups
                  .filter((g) => g.event_id === event?.id)
                  .map((g) => (
                    <label className="check-option" key={g.id}>
                      <input type="checkbox" name="group_ids" value={g.id} />
                      {g.name}
                    </label>
                  ))}
              </fieldset>
              <div className="form-grid">
                <Field label="授權開始（台灣時間）">
                  <input
                    type="datetime-local"
                    name="starts_at"
                    required
                    defaultValue={local(new Date().toISOString())}
                  />
                </Field>
                <Field label="授權結束（台灣時間）">
                  <input
                    type="datetime-local"
                    name="ends_at"
                    required
                    defaultValue={local(
                      new Date(Date.now() + 30 * 86400_000).toISOString(),
                    )}
                  />
                </Field>
              </div>
              <p className="muted small">
                邀請儲存後將透過 Supabase Auth 寄送登入信；若寄信失敗，仍可由該
                Email 登入並接受。
              </p>
            </>
          )}
          {notice ? (
            <div role="alert" className="error-box">
              {notice}
            </div>
          ) : null}
          <div className="modal-actions">
            <button
              type="button"
              disabled={busy}
              className="button secondary"
              onClick={close}
            >
              取消
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? <Busy /> : "儲存"}
            </button>
          </div>
        </form>
      </Modal>
      {discard ? (
        <Confirm
          title="捨棄未儲存的輸入"
          description="此表單的修改尚未送出，確認關閉？"
          onClose={() => setDiscard(false)}
          onConfirm={async () => {
            onClose();
            return true;
          }}
        />
      ) : null}
    </>
  );
}
