"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Search,
  ScanLine,
  UserRound,
  Monitor,
  Settings2,
  ArrowUpRight,
  Menu,
  X,
  LogIn,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { useApp } from "./provider";
import { Confirm } from "./workspace";
import { supabase, configured } from "@/lib/supabase";
const nav = [
  ["/events", "活動探索", Search],
  ["/checkin", "現場報到", ScanLine],
  ["/judging", "評審工作台", UserRound],
  ["/live", "Battle 現場", Monitor],
  ["/admin", "後臺管理", Settings2],
] as const;
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const {
    user,
    notice,
    setNotice,
    refresh,
    loading,
    scoreDrafts,
    clearScoreDrafts,
  } = useApp();
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const signOut = async () => {
    const result = await supabase?.auth.signOut();
    if (result?.error) {
      setNotice(result.error.message);
      return false;
    }
    clearScoreDrafts();
    setNotice("已登出");
    return true;
  };
  const current =
    nav.find(([href]) => path.startsWith(href))?.[1] || "活動探索";
  return (
    <div className="app-shell">
      {logoutConfirm ? (
        <Confirm
          title="登出前確認草稿"
          description="仍有未送出的評分草稿。確認登出將捨棄草稿，雲端已儲存資料不受影響。"
          onClose={() => setLogoutConfirm(false)}
          onConfirm={signOut}
        />
      ) : null}
      <aside className={open ? "sidebar is-open" : "sidebar"}>
        <Link href="/events" className="brand" onClick={() => setOpen(false)}>
          <span className="brand-square" />
          <span>
            BATTLE
            <br />
            EVENTS<span className="brand-dot">.</span>
          </span>
        </Link>
        <button
          className="mobile-close icon-button"
          aria-label="關閉選單"
          onClick={() => setOpen(false)}
        >
          <X />
        </button>
        <nav>
          {nav.map(([href, label, Icon]) => (
            <Link
              onClick={() => setOpen(false)}
              key={href}
              href={href}
              className={
                path.startsWith(href) || (path === "/" && href === "/events")
                  ? "nav-link active"
                  : "nav-link"
              }
            >
              <Icon size={21} />
              {label}
              {href === "/events" ? <span className="nav-indicator" /> : null}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-poster">
            <span>
              READY TO
              <br />
              BATTLE?
            </span>
            <p>
              把熱愛帶上舞台 <ArrowUpRight size={18} />
            </p>
            <i />
          </div>
          <small>街舞的每一刻，都值得被看見。</small>
        </div>
      </aside>
      {open ? (
        <button
          className="scrim"
          aria-label="關閉選單遮罩"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="開啟選單"
            onClick={() => setOpen(true)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            BATTLE EVENTS <span>/</span> <strong>{current}</strong>
          </div>
          <div className="top-actions">
            {user ? (
              <>
                <span className="user-email">{user.email}</span>
                <button
                  className="text-button"
                  onClick={() => {
                    if (Object.keys(scoreDrafts).length) setLogoutConfirm(true);
                    else void signOut();
                  }}
                >
                  <LogOut size={17} />
                  登出
                </button>
              </>
            ) : (
              <Link href="/login" className="text-button">
                <LogIn size={18} />
                登入工作台
              </Link>
            )}
          </div>
        </header>
        <main>
          {notice ? (
            <div role="status" className="notice">
              <span>{notice}</span>
              <button
                onClick={() => setNotice("")}
                className="icon-button"
                aria-label="關閉通知"
              >
                <X size={17} />
              </button>
            </div>
          ) : null}
          {!configured ? (
            <div className="setup-notice">
              範例瀏覽模式 · 尚未連接 Supabase，報名及工作台寫入功能暫未開放。
            </div>
          ) : null}
          {user ? (
            <button
              disabled={loading}
              className="sync-button text-button"
              onClick={() =>
                refresh()
                  .then(() => setNotice("已同步最新雲端資料"))
                  .catch((e) => setNotice(e.message))
              }
            >
              <RefreshCw size={14} />
              重新同步
            </button>
          ) : null}
          {children}
        </main>
        <footer>
          © 2026 BATTLE EVENTS <span>FOR THE LOVE OF DANCE.</span>
        </footer>
      </div>
    </div>
  );
}
