import { notFound } from "next/navigation";
import { Events, EventDetail } from "@/components/events";
import { Checkin } from "@/components/checkin";
import { Judging } from "@/components/judging";
import { Live } from "@/components/live";
import { Admin } from "@/components/admin";
import { Login } from "@/components/login";
export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug = [] } = await params;
  const [path, id] = slug;
  if (slug.length > 2) return notFound();
  if (!path || path === "events")
    return id ? <EventDetail id={id} /> : <Events />;
  if (id) return notFound();
  if (path === "checkin") return <Checkin />;
  if (path === "judging") return <Judging />;
  if (path === "live") return <Live />;
  if (path === "admin") return <Admin />;
  if (path === "login") return <Login />;
  return notFound();
}
