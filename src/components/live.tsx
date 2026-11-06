"use client";
import { useEffect, useState, useRef } from "react";
import {
  Maximize,
  RefreshCw,
  GitBranch,
  List,
  Trophy,
  Radio,
} from "lucide-react";
import { useEvents } from "./events";
import { api } from "@/lib/supabase";
import type { Snapshot } from "@/lib/types";
import { Empty, Badge, Field } from "./ui";
import { date } from "@/lib/samples";
export function Live() {
  const { events } = useEvents();
  const [eventId, setEventId] = useState(""),
    [groupId, setGroupId] = useState(""),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [view, setView] = useState("bracket"),
    [auto, setAuto] = useState(true),
    [tick, setTick] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const ev = events.find((e) => e.id === eventId) || events[0];
  const g = ev?.groups?.find((g) => g.id === groupId) || ev?.groups?.[0];
  useEffect(() => {
    if (!g || g.id.startsWith("sample-")) {
      setSnapshot(null);
      return;
    }
    let active = true;
    setSnapshot(null);
    const load = () =>
      api<Snapshot | null>("live?group=" + g.id)
        .then((s) => {
          if (active) {
            setSnapshot(s);
            setError("");
          }
        })
        .catch((e) => {
          if (active) {
            setSnapshot(null);
            setError("同步失敗：" + e.message);
          }
        });
    void load();
    const timer = auto ? setInterval(load, 10000) : undefined;
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [g?.id, auto, tick]);
  const data = snapshot?.published ? snapshot.data : null;
  const matches = data?.matches || [];
  const current = matches.find((m) => m.id === data?.current_match);
  const rounds = [...new Set(matches.map((m) => m.round))].sort(
    (a, b) => a - b,
  );
  const last = matches.filter((m) => m.round === rounds.at(-1));
  const champion = last.length === 1 ? last[0].winner : null;
  const futureRounds: { round: number; count: number }[] = [];
  if (!champion)
    for (
      let count = last.length / 2, round = (rounds.at(-1) || 0) + 1;
      count >= 1;
      count /= 2, round++
    )
      futureRounds.push({ round, count });
  const name = (id: string | null) =>
    data?.dancers.find((e) => e.id === id)?.dancer || "待晉級";
  return (
    <div ref={root} className="live-root">
      <div className="page-heading">
        <div>
          <p className="eyebrow">LIVE / FEEL THE BATTLE</p>
          <h1>Battle 現場</h1>
          <p className="subtitle">每一次交鋒，都值得全場的目光。</p>
        </div>
        <button
          className="button secondary"
          onClick={() => {
            if (!document.fullscreenElement)
              root.current
                ?.requestFullscreen()
                .catch(() =>
                  setError("瀏覽器不支援全螢幕，請使用瀏覽器全螢幕功能。"),
                );
            else void document.exitFullscreen();
          }}
        >
          <Maximize size={18} />
          全螢幕
        </button>
      </div>
      <div className="scope-bar">
        <Field label="活動">
          <select
            value={ev?.id || ""}
            onChange={(e) => {
              setEventId(e.target.value);
              setGroupId("");
            }}
          >
            {events.map((e) => (
              <option value={e.id} key={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="組別">
          <select
            value={g?.id || ""}
            onChange={(e) => setGroupId(e.target.value)}
          >
            {ev?.groups?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        <label className="auto-refresh">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
          />
          每 10 秒更新
        </label>
        <button
          className="icon-button"
          aria-label="更新現場賽況"
          onClick={() => setTick((v) => v + 1)}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      {error ? (
        <div role="alert" className="error-box">
          {error} · 下次更新時重試。
        </div>
      ) : null}
      {!data ? (
        <Empty
          title="等待主辦公布賽況"
          description="晉級名單及對戰結果經主辦確認後，會在這裡公開。"
        />
      ) : (
        <>
          <div className="live-stage">
            <span className="live-label">
              <Radio size={15} />
              {champion ? "CHAMPION" : "ON THE FLOOR"}
            </span>
            {champion ? (
              <>
                <Trophy size={48} />
                <h2>{name(champion)}</h2>
                <p>{data.group_name} · 冠軍</p>
              </>
            ) : current ? (
              <>
                <p>
                  ROUND {current.round} / MATCH {current.position}
                </p>
                <div className="live-versus">
                  <strong>{name(current.a)}</strong>
                  <em>VS</em>
                  <strong>{name(current.b)}</strong>
                </div>
              </>
            ) : (
              <>
                <h2>本輪賽事已完成</h2>
                <p>等待下一輪場次公布</p>
              </>
            )}
          </div>
          <div className="section-title">
            <h2>對戰賽程</h2>
            <span>{data.group_name}</span>
            <div className="tabs">
              <button
                className={view === "bracket" ? "selected" : ""}
                onClick={() => setView("bracket")}
              >
                <GitBranch size={16} />
                對戰表
              </button>
              <button
                className={view === "list" ? "selected" : ""}
                onClick={() => setView("list")}
              >
                <List size={16} />
                列表
              </button>
            </div>
          </div>
          <div className={view === "bracket" ? "bracket-scroll" : "match-list"}>
            {rounds.map((r, ri) => (
              <section className="bracket-round" key={r}>
                <h3>
                  {ri === rounds.length - 1 && last.length === 1
                    ? "決賽"
                    : `ROUND ${r}`}
                </h3>
                <div className="round-matches">
                  {matches
                    .filter((m) => m.round === r)
                    .map((m) => (
                      <div
                        className={`match-card ${m.id === data.current_match ? "current" : ""}`}
                        key={m.id}
                      >
                        <small>
                          MATCH {m.position}
                          {m.winner ? " · 已確認" : ""}
                        </small>
                        {[m.a, m.b].map((id) => (
                          <div
                            key={id}
                            className={m.winner === id ? "winner" : ""}
                          >
                            <span>{name(id)}</span>
                            {m.winner === id ? <Trophy size={15} /> : null}
                          </div>
                        ))}
                      </div>
                    ))}
                </div>
              </section>
            ))}
            {futureRounds.map((future) => (
              <section className="bracket-round future" key={future.round}>
                <h3>
                  {future.count === 1 ? "決賽" : `ROUND ${future.round}`} ·
                  待建立
                </h3>
                <div className="round-matches">
                  {Array.from({ length: future.count }, (_, i) => (
                    <div className="match-card" key={i}>
                      <small>待建立</small>
                      <div>待晉級</div>
                      <div>待晉級</div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <section className="panel qualifiers">
            <h2>已公布晉級名單</h2>
            <div>
              {data.dancers.map((d) => (
                <Badge key={d.id}>
                  {d.dancer} · #{d.number}
                </Badge>
              ))}
            </div>
          </section>
          <p className="muted small">
            公開快照 ·{" "}
            {snapshot?.published_at ? date(snapshot.published_at, true) : ""}
            。後臺尚未公布的變更不會顯示。
          </p>
        </>
      )}
    </div>
  );
}
