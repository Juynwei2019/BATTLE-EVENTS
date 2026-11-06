import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { registrationSchema, errorStatus } from "@/lib/validation";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
function fail(error: string, status = 400) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const path = (await ctx.params).path.join("/");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    return fail(
      "尚未連接 Supabase；目前僅可瀏覽範例。請依 README 設定環境變數。",
      503,
    );
  const token = req.headers.get("authorization");
  const client = createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: token ? { Authorization: token } : {} },
  });
  if (path === "workspace") {
    if (!token) return fail("請先登入工作台", 401);
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return fail("登入已失效，請重新登入", 401);
  }
  let out;
  if (path === "events") out = await client.rpc("browse_events");
  else if (path === "workspace") out = await client.rpc("workspace");
  else if (path === "live") {
    const g = req.nextUrl.searchParams.get("group");
    if (!g || !/^[\da-f-]{36}$/i.test(g)) return fail("請選擇有效組別");
    out = await client.rpc("live_snapshot", { g });
  } else return fail("找不到 API", 404);
  if (out.error) return fail(out.error.message, errorStatus(out.error.message));
  return NextResponse.json(out.data, {
    headers: { "Cache-Control": "no-store" },
  });
}
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const path = (await ctx.params).path.join("/");
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.get("host"))
        return fail("來源不符", 403);
    } catch {
      return fail("來源格式錯誤", 403);
    }
  }
  if (Number(req.headers.get("content-length") || 0) > 3_000_000)
    return fail("檔案過大", 413);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return fail("尚未連接 Supabase，未寫入任何資料", 503);
  let body;
  try {
    const raw = await req.text();
    if (raw.length > 3_000_000) return fail("檔案過大", 413);
    body = JSON.parse(raw);
  } catch {
    return fail("請求格式錯誤");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return fail("請求必須是 JSON 物件");
  if (path === "register") {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) return fail("伺服器尚未完成報名服務設定", 503);
    let parsed;
    try {
      parsed = registrationSchema.parse(body);
    } catch {
      return fail("請填寫舞名、有效手機及至少一個組別");
    }
    const fingerprint = createHmac("sha256", serviceKey)
      .update(
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local",
      )
      .digest("hex");
    const db = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });
    const limit = await db.rpc("consume_registration_limit", { fingerprint });
    if (limit.error) return fail("報名服務暫時無法使用，請稍後重試", 503);
    if (!limit.data) return fail("請求次數過多，請於一分鐘後重試", 429);
    const { data, error } = await db.rpc("register_dancer", {
      p: parsed,
      fingerprint,
    });
    return error
      ? fail(error.message, errorStatus(error.message))
      : NextResponse.json(data);
  }
  const token = req.headers.get("authorization");
  if (!token) return fail("請先登入", 401);
  const client = createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { Authorization: token } },
  });
  const auth = await client.auth.getUser();
  if (auth.error || !auth.data.user) return fail("登入已失效", 401);
  let out;
  if (
    path === "command" &&
    typeof body.action === "string" &&
    body.p &&
    typeof body.p === "object"
  )
    out = await client.rpc("command", { action: body.action, p: body.p });
  else if (path === "samples") out = await client.rpc("seed_samples");
  else return fail("不支援的 API", 404);
  if (out.error) return fail(out.error.message, errorStatus(out.error.message));
  if (path === "command" && body.action === "invite") {
    // Invitation commits first. Email delivery failure must not imply rollback.
    const mail = await createClient(url, key, {
      auth: { persistSession: false },
    }).auth.signInWithOtp({
      email: body.p.email,
      options: {
        emailRedirectTo:
          (process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin) + "/login",
      },
    });
    return NextResponse.json({ ...out.data, email_sent: !mail.error });
  }
  return NextResponse.json(out.data, {
    headers: { "Cache-Control": "no-store" },
  });
}
