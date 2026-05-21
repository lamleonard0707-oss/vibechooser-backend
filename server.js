const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================
// In-Memory Storage — 零 Database 架構
// ============================================================
// rooms = {
//   "ABCXYZ": {
//     id: "ABCXYZ",
//     topic: "食飯",
//     title: "今晚食咩好？",
//     is_blind_box: true,
//     status: "voting" | "ended",
//     owner_id: "user_001",
//     created_at: "2026-05-21T...",
//     options: [
//       { id: 1, name: "火鍋", likes: ["user_002", "user_003"], vetoes: ["user_004"] },
//       ...
//     ],
//     voters: {
//       "user_002": { has_vetoed: false },
//       "user_004": { has_vetoed: true },
//     }
//   }
// }
const rooms = {};

// ============================================================
// Helpers
// ============================================================

/**
 * 產生一個隨機 6 位大寫字母的 Room ID，並確保不重複。
 */
function generateRoomId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let id;
  do {
    id = "";
    for (let i = 0; i < 6; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms[id]); // 碰撞檢查
  return id;
}

/**
 * 將選項列表套用盲盒遮蔽，隱藏真實名稱。
 * 投票人數（likes / vetoes 長度）仍然會回傳，但名稱被替換。
 */
function maskOptions(options) {
  return options.map((opt, idx) => ({
    id: opt.id,
    name: `❓ 驚喜選項 ${idx + 1}`,
    description: "",
    url: "",
    imageUrl: "",
    likes_count: opt.likes.length,
    vetoes_count: opt.vetoes.length,
  }));
}

/**
 * 把選項格式化為完整的公開版本（含真實名稱 + 統計 + 詳細資訊）。
 */
function revealOptions(options) {
  return options.map((opt) => ({
    id: opt.id,
    name: opt.name,
    description: opt.description || "",
    url: opt.url || "",
    imageUrl: opt.imageUrl || "",
    likes_count: opt.likes.length,
    vetoes_count: opt.vetoes.length,
    liked_by: opt.likes,
    vetoed_by: opt.vetoes,
  }));
}

// ============================================================
// API Endpoints
// ============================================================

// --------------------------------------------------
// 1) POST /api/rooms — 創建房間
// --------------------------------------------------
app.post("/api/rooms", (req, res) => {
  const { topic, title, is_blind_box, options, owner_id, owner_nickname } = req.body;

  // --- 基礎驗證 ---
  if (!topic || !title || !owner_id || !owner_nickname) {
    return res.status(400).json({
      success: false,
      error: "缺少必填欄位：topic, title, owner_id, owner_nickname",
    });
  }

  if (!Array.isArray(options) || options.length < 2) {
    return res.status(400).json({
      success: false,
      error: "至少需要提供 2 個選項",
    });
  }

  const roomId = generateRoomId();

  const room = {
    id: roomId,
    topic,
    title,
    is_blind_box: !!is_blind_box,
    status: "voting",
    owner_id,
    created_at: new Date().toISOString(),
    options: options.map((opt, idx) => ({
      id: idx + 1,
      name: opt.name || opt, // 兼容舊版純字串
      description: opt.description || "",
      url: opt.url || "",
      imageUrl: opt.imageUrl || "",
      likes: [],
      vetoes: [],
    })),
    voters: {
      [owner_id]: { nickname: owner_nickname, has_vetoed: false }
    },
  };

  rooms[roomId] = room;

  return res.status(201).json({
    success: true,
    room_id: roomId,
    message: `房間已建立！分享 Room ID「${roomId}」給朋友加入。`,
  });
});

// --------------------------------------------------
// 2) GET /api/rooms/:id — 獲取房間詳情
//    盲盒模式 + 投票中 → 遮蔽選項名稱
// --------------------------------------------------
app.get("/api/rooms/:id", (req, res) => {
  const roomId = req.params.id.toUpperCase();
  const room = rooms[roomId];

  if (!room) {
    return res.status(404).json({
      success: false,
      error: "找不到該房間，請確認 Room ID 是否正確。",
    });
  }

  // 決定是否遮蔽
  const shouldMask = room.is_blind_box && room.status === "voting";

  const payload = {
    success: true,
    room: {
      id: room.id,
      topic: room.topic,
      title: room.title,
      is_blind_box: room.is_blind_box,
      status: room.status,
      owner_id: room.owner_id,
      created_at: room.created_at,
      total_voters: Object.keys(room.voters).length,
      voters: room.voters,
      options: shouldMask
        ? maskOptions(room.options)
        : revealOptions(room.options),
    },
  };

  return res.json(payload);
});

// --------------------------------------------------
// 3) POST /api/rooms/:id/join — 加入房間
//    Body: { userId, nickname }
// --------------------------------------------------
app.post("/api/rooms/:id/join", (req, res) => {
  const roomId = req.params.id.toUpperCase();
  const room = rooms[roomId];

  if (!room) {
    return res.status(404).json({ success: false, error: "找不到該房間。" });
  }

  const { userId, nickname } = req.body;
  if (!userId || !nickname) {
    return res.status(400).json({ success: false, error: "缺少 userId 或 nickname" });
  }

  // 註冊用戶到房間
  if (!room.voters[userId]) {
    room.voters[userId] = { nickname, has_vetoed: false };
  } else {
    // 允許更新暱稱
    room.voters[userId].nickname = nickname;
  }

  return res.json({
    success: true,
    message: "成功加入房間",
    room: {
      id: room.id,
      topic: room.topic,
      title: room.title,
      is_blind_box: room.is_blind_box,
      status: room.status,
      owner_id: room.owner_id,
      created_at: room.created_at,
      total_voters: Object.keys(room.voters).length,
      voters: room.voters,
      options: room.is_blind_box && room.status === "voting"
        ? maskOptions(room.options)
        : revealOptions(room.options),
    }
  });
});

