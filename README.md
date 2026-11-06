# BATTLE EVENTS

繁體中文街舞賽事平台。Next.js App Router / React / TypeScript，Supabase Auth + PostgreSQL，部署到 Vercel。

## 本機開始

```sh
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

開啟 `http://localhost:3000`。尚未填入 Supabase 設定時，只提供標示的【範例】活動瀏覽，所有雲端寫入停用。這不是本機資料庫模式，也不會把 localStorage 當成正式資料。

| 路徑 | 功能 |
| --- | --- |
| `/`、`/events`、`/events/:id` | 活動搜尋、詳情、多組報名、隨機代碼 QR |
| `/checkin` | 分組繳費、報到、相機掃描、搜尋、結束及重開報到 |
| `/judging` | 本人評分、草稿、改分原因、衝突核對、Battle 投票 |
| `/live` | 公開快照、對戰表、列表、冠軍、全螢幕、10 秒更新 |
| `/admin` | 活動組別、團隊邀請、晉級與賽程、公布、備份及稽核 |
| `/login` | 登入、註冊、Email 驗證、重設密碼、接受邀請 |

## 建立 Supabase 專案

1. 建立新的 Supabase 專案。至 SQL Editor **依檔名順序**執行 `supabase/migrations/` 三份 migration；或使用 Supabase CLI link 後 `supabase db push`。不可漏掉 RPC 與授權。
2. 在 Authentication 啟用 Email 登入及信箱驗證，設定 Site URL 與允許的 Redirect URLs：本機 `http://localhost:3000/login`、`http://localhost:3000/login?recovery=1`，以及正式網址的相同路徑。正式環境使用自己的 SMTP，確認寄信限制、寄件網域及驗證信可正常送達。
3. 在 `.env.local` 填入下列值。不要提交 `.env.local`，不要把 service role key 放入瀏覽器變數。

| 變數 | 放置位置 | 用途 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 本機與 Vercel | Supabase 專案 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 本機與 Vercel | 專案 anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | **僅伺服器** | 公開報名及跨請求限流 RPC；工作台不使用此 key |
| `NEXT_PUBLIC_SITE_URL` | 本機與 Vercel | 含協定的網站 URL，末尾不加 `/` |

4. 重啟伺服器。第一位主辦透過 `/login` 建立並驗證帳號；進入 `/admin` 建立活動、組別，再開放報名。
5. Email 邀請先存入資料庫，再由 Supabase Auth 寄出登入信；寄信失敗與「邀請已保存」分開顯示。受邀者必須以對應且已驗證的 Email 登入，在 `/login` **接受邀請**。管理員只能由擁有者邀請。評審與報到人員必須指定組別及有效期間。修改授權時先填原因撤銷，再發出新邀請；兩個動作各自留紀錄。

沒有預設正式帳號、密碼或硬編碼金鑰。`tests/` 中的登入服務是測試替身，**不得部署**。

## Vercel 部署

1. 將程式提交至 GitHub，於 Vercel 匯入 repository。Framework 選 Next.js，Node.js 選 24.x，根目錄為 repository 根。
2. 設定上述四個環境變數。Production / Preview 各自使用對應 Supabase 專案與網站網址。`NEXT_PUBLIC_*` 在建置時載入，變更後需重新部署。
3. 部署。`vercel.json` 已設定 `npm ci`、`npm run build` 及基本標頭；不能純靜態匯出，因為 `/api/*` 需要伺服器。
4. 將部署域名加入 Supabase Auth Redirect URLs，驗證註冊信、邀請信及密碼重設。相機只在 HTTPS 或本機安全環境可用；拒絕授權可改用手動搜尋。
5. 在 Preview 走完下方流程，再切換正式環境。**目前沒有建立或部署任何遠端 Supabase／Vercel 資源。**

## 操作流程

建立活動 → 新增組別與費用／晉級名額 → 設定公開評審陣容 → 邀請並接受指定評審 → 開放報名 → 舞者一次報名多組 → 分組繳費與報到 → 主辦結束本組報到 → 評審完成海選 → 核對分數 → 鎖定晉級並保存隨機首輪配對 → 確認並公布 → 本場投票 → 主辦核對票況並確認勝方 → 另行公布 → 本輪完成後建立下一輪 → 決賽勝方成為冠軍。

