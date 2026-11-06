"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  Search,
  MapPin,
  CalendarDays,
  Ticket,
  Music2,
  Mic2,
  ChevronLeft,
} from "lucide-react";
import QRCode from "qrcode";
import type { Event } from "@/lib/types";
import { sampleEvents, date } from "@/lib/samples";
import { api, configured } from "@/lib/supabase";
import { Field, Badge, Empty, Busy } from "./ui";
export function useEvents() {
  const [events, setEvents] = useState<Event[]>(configured ? [] : sampleEvents),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(configured);
  useEffect(() => {
    if (configured)
      api<Event[]>("events")
        .then(setEvents)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
  }, []);
  return { events, error, loading };
}
export function Events() {
  const { events, error, loading } = useEvents();
  const [q, setQ] = useState(""),
    [city, setCity] = useState(""),
    [style, setStyle] = useState("");
  const filtered = events.filter(
    (e) =>
      (!q ||
        `${e.title}${e.city}${e.groups?.map((g) => g.style).join()}`
          .toLowerCase()
          .includes(q.toLowerCase())) &&
      (!city || e.city === city) &&
      (!style || e.groups?.some((g) => g.style === style)),
  );
  const featured = events[0];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">STREET DANCE COMMUNITY</p>
          <h1>
            活動探索<span className="orange-dot">.</span>
          </h1>
          <p className="subtitle">
            找到你的下一個舞台。報名、上場，讓舞蹈說話。
          </p>
        </div>
        <Link className="button primary" href="/live">
          查看現場賽況 <ArrowUpRight size={18} />
        </Link>
      </div>
      {featured ? (
        <Link href={`/events/${featured.id}`} className="featured">
          <img src="/poster.png" alt="橘色與米白色幾何街舞海報" />
          <div className="featured-copy">
            <div className="featured-meta">
              {featured.city} <span>/</span> {date(featured.starts_at)}
            </div>
            <h2>{featured.title}</h2>
            <span className="button primary">
              查看活動 <ArrowUpRight size={18} />
            </span>
          </div>
          <span className="featured-number">
            01 / {String(events.length).padStart(2, "0")}
          </span>
        </Link>
      ) : null}
      <div className="filters">
        <label className="search">
          <Search size={20} />
          <input
            aria-label="搜尋活動"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜尋活動、城市或舞風"
          />
        </label>
        <select
          aria-label="城市篩選"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        >
          <option value="">全部城市</option>
          {[...new Set(events.map((e) => e.city))].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          aria-label="舞風篩選"
          value={style}
          onChange={(e) => setStyle(e.target.value)}
        >
          <option value="">全部舞風</option>
          {[
            ...new Set(
              events.flatMap((e) => e.groups?.map((g) => g.style) || []),
            ),
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="section-title">
        <h2>即將登場</h2>
        <span>{filtered.length} 場活動</span>
        <small>THE NEXT STAGE IS YOURS</small>
      </div>
      {loading ? (
        <Busy />
      ) : error ? (
        <div role="alert" className="error-box">
          {error}
        </div>
      ) : filtered.length ? (
        <div className="event-grid">
          {filtered.map((e, i) => (
            <article className="event-card" key={e.id}>
              <Link
                href={`/events/${e.id}`}
                className={`card-art art-${i % 3}`}
                aria-label={`查看 ${e.title}`}
              >
                <img src="/poster.png" alt="" />
                <span>{e.groups?.[0]?.style || "STREET DANCE"}</span>
                <b>{String(i + 1).padStart(2, "0")}</b>
              </Link>
              <div className="event-card-body">
                <h3>
                  <Link href={`/events/${e.id}`}>{e.title}</Link>
                </h3>
                <p>
                  <CalendarDays size={16} />
                  {date(e.starts_at)}
                </p>
                <p>
                  <MapPin size={16} />
                  {e.city}・{e.venue}
                </p>
                <div className="card-footer">
                  <Badge tone={e.registration_open ? "orange" : "neutral"}>
                    {e.registration_open ? "報名開放" : "報名已截止"}
                  </Badge>
                  <Link href={`/events/${e.id}`}>
                    查看詳情 <ArrowRight size={17} />
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="沒有符合條件的活動"
          description="試試其他關鍵字，或清除城市及舞風篩選。"
        >
          <button
            className="button secondary"
            onClick={() => {
              setQ("");
              setCity("");
              setStyle("");
            }}
          >
            清除篩選
          </button>
        </Empty>
      )}
    </>
  );
}
export function EventDetail({ id }: { id: string }) {
  const { events, error, loading } = useEvents();
  const ev = events.find((e) => e.id === id);
  const [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [result, setResult] = useState<{ number: number; token: string } | null>(
      null,
    ),
    [qr, setQr] = useState("");
  const request = useRef<{ signature: string; id: string } | null>(null);
  useEffect(() => {
    if (result)
      QRCode.toDataURL(result.token, { width: 260, margin: 2 })
        .then(setQr)
        .catch(() => setMessage("QR Code 產生失敗，可使用報名編號查詢。"));
  }, [result]);
  if (loading) return <Busy />;
  if (!ev)
    return (
      <Empty title={error || "找不到這個活動"}>
        <Link className="button primary" href="/events">
          返回活動探索
        </Link>
      </Empty>
    );
  const closed = !ev.registration_open || new Date(ev.deadline) < new Date();
  return (
    <>
      <Link href="/events" className="back-link">
        <ChevronLeft size={17} />
        返回活動探索
      </Link>
      <div className="detail-hero">
        <img src="/poster.png" alt="幾何街舞海報" />
        <div>
          <Badge tone={closed ? "neutral" : "orange"}>
            {closed ? "報名已截止" : "報名開放"}
          </Badge>
          <h1>{ev.title}</h1>
          <p>
            <MapPin size={17} />
            {ev.city}・{ev.venue}
          </p>
          <p>
            <CalendarDays size={17} />
            {date(ev.starts_at, true)}
          </p>
        </div>
      </div>
      <div className="detail-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>活動資訊</h2>
            <Music2 size={20} />
          </div>
          <h3>賽事組別</h3>
          <div className="group-list">
            {ev.groups?.map((g) => (
              <div key={g.id}>
                <strong>{g.name}</strong>
                <span>
                  {g.style} · {g.slots} 強 · NT$ {g.fee}
                </span>
              </div>
            ))}
          </div>
          <h3>賽事規則</h3>
          <p className="preserve-lines">{ev.rules || "主辦尚未提供規則"}</p>
          <h3>音樂與現場</h3>
          <p>評審：{ev.judges || "待公布"}</p>
          <p>
            <Music2 size={16} /> DJ：{ev.dj || "待公布"} <Mic2 size={16} /> MC：
            {ev.mc || "待公布"}
          </p>
          <p className="muted">報名截止：{date(ev.deadline, true)}</p>
        </section>
        <section className="panel registration">
          <div className="panel-heading">
            <h2>登上你的舞台</h2>
            <Ticket size={22} />
          </div>
          {result ? (
            <div className="registration-success">
              <Badge tone="green">報名成功 · 已寫入雲端</Badge>
              <h3>報名編號 #{result.number}</h3>
              {qr ? (
                <img className="qr" src={qr} alt="報到 QR Code" />
              ) : (
                <Busy />
              )}
              <p>請保存 QR Code，現場出示即可報到。</p>
              <p className="muted">QR Code 僅含隨機查詢代碼，不含手機。</p>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setMessage("");
                const fd = new FormData(e.currentTarget);
                const p = {
                  event_id: ev.id,
                  dancer: String(fd.get("dancer")),
                  phone: String(fd.get("phone")),
                  group_ids: selected,
                };
                const signature = JSON.stringify(p);
                if (request.current?.signature !== signature)
                  request.current = { signature, id: crypto.randomUUID() };
                try {
                  setResult(
                    await api("register", {
                      ...p,
                      request_id: request.current.id,
                    }),
                  );
                } catch (err) {
                  setMessage((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field label="舞名">
                <input
                  required
                  name="dancer"
                  maxLength={60}
                  autoComplete="nickname"
                  placeholder="你在舞圈的名字"
                />
              </Field>
              <Field label="手機號碼">
                <input
                  required
                  name="phone"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="0912 345 678"
                />
              </Field>
              <fieldset>
                <legend>參賽組別（可複選）</legend>
                {ev.groups?.map((g) => (
                  <label className="check-option" key={g.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(g.id)}
                      disabled={!g.open}
                      onChange={(e) =>
                        setSelected((prev) =>
                          e.target.checked
                            ? [...prev, g.id]
                            : prev.filter((x) => x !== g.id),
                        )
                      }
                    />
                    <span>
                      {g.name}
                      <small>{g.open ? `NT$ ${g.fee}` : "本組暫停報名"}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <div className="total">
                <span>現場繳費合計</span>
                <strong>
                  NT${" "}
                  {ev.groups
                    ?.filter((g) => selected.includes(g.id))
                    .reduce((n, g) => n + g.fee, 0)}
                </strong>
              </div>
              <p className="muted small">
                僅記錄報名，費用依主辦規定於現場繳交。
              </p>
              {message ? (
                <div role="alert" className="error-box">
                  {message}
                </div>
              ) : null}
              <button
                disabled={!configured || closed || !selected.length || busy}
                className="button primary full"
                type="submit"
              >
                {busy ? <Busy /> : closed ? "報名已截止" : "確認報名"}
                <ArrowUpRight size={18} />
              </button>
              {!configured ? (
                <p className="muted small">
                  此為範例活動，連接 Supabase 後才可報名。
                </p>
              ) : null}
            </form>
          )}
        </section>
      </div>
    </>
  );
}