// --------------------------------------------------
// 4) POST /api/rooms/:id/vote — 提交投票
//    Body: { userId, option_id, type: "like" | "veto" }
// --------------------------------------------------
app.post("/api/rooms/:id/vote", (req, res) => {
  const roomId = req.params.id.toUpperCase();
  const room = rooms[roomId];

  if (!room) {
    return res.status(404).json({ success: false, error: "房間不存在。" });
  }

  if (room.status !== "voting") {
    return res.status(400).json({
      success: false,
      error: "投票已結束，無法再提交。",
    });
  }

  const { userId, option_id, type } = req.body;

  if (!userId || !option_id || !type) {
    return res.status(400).json({
      success: false,
      error: "缺少必填欄位：userId, option_id, type",
    });
  }

  if (type !== "like" && type !== "veto") {
    return res.status(400).json({
      success: false,
      error: "type 只能是 \"like\" 或 \"veto\"。",
    });
  }

  // 找到對應選項
  const option = room.options.find((o) => o.id === option_id);
  if (!option) {
    return res.status(400).json({
      success: false,
      error: `選項 ID ${option_id} 不存在。`,
    });
  }

  // 初始化投票者記錄（如果未曾調用 join）
  if (!room.voters[userId]) {
    room.voters[userId] = { nickname: "Unknown User", has_vetoed: false };
  }

  const voter = room.voters[userId];

  // --- 處理 Like ---
  if (type === "like") {
    // 防止同一用戶對同一選項重複 like
    if (option.likes.includes(userId)) {
      return res.status(400).json({
        success: false,
        error: "你已經對這個選項投過 👍 Like 了。",
      });
    }

    option.likes.push(userId);

    return res.json({
      success: true,
      message: `👍 已為「選項 ${option_id}」投下 Like！`,
    });
  }

  // --- 處理 Veto ---
  if (type === "veto") {
    // 每人每房間僅限 1 次 Veto
    if (voter.has_vetoed) {
      return res.status(400).json({
        success: false,
        error: "你在這個房間已經使用過 ❌ Veto（一票否決）了，每人限用一次。",
      });
    }

    // 防止同一用戶對同一選項重複 veto（理論上被上面擋住，但多一層保險）
    if (option.vetoes.includes(userId)) {
      return res.status(400).json({
        success: false,
        error: "你已經對這個選項投過 ❌ Veto 了。",
      });
    }

    option.vetoes.push(userId);
    voter.has_vetoed = true;

    return res.json({
      success: true,
      message: `❌ 已對「選項 ${option_id}」行使 Veto！`,
    });
  }
});

// --------------------------------------------------
// 5) POST /api/rooms/:id/end — 結束投票
//    Body: { owner_id }
// --------------------------------------------------
app.post("/api/rooms/:id/end", (req, res) => {
  const roomId = req.params.id.toUpperCase();
  const room = rooms[roomId];

  if (!room) {
    return res.status(404).json({ success: false, error: "房間不存在。" });
  }

  if (room.status === "ended") {
    return res.status(400).json({
      success: false,
      error: "投票已經結束了。",
    });
  }

  const { owner_id } = req.body;

  // 只有房主才能結束投票
  if (owner_id !== room.owner_id) {
    return res.status(403).json({
      success: false,
      error: "只有房主才能結束投票。",
    });
  }

  // 變更狀態
  room.status = "ended";

  // --- 計算結果 ---
  // 排序邏輯：先按 likes 降序，再按 vetoes 升序
  const sortedOptions = revealOptions(room.options).sort((a, b) => {
    if (b.likes_count !== a.likes_count) return b.likes_count - a.likes_count;
    return a.vetoes_count - b.vetoes_count;
  });

  // 找出得票最高且未被 veto 的選項作為推薦
  const recommended = sortedOptions.find((o) => o.vetoes_count === 0) || sortedOptions[0];

  return res.json({
    success: true,
    message: "🎉 投票已結束！以下是完整結果：",
    room: {
      id: room.id,
      topic: room.topic,
      title: room.title,
      is_blind_box: room.is_blind_box,
      status: room.status,
      total_voters: Object.keys(room.voters).length,
      voters: room.voters,
      options: sortedOptions,
      recommended: {
        option_id: recommended.id,
        name: recommended.name,
        reason:
          recommended.vetoes_count === 0
            ? `👑 最高票且零否決 (${recommended.likes_count} 👍)`
            : `👑 最高票 (${recommended.likes_count} 👍, ${recommended.vetoes_count} ❌)`,
      },
    },
  });
});

// ============================================================
// Health Check (Render 部署用)
// ============================================================
app.get("/", (_req, res) => {
  res.json({
    service: "VibeChooser API",
    status: "running",
    version: "1.0.0",
    active_rooms: Object.keys(rooms).length,
  });
});

// ============================================================
// Start Server
// ============================================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n🎲 VibeChooser Server is running!`);
  console.log(`   Local:  http://localhost:${PORT}`);
  console.log(`   Rooms:  ${Object.keys(rooms).length} active\n`);
});
