# VibeChooser Server 🎲

> 極簡投票房間後端 — 零 Database、純 In-Memory 架構，專為 Android App 即時測試設計。

## Quick Start

```bash
npm install
npm start
```

Server 預設跑在 `http://localhost:3000`。

---

## API 端點

### `GET /`
Health check，回傳服務狀態與活躍房間數。

---

### `POST /api/rooms` — 創建房間

```json
{
  "owner_id": "user_001",
  "topic": "食飯",
  "title": "今晚食咩好？",
  "is_blind_box": true,
  "options": ["火鍋", "壽司", "Pizza", "燒肉"]
}
```

**Response** `201`:
```json
{
  "success": true,
  "room_id": "ABCXYZ",
  "message": "房間已建立！分享 Room ID「ABCXYZ」給朋友加入。"
}
```

---

### `GET /api/rooms/:id` — 獲取房間詳情

盲盒模式（`is_blind_box: true`）+ 投票中時，選項名稱會被遮蔽為 `❓ 驚喜選項 1` 等。

---

### `POST /api/rooms/:id/vote` — 提交投票

```json
{
  "userId": "user_002",
  "option_id": 1,
  "type": "like"
}
```

- `type` 可為 `"like"` 或 `"veto"`
- 每人每房間限一次 Veto ❌
- 可對多個選項投 Like 👍

---

### `POST /api/rooms/:id/end` — 結束投票

```json
{
  "owner_id": "user_001"
}
```

只有房主可以結束投票。結束後回傳完整解密結果與推薦選項。

---

## Deploy to Render

1. Push 到 GitHub
2. 在 [Render](https://render.com) 建立 **Web Service**
3. 設定：
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: `Node`
4. 完成！Render 會自動偵測 `PORT` 環境變數。
