/** Local-only HTTP adapter for exercising the actual SQL with simulated Auth.
 * This is NOT a Supabase implementation and must never be deployed. */
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
async function main() {
  const db = new PGlite();
  const users = [
    { id: "00000000-0000-4000-8000-000000000001", email: "owner@example.test" },
    { id: "00000000-0000-4000-8000-000000000002", email: "judge@example.test" },
    {
      id: "00000000-0000-4000-8000-000000000003",
      email: "outsider@example.test",
    },
  ];
  await db.exec(
    `create schema auth; create role anon; create role authenticated; create role service_role; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`,
  );
  for (const u of users)
    await db.query("insert into auth.users values($1,$2,now())", [
      u.id,
      u.email,
    ]);
  for (const file of (await readdir("supabase/migrations")).sort())
    await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
  const sessions = new Map<string, (typeof users)[number]>();
  function token(user: (typeof users)[number]) {
    const part = (o: unknown) =>
      Buffer.from(JSON.stringify(o)).toString("base64url");
    const t =
      part({ alg: "HS256", typ: "JWT" }) +
      "." +
      part({
        sub: user.id,
        role: "authenticated",
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }) +
      ".local-test-only";
    sessions.set(t, user);
    return t;
  }
  function authUser(u: (typeof users)[number]) {
    return {
      ...u,
      aud: "authenticated",
      role: "authenticated",
      email_confirmed_at: new Date().toISOString(),
      app_metadata: { provider: "email" },
      user_metadata: {},
      created_at: new Date().toISOString(),
      identities: [],
    };
  }
  let queue = Promise.resolve();
  createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:3001");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "authorization,apikey,content-type,x-client-info,x-supabase-api-version",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    res.setHeader("Content-Type", "application/json");
    if (req.method === "OPTIONS") {
      res.end("{}");
      return;
    }
    const reply = (data: unknown, status = 200) => {
      res.statusCode = status;
      res.end(JSON.stringify(data));
    };
    const url = new URL(req.url!, "http://local");
    const access = req.headers.authorization?.replace("Bearer ", "");
    const user = access ? sessions.get(access) : undefined;
    let raw = "";
    for await (const c of req) raw += c;
    let body: Record<string, any> = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      reply({ message: "Invalid JSON" }, 400);
      return;
    }
    if (url.pathname === "/health") {
      reply({ ok: true, simulated: true });
      return;
    }
    if (url.pathname === "/auth/v1/token") {
      const u = users.find((u) => u.email === body.email);
      if (!u || body.password !== "Test-password-123") {
        reply({ msg: "Invalid login credentials" }, 400);
        return;
      }
      reply({
        access_token: token(u),
        refresh_token: "test-refresh-" + u.id,
        token_type: "bearer",
        expires_in: 3600,
        user: authUser(u),
      });
      return;
    }
    if (url.pathname === "/auth/v1/user") {
      if (user) reply(authUser(user));
      else reply({ msg: "Unauthorized" }, 401);
      return;
    }
    if (url.pathname === "/auth/v1/logout" || url.pathname === "/auth/v1/otp") {
      reply({});
      return;
    }
    if (!url.pathname.startsWith("/rest/v1/rpc/")) {
      reply({ message: "Not found" }, 404);
      return;
    }
    const name = url.pathname.split("/").at(-1)!;
    const calls: Record<string, { sql: string; params: unknown[] }> = {
      browse_events: { sql: "select browse_events() r", params: [] },
      workspace: { sql: "select workspace() r", params: [] },
      live_snapshot: { sql: "select live_snapshot($1) r", params: [body.g] },
      command: {
        sql: "select command($1,$2::jsonb) r",
        params: [body.action, JSON.stringify(body.p)],
      },
      seed_samples: { sql: "select seed_samples() r", params: [] },
      register_dancer: {
        sql: "select register_dancer($1::jsonb,$2) r",
        params: [JSON.stringify(body.p), body.fingerprint],
      },
      consume_registration_limit: {
        sql: "select consume_registration_limit($1) r",
        params: [body.fingerprint],
      },
    };
    const call = calls[name];
    if (!call) {
      reply({ message: "Unknown RPC" }, 404);
      return;
    }
    queue = queue.then(async () => {
      try {
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
          user?.id || "",
        ]);
        await db.exec(
          "set role " +
            (access === "test-service-role"
              ? "service_role"
              : user
                ? "authenticated"
                : "anon"),
        );
        try {
          const out = await db.query<{ r: unknown }>(call.sql, call.params);
          reply(out.rows[0].r);
        } finally {
          await db.exec("reset role");
        }
      } catch (e) {
        reply({ message: (e as Error).message, code: "P0001" }, 400);
      }
    });
  }).listen(54329, "127.0.0.1", () =>
    console.log("Simulated Supabase Auth + actual SQL test adapter on :54329"),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
