import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizePhone,
  scoreValue,
  registrationSchema,
  errorStatus,
} from "../src/lib/validation";
import { checksum, validateBackup } from "../src/lib/backup";
test("Taiwan mobile normalization and precise scores reject invalid inputs", () => {
  assert.equal(normalizePhone("+886 (912) 345-678"), "0912345678");
  for (const phone of ["1234", "+861234567890", "09123456789", "abcdefghij"])
    assert.throws(() => normalizePhone(phone));
  for (const value of ["-1", "100.01", "90.001", "NaN", "Infinity", "1e2", ""])
    assert.throws(() => scoreValue(value));
  assert.equal(scoreValue("99.99"), 99.99);
  assert.equal(scoreValue("0"), 0);
  assert.equal(scoreValue("100.00"), 100);
  assert.throws(() =>
    registrationSchema.parse({
      dancer: "A",
      phone: "0912345678",
      group_ids: [],
    }),
  );
  assert.equal(errorStatus("CONFLICT: stale"), 409);
  assert.equal(errorStatus("FORBIDDEN: no"), 403);
});
test("backup detects corruption, wrong activity and unsupported schemas", async () => {
  const data = {
    schema: 1,
    event_id: "e",
    owner_id: "o",
    event: { id: "e" },
    groups: [],
    registrations: [],
    entries: [],
    scores: [],
    score_history: [],
    matches: [],
    votes: [],
    snapshots: [],
    memberships: [],
    invitations: [],
    audit: [],
  };
  const envelope = {
    format: "battle-events/1",
    checksum: await checksum(data),
    data,
  };
  const file = () => new File([JSON.stringify(envelope)], "backup.json");
  assert.deepEqual(await validateBackup(file(), "e", "o"), data);
  await assert.rejects(validateBackup(file(), "other", "o"), /不符/);
  envelope.data.event.id = "tampered";
  await assert.rejects(validateBackup(file(), "e", "o"), /校驗碼/);
});