- 晉級支援 2 / 4 / 8 / 16 / 32。缺評審、人數不足、漏評、截止線同分都會阻擋。**同分採加賽，由原評審修分並記錄結果與原因，不用隨機或姓名排序決定截止線晉級。**
- 結束報到僅影響所選組別的新增／取消報到，不影響繳費及其他組。已有本組評分、鎖定或賽程時不得重開。報到人員不能結束或重開。
- 評分成功才切換下一位；失敗保留草稿。跨裝置衝突時，按「重新同步」、核對雲端分數，再「核對後沿用草稿輸入」並填改分原因。確認前不覆寫。
- 勝方確認與公開是兩個動作。公開頁只讀最後一次公開快照；暫停會隱藏結果。產生冠軍後停止建輪；已有後續輪次時禁止直接更正前輪。
- 擁有者可匯出含私人資料的完整 JSON 備份。匯入先檢查格式、SHA-256、活動及擁有者，顯示預覽再填原因；DB 再次驗證歸屬並交易還原。**限未鎖定且組別 ID 集合相同的同一活動**，以保留現有組別授權。現有團隊、邀請及稽核紀錄不覆寫。已鎖定備份可匯出保存但不得還原。校驗碼偵測毀損，不是數位簽章；請妥善保管含手機與 QR 代碼的備份。
- 若需遷移舊系統，先提供原始資料格式；本版不猜測或覆蓋舊資料。

## 資料與安全邊界

所有應用表格啟用 RLS，`anon`／`authenticated` 無直接表格讀寫權限。透過受限 RPC 存取；公開只允許 `browse_events` 與 `live_snapshot`。受保護 RPC 使用驗證 JWT 的 `auth.uid()`，逐次驗證活動、組別、角色與授權時間。service role 僅用於公開報名 API。不能為了前端讀資料而取消 RLS。

每次操作在 PostgreSQL 交易內鎖定活動／組別；評分、投票、報到與重要設定採版本條件寫入。報名使用 `(event,phone)` 與 `(event,request_id)` 唯一限制；重送回傳原結果，但同代碼變更內容會拒絕。限流以伺服器 HMAC 匿名化 IP，每分鐘最多 10 次有效格式報名嘗試，獨立交易記錄失敗寫入。正式部署搭配 Vercel Firewall 邊緣限流及 Supabase Auth 寄信限制；非 Vercel 自架時需可信代理提供 `x-forwarded-for`。

工作台每 20 秒於頁面可見時同步，也能手動同步。此版使用輪詢，不依賴 Realtime。同場寫入依活動序列化，正式大型賽事需另做負載測試。

## 測試與範例

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
# 已有系統 Chromium 時：
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e
```

資料庫測試在 PGlite（PostgreSQL WASM）執行**相同 migrations 與 RPC**。瀏覽器測試使用獨立 `.next-e2e` 及 3001 port，以本機 HTTP adapter 模擬 Supabase Auth／PostgREST，實際執行 SQL。模擬登入不是正式 Auth／SMTP 驗證。相機實機、多人負載、真實 Supabase 連線與 Vercel 正式部署須另驗收；見 [驗收紀錄](docs/verification.md)。

登入後 `/admin` 的「產生範例情境」建立五場【範例】活動：24 人報到、海選正常、截止線同分、漏評、8 強 Battle。重複執行沿用既有資料，不重設進度。手機及舞名均為合成資料。

## API

- `GET /api/events`：公開活動白名單。
- `POST /api/register`：`event_id,dancer,phone,group_ids,request_id`，無需登入。
- `GET /api/live?group=<uuid>`：已公布快照或等待狀態。
- `GET /api/workspace`：本人授權範圍的工作台。
- `POST /api/command`：`{action,p}`，使用 Bearer token，實作於 `public.command`。
- `POST /api/samples`：本人專用的冪等合成資料產生器。

HTTP 401＝登入失效、403＝無權限、409＝舊版本或重複資料、429＝限流、503＝連線尚未設定；其他驗證或流程鎖定以 400 搭配原因回應。不得將 private workspace 回應存入 CDN 快取。
