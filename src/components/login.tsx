"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { LogIn, ArrowUpRight, ShieldCheck } from "lucide-react";
import { supabase, configured } from "@/lib/supabase";
import { useApp } from "./provider";
import { Field, Busy } from "./ui";
export function Login() {
  const { user, work, mutate } = useApp();
  const [mode, setMode] = useState("login"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (
      location.hash.includes("type=recovery") ||
      location.search.includes("recovery")
    )
      setMode("recovery");
    const subscription = supabase?.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("recovery");
    });
    return () => subscription?.data.subscription.unsubscribe();
  }, []);
  return (
    <div className="auth-layout">
      <div className="auth-intro">
        <p className="eyebrow">BACKSTAGE ACCESS</p>
        <h1>
          每個精彩現場，
          <br />
          都有你在幕後。
        </h1>
        <p>一個工作台，串起報到、評分與賽事管理。</p>
        <div className="auth-graphic">
          <img src="/poster.png" alt="" />
        </div>
        <p className="small">
          <ShieldCheck size={17} />
          以活動及組別授權，讓每個角色專注自己的舞台。
        </p>
      </div>
      <section className="panel auth-panel">
        <LogIn size={28} className="accent" />
        <h2>
          {user && mode !== "recovery"
            ? "你已登入"
            : mode === "signup"
              ? "建立帳號"
              : mode === "reset"
                ? "重設密碼"
                : mode === "recovery"
                  ? "設定新密碼"
                  : "登入工作台"}
        </h2>
        {user && mode !== "recovery" ? (
          <>
            <p>{user.email}</p>
            <Link className="button primary full" href="/admin">
              進入後臺 <ArrowUpRight size={17} />
            </Link>
            <h3>待接受邀請</h3>
            {work?.invitations
              .filter(
                (i) =>
                  i.status === "pending" &&
                  i.email.toLowerCase() === user.email?.toLowerCase(),
              )
              .map((i) => (
                <div className="invite-card" key={i.id}>
                  <strong>
                    {i.role === "judge"
                      ? "評審"
                      : i.role === "checkin"
                        ? "報到人員"
                        : "主辦管理員"}
                    邀請
                  </strong>
                  <p>
                    有效至 {new Date(i.ends_at).toLocaleDateString("zh-TW")}
                  </p>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      await mutate("accept_invite", { invitation_id: i.id });
                      setBusy(false);
                    }}
                  >
                    接受邀請
                  </button>
                </div>
              )) || null}
            <p className="muted small">
              邀請由你的 Email 配對。請先完成信箱驗證，再接受授權。
            </p>
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!supabase) return;
              const f = new FormData(e.currentTarget);
              setBusy(true);
              setMessage("");
              try {
                const email = String(f.get("email")),
                  password = String(f.get("password"));
                const redirect =
                  process.env.NEXT_PUBLIC_SITE_URL || location.origin;
                let result;
                if (mode === "signup")
                  result = await supabase.auth.signUp({
                    email,
                    password,
                    options: { emailRedirectTo: redirect + "/login" },
                  });
                else if (mode === "reset")
                  result = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: redirect + "/login?recovery=1",
                  });
                else if (mode === "recovery")
                  result = await supabase.auth.updateUser({ password });
                else
                  result = await supabase.auth.signInWithPassword({
                    email,
                    password,
                  });
                if (result.error) throw result.error;
                setMessage(
                  mode === "signup"
                    ? "帳號已建立，請至信箱完成驗證。"
                    : mode === "reset"
                      ? "若此信箱有帳號，將收到重設密碼信。"
                      : mode === "recovery"
                        ? "密碼已更新。"
                        : "登入成功",
                );
                if (mode === "recovery") setMode("login");
              } catch (err) {
                setMessage((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {mode !== "recovery" ? (
              <Field label="Email">
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </Field>
            ) : null}
            {mode !== "reset" ? (
              <Field label="密碼">
                <input
                  type="password"
                  name="password"
                  required
                  minLength={8}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  placeholder="至少 8 個字元"
                />
              </Field>
            ) : null}
            <button
              className="button primary full"
              disabled={busy || !configured}
            >
              {busy ? (
                <Busy />
              ) : mode === "signup" ? (
                "建立帳號"
              ) : mode === "reset" ? (
                "寄送重設信"
              ) : mode === "recovery" ? (
                "儲存新密碼"
              ) : (
                "登入"
              )}
            </button>
            <div className="auth-links">
              <button
                type="button"
                className="text-button"
                onClick={() => setMode(mode === "signup" ? "login" : "signup")}
              >
                {mode === "signup" ? "已有帳號？登入" : "第一次使用？建立帳號"}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setMode("reset")}
              >
                忘記密碼
              </button>
            </div>
          </form>
        )}
        {message ? (
          <div role="status" className="notice">
            {message}
          </div>
        ) : null}
      </section>
    </div>
  );
}
