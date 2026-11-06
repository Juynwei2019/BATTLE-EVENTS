import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty">
      <h1>找不到這個舞台</h1>
      <p>網址可能有誤，或頁面已移動。</p>
      <Link className="button primary" href="/events">
        返回活動探索
      </Link>
    </div>
  );
}
