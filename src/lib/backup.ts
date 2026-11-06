export async function checksum(data: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function validateBackup(
  file: File,
  eventId: string,
  ownerId: string,
) {
  if (file.size > 2_500_000) throw new Error("備份檔案超過 2.5 MB");
  const envelope = JSON.parse(await file.text());
  if (
    envelope.format !== "battle-events/1" ||
    typeof envelope.checksum !== "string" ||
    !envelope.data
  )
    throw new Error("不支援的備份格式");
  if ((await checksum(envelope.data)) !== envelope.checksum)
    throw new Error("檔案驗證失敗：資料校驗碼不符");
  const b = envelope.data;
  if (b.schema !== 1 || b.event_id !== eventId || b.owner_id !== ownerId)
    throw new Error("備份版本、活動或擁有者不符");
  for (const key of [
    "groups",
    "registrations",
    "entries",
    "scores",
    "score_history",
    "matches",
    "votes",
    "snapshots",
    "memberships",
    "invitations",
    "audit",
  ])
    if (!Array.isArray(b[key])) throw new Error("備份缺少 " + key);
  if (!b.event || b.event.id !== eventId) throw new Error("活動內容不符");
  if (
    b.matches.length ||
    b.groups.some((g: { locked_at?: string }) => g.locked_at)
  )
    throw new Error("此備份含已鎖定晉級或賽程，僅能保存，不能還原");
  return b;
}
