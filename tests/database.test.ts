import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const db = new PGlite();
const owner = "00000000-0000-4000-8000-000000000001",
  judge = "00000000-0000-4000-8000-000000000002",
  staff = "00000000-0000-4000-8000-000000000003",
  outsider = "00000000-0000-4000-8000-000000000004";
async function actor(id: string) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function rpc(action: string, p: object) {
  const r = await db.query<{ result: Record<string, any> }>(
    "select public.command($1,$2::jsonb) result",
    [action, JSON.stringify(p)],
  );
  return r.rows[0].result;
}
async function workspace() {
  return (await db.query<{ result: any }>("select workspace() result")).rows[0]
    .result;
}
before(async () => {
  await db.exec(
    `create schema auth; create role anon; create role authenticated; create role service_role; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`,
  );
  for (const [id, email] of [
    [owner, "owner@example.test"],
    [judge, "judge@example.test"],
    [staff, "staff@example.test"],
    [outsider, "outsider@example.test"],
  ])
    await db.query("insert into auth.users values($1,$2,now())", [id, email]);
  await db.exec(
    await readFile("supabase/migrations/202611060001_core.sql", "utf8"),
  );
  await db.exec(
    await readFile("supabase/migrations/202611060002_samples.sql", "utf8"),
  );
  await db.exec(
    await readFile("supabase/migrations/202611060003_rate_limit.sql", "utf8"),
  );
});
test("complete transactional workflow, access boundaries, conflicts and public privacy", async () => {
  await actor(owner);
  const ev = await rpc("create_event", {
    title: "【範例】整合測試",
    city: "台北",
    venue: "測試",
    starts_at: "2030-12-01T12:00:00Z",
    deadline: "2030-11-30T12:00:00Z",
  });
  const eid = ev.id;
  await rpc("create_group", {
    event_id: eid,
    name: "Hip Hop",
    style: "Hip Hop",
    fee: 400,
    slots: 2,
  });
  await rpc("create_group", {
    event_id: eid,
    name: "All Style",
    style: "All Style",
    fee: 500,
    slots: 2,
  });
  await rpc("edit_event", {
    event_id: eid,
    version: 1,
    registration_open: true,
  });
  let w = await workspace();
  let g = w.groups.find((x: any) => x.name === "Hip Hop"),
    other = w.groups.find((x: any) => x.name === "All Style");
  for (const [email, role, group_ids] of [
    ["judge@example.test", "judge", [g.id]],
    ["staff@example.test", "checkin", [g.id]],
  ] as const) {
    await rpc("invite", {
      event_id: eid,
      email,
      role,
      group_ids,
      starts_at: "2020-01-01",
      ends_at: "2035-01-01",
    });
  }
  for (const uid of [judge, staff]) {
    await actor(uid);
    w = await workspace();
    assert.equal(w.invitations.length, 1);
    await rpc("accept_invite", { invitation_id: w.invitations[0].id });
  }
  const request = "10000000-0000-4000-8000-000000000001";
  const payload = {
    event_id: eid,
    dancer: "Dancer A",
    phone: "+886 912-345-678",
    group_ids: [g.id, other.id],
    request_id: request,
  };
  const reg = async (p: object) =>
    (
      await db.query<{ r: any }>("select register_dancer($1::jsonb,$2) r", [
        JSON.stringify(p),
        "test-fingerprint-00000000000000000000001",
      ])
    ).rows[0].r;
  const first = await reg(payload);
  assert.deepEqual(await reg(payload), first);
  await assert.rejects(
    reg({ ...payload, request_id: crypto.randomUUID() }),
    /已報名/,
  );
  await assert.rejects(reg({ ...payload, dancer: "Changed" }), /內容不同/);
  for (let i = 2; i <= 3; i++)
    await reg({
      ...payload,
      dancer: `Dancer ${i}`,
      phone: `091234567${i}`,
      group_ids: [g.id],
      request_id: crypto.randomUUID(),
    });
  await actor(staff);
  w = await workspace();
  assert.equal(w.groups.length, 1);
  assert.equal(w.entries.length, 3);
  await assert.rejects(
    rpc("close_checkin", { event_id: eid, group_id: g.id, version: 1 }),
    /FORBIDDEN/,
  );
  await assert.rejects(
    rpc("checkin", {
      event_id: eid,
      group_id: other.id,
      entry_id: w.entries[0].id,
      version: 1,
    }),
    /FORBIDDEN/,
  );
  for (const e of w.entries)
    await rpc("checkin", {
      event_id: eid,
      group_id: g.id,
      entry_id: e.id,
      version: 1,
    });
  await assert.rejects(
    rpc("payment", {
      event_id: eid,
      group_id: g.id,
      entry_id: w.entries[0].id,
      version: 1,
      paid: true,
    }),
    /CONFLICT/,
  );
  await actor(owner);
  await rpc("close_checkin", { event_id: eid, group_id: g.id, version: 1 });
  w = await workspace();
  assert.equal(w.groups.find((x: any) => x.id === other.id).closed_at, null);
  const e = w.entries.find((x: any) => x.group_id === g.id);
  await rpc("payment", {
    event_id: eid,
    group_id: g.id,
    entry_id: e.id,
    version: 2,
    paid: true,
  });
  await assert.rejects(
    rpc("checkin", {
      event_id: eid,
      group_id: g.id,
      entry_id: e.id,
      version: 3,
    }),
    /CLOSED/,
  );
  await assert.rejects(
    rpc("lock", { event_id: eid, group_id: g.id, version: 2 }),
    /漏評/,
  );
  await actor(judge);
  w = await workspace();
  assert.ok(
    w.entries.every(
      (x: any) => !("phone" in x) && !("paid" in x) && !("token" in x),
    ),
  );
  const es = w.entries;
  await rpc("score", {
    event_id: eid,
    group_id: g.id,
    entry_id: es[0].id,
    version: 0,
    score: 90,
    comment: "私人評語",
  });
  await assert.rejects(
    rpc("score", {
      event_id: eid,
      group_id: g.id,
      entry_id: es[0].id,
      version: 0,
      score: 91,
    }),
    /CONFLICT/,
  );
  await assert.rejects(
    rpc("score", {
      event_id: eid,
      group_id: g.id,
      entry_id: es[0].id,
      version: 1,
      score: 91,
    }),
    /原因/,
  );
  await rpc("score", {
    event_id: eid,
    group_id: g.id,
    entry_id: es[1].id,
    version: 0,
    score: 80,
  });
  await rpc("score", {
    event_id: eid,
    group_id: g.id,
    entry_id: es[2].id,
    version: 0,
    score: 80,
  });
  await assert.rejects(
    rpc("score", {
      event_id: eid,
      group_id: g.id,
      entry_id: es[2].id,
      version: 1,
      score: 80.123,
      reason: "加賽",
    }),
    /兩位小數/,
  );
  await actor(owner);
  await assert.rejects(
    rpc("reopen_checkin", {
      event_id: eid,
      group_id: g.id,
      version: 2,
      reason: "測試",
    }),
    /LOCKED/,
  );
  await assert.rejects(
    rpc("lock", { event_id: eid, group_id: g.id, version: 2 }),
    /TIE/,
  );
  await actor(judge);
  await rpc("score", {
    event_id: eid,
    group_id: g.id,
    entry_id: es[2].id,
    version: 1,
    score: 79,
    reason: "原評審加賽結果",
  });
  await actor(owner);
  await rpc("lock", { event_id: eid, group_id: g.id, version: 2 });
  w = await workspace();
  const match = w.matches[0];
  await assert.rejects(
    rpc("lock", { event_id: eid, group_id: g.id, version: 2 }),
    /CONFLICT/,
  );
  await rpc("lock", { event_id: eid, group_id: g.id, version: 3 });
  assert.deepEqual((await workspace()).matches, [match]);
  await actor(judge);
  await assert.rejects(
    rpc("score", {
      event_id: eid,
      group_id: g.id,
      entry_id: es[0].id,
      version: 1,
      score: 99,
      reason: "改分",
    }),
    /LOCKED/,
  );
  await rpc("vote", {
    event_id: eid,
    group_id: g.id,
    match_id: match.id,
    entry_id: match.a,
    version: 0,
  });
  await rpc("vote", {
    event_id: eid,
    group_id: g.id,
    match_id: match.id,
    entry_id: match.b,
    version: 1,
  });
  await actor(owner);
  await rpc("publish", { event_id: eid, group_id: g.id, version: 3 });
  const snapshot = async () =>
    (await db.query<{ r: any }>("select live_snapshot($1) r", [g.id])).rows[0]
      .r;
  let snap = await snapshot();
  assert.ok(
    !/phone|paid|comment|judge_id|actor|email|lookup_token/.test(
      JSON.stringify(snap),
    ),
  );
  await rpc("confirm_winner", {
    event_id: eid,
    group_id: g.id,
    match_id: match.id,
    entry_id: match.b,
    version: 1,
  });
  assert.equal((await snapshot()).data.matches[0].winner, null);
  await rpc("publish", { event_id: eid, group_id: g.id, version: 5 });
  assert.equal((await snapshot()).data.matches[0].winner, match.b);
  await assert.rejects(
    rpc("next_round", { event_id: eid, group_id: g.id, version: 6 }),
    /冠軍/,
  );
  await rpc("pause", { event_id: eid, group_id: g.id, version: 6 });
  assert.deepEqual(await snapshot(), { published: false });
  await actor(outsider);
  assert.equal((await workspace()).events.length, 0);
  await assert.rejects(rpc("backup", { event_id: eid }), /FORBIDDEN/);
  await actor(owner);
  w = await workspace();
  const staffMember = w.memberships.find((x: any) => x.user_id === staff);
  await rpc("revoke_member", {
    event_id: eid,
    membership_id: staffMember.id,
    reason: "工作結束",
  });
  await actor(staff);
  assert.equal((await workspace()).entries.length, 0);
  await actor("");
  await assert.rejects(workspace(), /UNAUTHORIZED/);
  await db.exec("set role anon");
  await assert.rejects(
    db.query("select * from registrations"),
    /permission denied/,
  );
  await db.exec("reset role");
});
test("sample scenarios are idempotent and have real lock diagnostics", async () => {
  await actor(owner);
  await db.query("select seed_samples()");
  const a = await workspace();
  await db.query("select seed_samples()");
  const b = await workspace();
  assert.equal(a.events.length, b.events.length);
  for (const [name, expected] of [
    ["海選正常", null],
    ["海選截止線同分", /TIE/],
    ["海選漏評", /漏評/],
  ] as const) {
    const ev = b.events.find((x: any) => x.title === "【範例】" + name);
    const g = b.groups.find(
      (x: any) => x.event_id === ev.id && x.name.startsWith("All"),
    );
    const promise = rpc("lock", {
      event_id: ev.id,
      group_id: g.id,
      version: g.version,
    });
    if (expected) await assert.rejects(promise, expected);
    else await promise;
  }
});

