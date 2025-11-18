// api/webhook.js
import crypto from "crypto";
import fetch from "node-fetch";

// -------------------------
// 1. 讀取環境變數
// -------------------------
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

const BASE_URL = process.env.BASE_URL || ""; 
const NEARBY_API_URL = process.env.NEARBY_API_URL; // 你的 nearby API

if (!LINE_CHANNEL_SECRET || !LINE_CHANNEL_ACCESS_TOKEN) {
  console.warn("⚠️ 請設定 LINE_CHANNEL_SECRET 與 LINE_CHANNEL_ACCESS_TOKEN");
}

// -------------------------
// 2. 驗證 LINE 簽名
// -------------------------
function validateSignature(body, signature) {
  const hmac = crypto.createHmac("SHA256", LINE_CHANNEL_SECRET);
  hmac.update(body);
  const expected = hmac.digest("base64");
  return expected === signature;
}

// -------------------------
// 3. Reply API 套件
// -------------------------
async function replyMessage(replyToken, messages) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages,
    }),
  });
}

// -------------------------
// 4. 主 Webhook Handler
// -------------------------
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const signature = req.headers["x-line-signature"];
  const body = JSON.stringify(req.body);

  // 👉 進行簽名驗證（必須）
  if (!validateSignature(body, signature)) {
    return res.status(403).send("Invalid signature");
  }

  const events = req.body.events;

  for (const event of events) {
    // 只處理「傳送位置」
    if (event.type === "message" && event.message.type === "location") {
      const { latitude, longitude } = event.message;

      // -------------------------
      // 5. 呼叫 Nearby API
      // -------------------------
      const apiUrl = `${NEARBY_API_URL}?lat=${latitude}&lng=${longitude}`;
      const response = await fetch(apiUrl);
      const places = await response.json();

      // 若沒有結果
      if (!places.length) {
        await replyMessage(event.replyToken, [
          { type: "text", text: "附近找不到建築作品 😢" },
        ]);
        continue;
      }

      // -------------------------
      // 6. 產生 Flex Message
      // -------------------------
      const bubbles = places.slice(0, 5).map((item) => ({
        type: "bubble",
        hero: {
          type: "image",
          url: item.image || "https://placehold.co/600x400",
          size: "full",
          aspectRatio: "20:13",
          aspectMode: "cover"
        },
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: item.caseName,
              weight: "bold",
              size: "lg",
            },
            {
              type: "text",
              text: item.author || "Unknown architect",
              size: "sm",
              color: "#888888",
            },
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "button",
              style: "primary",
              action: {
                type: "uri",
                label: "查看介紹頁",
                uri: `${BASE_URL}/building/${item.id}`,
              },
            },
            {
              type: "button",
              style: "secondary",
              action: {
                type: "uri",
                label: "Google 導航",
                uri: `https://maps.google.com/?q=${item.lat},${item.lng}`,
              },
            },
          ],
        },
      }));

      const flexMessage = {
        type: "flex",
        altText: "附近的建築作品",
        contents: {
          type: "carousel",
          contents: bubbles,
        },
      };

      // -------------------------
      // 7. Reply 回 LINE 用戶
      // -------------------------
      await replyMessage(event.replyToken, [flexMessage]);
    }
  }

  res.status(200).send("OK");
}
