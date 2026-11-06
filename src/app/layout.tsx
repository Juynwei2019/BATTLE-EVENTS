import type { Metadata } from "next";
import { Provider } from "@/components/provider";
import { Shell } from "@/components/shell";
import "./globals.css";
export const metadata: Metadata = {
  title: "BATTLE EVENTS｜街舞賽事平台",
  description: "探索街舞賽事、報名參賽、現場報到、評分與 Battle 賽況。",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant">
      <body>
        <Provider>
          <Shell>{children}</Shell>
        </Provider>
      </body>
    </html>
  );
}