test("8-to-4-to-2 bracket, later rounds prevent corrections, and champion stops advancement", async () => {
  await actor(owner);
  const w = await workspace();
  const ev = w.events.find((e: any) => e.title === "【範例】8 強 Battle 現場");
  let g = w.groups.find(
    (g: any) => g.event_id === ev.id && g.name.startsWith("All"),
  );
  for (const round of [1, 2, 3]) {
    const roundMatches = (await workspace()).matches.filter(
      (m: any) => m.group_id === g.id && m.round === round,
    );
    assert.equal(roundMatches.length, 2 ** (3 - round));
    for (const m of roundMatches)
      await rpc("confirm_winner", {
        event_id: ev.id,
        group_id: g.id,
        match_id: m.id,
        version: m.version,
        entry_id: m.a,
      });
    g = (await workspace()).groups.find((x: any) => x.id === g.id);
    if (round < 3) {
      await rpc("next_round", {
        event_id: ev.id,
        group_id: g.id,
        version: g.version,
      });
      const first = roundMatches[0];
      await assert.rejects(
        rpc("confirm_winner", {
          event_id: ev.id,
          group_id: g.id,
          match_id: first.id,
          version: first.version + 1,
          entry_id: first.b,
          reason: "更正",
        }),
        /後續輪次/,
      );
    } else
      await assert.rejects(
        rpc("next_round", {
          event_id: ev.id,
          group_id: g.id,
          version: g.version,
        }),
        /冠軍/,
      );
  }
  const final = (await workspace()).matches.filter(
    (m: any) => m.group_id === g.id,
  );
  assert.equal(final.length, 7);
});
test("owner backup restore is atomic, scoped, retains permissions and audit, and validates foreign references", async () => {
  await actor(owner);
  const w = await workspace();
  const ev = w.events.find((e: any) => e.title === "【範例】24 位舞者報到演練");
  const g = w.groups.find(
    (g: any) => g.event_id === ev.id && g.name.startsWith("All"),
  );
  const backup = await rpc("backup", { event_id: ev.id });
  const before = (await workspace()).audit.length;
  const entry = w.entries.find((e: any) => e.group_id === g.id);
  await rpc("payment", {
    event_id: ev.id,
    group_id: g.id,
    entry_id: entry.id,
    version: entry.version,
    paid: !entry.paid,
  });
  await rpc("restore", { event_id: ev.id, backup, reason: "還原演練" });
  const restored = await workspace();
  assert.equal(
    restored.entries.find((e: any) => e.id === entry.id).paid,
    entry.paid,
  );
  assert.ok(restored.audit.length > before);
  assert.equal(
    restored.memberships.filter((m: any) => m.event_id === ev.id).length,
    w.memberships.filter((m: any) => m.event_id === ev.id).length,
  );
  const corrupted = structuredClone(backup);
  corrupted.entries[0].group_id = w.groups.find(
    (x: any) => x.event_id !== ev.id,
  ).id;
  await assert.rejects(
    rpc("restore", { event_id: ev.id, backup: corrupted, reason: "測試" }),
    /不屬於/,
  );
  assert.equal(
    (await workspace()).entries.filter((e: any) => e.group_id === g.id).length,
    24,
  );
  await actor(staff);
  await assert.rejects(
    rpc("restore", { event_id: ev.id, backup, reason: "越權" }),
    /FORBIDDEN/,
  );
  await actor(owner);
  const locked = w.events.find(
    (e: any) => e.title === "【範例】8 強 Battle 現場",
  );
  const lockedBackup = await rpc("backup", { event_id: locked.id });
  await assert.rejects(
    rpc("restore", {
      event_id: locked.id,
      backup: lockedBackup,
      reason: "不允許",
    }),
    /不可還原/,
  );
});
test("invitation email ownership, confirmation, expiry and per-activity roles are enforced", async () => {
  await actor(owner);
  const w = await workspace();
  const ev = w.events.find((e: any) => e.title === "【範例】24 位舞者報到演練");
  const invite = await rpc("invite", {
    event_id: ev.id,
    email: "outsider@example.test",
    role: "admin",
    group_ids: [],
    starts_at: "2020-01-01",
    ends_at: "2035-01-01",
  });
  await actor(judge);
  await assert.rejects(
    rpc("accept_invite", { invitation_id: invite.id }),
    /FORBIDDEN/,
  );
  await actor(outsider);
  await db.query("update auth.users set email_confirmed_at=null where id=$1", [
    outsider,
  ]);
  await assert.rejects(
    rpc("accept_invite", { invitation_id: invite.id }),
    /FORBIDDEN/,
  );
  await db.query("update auth.users set email_confirmed_at=now() where id=$1", [
    outsider,
  ]);
  await rpc("accept_invite", { invitation_id: invite.id });
  await assert.rejects(rpc("backup", { event_id: ev.id }), /擁有者/);
  await assert.rejects(
    rpc("invite", {
      event_id: ev.id,
      email: "staff@example.test",
      role: "admin",
      group_ids: [],
      starts_at: "2020-01-01",
      ends_at: "2035-01-01",
    }),
    /擁有者/,
  );
  await actor(owner);
  const member = (await workspace()).memberships.find(
    (m: any) => m.event_id === ev.id && m.user_id === outsider,
  );
  await rpc("revoke_member", {
    event_id: ev.id,
    membership_id: member.id,
    reason: "演練完成",
  });
  await actor(outsider);
  assert.equal((await workspace()).events.length, 0);
});
test("public registration rate limit persists rejected attempts and private RPC grants deny browser access", async () => {
  const fingerprint = "rate-test-00000000000000000000000000000";
  for (let i = 0; i < 10; i++)
    assert.equal(
      (
        await db.query<{ r: boolean }>(
          "select consume_registration_limit($1) r",
          [fingerprint],
        )
      ).rows[0].r,
      true,
    );
  assert.equal(
    (
      await db.query<{ r: boolean }>(
        "select consume_registration_limit($1) r",
        [fingerprint],
      )
    ).rows[0].r,
    false,
  );
  await db.exec("set role authenticated");
  await assert.rejects(
    db.query("select register_dancer($1::jsonb,$2)", [
      JSON.stringify({}),
      fingerprint,
    ]),
    /permission denied/,
  );
  await assert.rejects(
    db.query("select can_access($1,$2)", [crypto.randomUUID(), ["admin"]]),
    /permission denied/,
  );
  await db.exec("reset role");
});
test("lock rejects missing judges and insufficient attendance; another activity owner has no inherited access", async () => {
  await actor(outsider);
  const ev = await rpc("create_event", {
    title: "【範例】獨立主辦測試",
    city: "台北",
    venue: "合成場地",
    starts_at: "2030-12-01",
    deadline: "2030-11-30",
  });
  await rpc("create_group", {
    event_id: ev.id,
    name: "Breaking",
    style: "Breaking",
    fee: 0,
    slots: 2,
  });
  let w = await workspace();
  const g = w.groups.find((g: any) => g.event_id === ev.id);
  await rpc("close_checkin", {
    event_id: ev.id,
    group_id: g.id,
    version: g.version,
  });
  await assert.rejects(
    rpc("lock", { event_id: ev.id, group_id: g.id, version: g.version + 1 }),
    /評審/,
  );
  const invite = await rpc("invite", {
    event_id: ev.id,
    email: "judge@example.test",
    role: "judge",
    group_ids: [g.id],
    starts_at: "2020-01-01",
    ends_at: "2035-01-01",
  });
  await actor(judge);
  await rpc("accept_invite", { invitation_id: invite.id });
  await actor(outsider);
  await assert.rejects(
    rpc("lock", { event_id: ev.id, group_id: g.id, version: g.version + 1 }),
    /人數不足/,
  );
  await actor(owner);
  assert.equal(
    (await workspace()).events.some((e: any) => e.id === ev.id),
    false,
  );
  await assert.rejects(
    rpc("edit_event", { event_id: ev.id, version: 1, title: "非法修改" }),
    /FORBIDDEN/,
  );
});
after(async () => db.close());
