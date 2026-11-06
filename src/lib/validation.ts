import { z } from "zod";
export function normalizePhone(value: string) {
  const phone = value.replace(/[\s()\-]/g, "").replace(/^\+886/, "0");
  if (!/^09\d{8}$/.test(phone)) throw new Error("請輸入有效的台灣手機號碼");
  return phone;
}
export const registrationSchema = z.object({
  event_id: z.uuid(),
  request_id: z.uuid(),
  dancer: z.string().trim().min(1).max(60),
  phone: z.string().transform(normalizePhone),
  group_ids: z.array(z.uuid()).min(1).max(32),
});
export function scoreValue(value: string) {
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(value) || Number(value) > 100)
    throw new Error("分數須為 0–100，最多兩位小數");
  return Number(value);
}
export function errorStatus(message: string) {
  if (message.startsWith("FORBIDDEN")) return 403;
  if (message.startsWith("UNAUTHORIZED")) return 401;
  if (message.startsWith("CONFLICT")) return 409;
  if (message.startsWith("NOT_FOUND")) return 404;
  if (message.startsWith("RATE_LIMIT")) return 429;
  return 400;
}
