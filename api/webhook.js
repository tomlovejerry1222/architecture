// api/webhook.js
import crypto from "crypto";
import fetch from "node-fetch";

const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const SHEET_API_URL = process.env.SHEET_API_URL; // 你的 sheet.best API (可選，若 nearby API 會呼叫此值）
const NEARBY_API = process.env.NEARBY_API_URL || `${process.env.BASE_URL || ''}/api/nearby`; // 若你把 nearby 放在同個 Vercel，填 https://architecture-h7wp.vercel.app/api/nearby
const BASE_URL = process.env.BASE_URL || ""; // 你的網站根 URL，用於建築介紹頁連結

if (!LINE_CHANNEL_SECRET || !LINE_CHANNEL_ACCESS_TOKEN) {
  console.warn("請在環境變數設定 LINE_CHANNEL_SECRET 與 LINE_CHANNEL_ACCESS_TOKEN");
}

// 驗證 LINE signature
function verifySignature(bodyBuffer, signature) {
  const hmac = crypto.createHmac("sha256", LINE_CHANNEL_SECRET);
  hmac.update(bodyBuffer);
  const expected = hmac.digest("base64");
  return expected === signature;
}

// 建 Flex Bubble 卡片
// -------------------
// Flex Bubble：範本 C（深色卡片）
// -------------------
function buildFlexBubble(item) {
  const title = item.name || item.caseName || "未命名建築";
  const img = item.imageUrl || item.picture || "";
  const desc = item.description || item.note || "";
  const arth = item.architect || "";
  const originalName = item.altName || "";
  const lat = item.latitude || item.lat;
  const lng = item.longitude || item.lng;

  const detailUrl =
    item.link ||
    (BASE_URL
      ? `${BASE_URL}/detail/${item.id || encodeURIComponent(title)}`
      : "");

  const mapsUrl =
    lat && lng
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
      : (item.googleMapUrl || "");

  return {
    type: "bubble",
    size: "mega",
    hero: img
      ? {
          type: "image",
          url: img,
          size: "full",
          aspectMode: "cover",
          aspectRatio: "16:9",
          action: {
            type: "uri",
            uri: detailUrl || mapsUrl || "https://google.com"
          }
        }
      : undefined,
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      backgroundColor: "#384337",
      paddingAll: "12px",
      contents: [
        {
          type: "text",
          text: title,
          wrap: true,
          weight: "bold",
          size: "lg",
          color: "#E7DBCE"
        },
        ...(desc
          ? [
              {
                type: "text",
                text: originalName,
                wrap: true,
                size: "sm",
                color: "#E7DBCE",
                margin: "sm"
              },
              {
                type: "text",
                text: arth,
                wrap: true,
                size: "sm",
                color: "#ffffff",
                margin: "sm"
              }
            ]
          : [])
      ]
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      backgroundColor: "#384337",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#FF5912",
          action: {
            type: "uri",
            label: "導航到這裡",
            uri: mapsUrl || detailUrl || "https://google.com"
          }
        },
        {
          type: "button",
          style: "secondary",
          color: "#ffffff",
          action: {
            type: "uri",
            label: "查看詳情",
            uri: detailUrl || mapsUrl || "https://google.com"
          }
        }
      ]
    }
  };
}

// -------------------
// Flex Carousel
// -------------------
// function buildFlexMessageFromResults(results) {
//   const bubbles = results.map(item => buildFlexBubble(item));
//   return {
//     type: "flex",
//     altText: "附近的設計建築",
//     contents: {
//       type: "carousel",
//       contents: bubbles
//     }
//   };
// }

function buildMapEntranceBubble() {
  return {
    type: "bubble",
    size: "mega",
    hero: {
      type: "image",
      url: "https://architecture-livid.vercel.app/img/map-preview.jpg", // 你可以換成你的首頁地圖預覽圖
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
          text: "查看完整地圖",
          weight: "bold",
          size: "xl",
          wrap: true
        },
        {
          type: "text",
          text: "點擊進入互動地圖，查看所有建築標點",
          size: "sm",
          color: "#666666",
          wrap: true,
          margin: "md"
        }
      ]
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "button",
          action: {
            type: "uri",
            label: "查看地圖",
            uri: "https://architecture-livid.vercel.app/map" // ← 你地圖頁的網址，例如 https://architecture-h7wp.vercel.app/map
          },
          style: "primary",
          color: "#3B82F6"
        }
      ]
    }
  };
}


function buildFlexMessageFromResults(results) {

  const bubbles = [];


  // 2. 建築資料卡片（逐一加入）
  results.forEach(it => {
    bubbles.push(buildFlexBubble(it));
  });

  // 1. 地圖入口卡片（第一張）
  bubbles.push(buildMapEntranceBubble());
  
  return {
    type: "flex",
    altText: "附近的設計建築",
    contents: {
      type: "carousel",
      contents: bubbles
    }
  };
}




// 回傳 LINE Reply API
async function replyToLine(replyToken, messages) {
  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      replyToken,
      messages: Array.isArray(messages) ? messages : [messages]
    })
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("replyToLine error", res.status, t);
  }
}

// 主 handler
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(200).send("ok");

    // Vercel 會提供 raw body buffer，若無需 buffer 可直接用 req.body
    const signature = req.headers["x-line-signature"];
    const bodyBuffer = Buffer.from(req.rawBody || JSON.stringify(req.body || {}));

    // 驗證
    if (!verifySignature(bodyBuffer, signature)) {
      console.warn("LINE signature 驗證失敗");
      // 仍回 200 避免多次重試
      return res.status(200).send("invalid signature");
    }

    const events = req.body && req.body.events ? req.body.events : [];

    // 處理每個 event
    for (const event of events) {
      if (event.type === "message" && event.message.type === "location") {
        const lat = event.message.latitude;
        const lng = event.message.longitude;
        const replyToken = event.replyToken;

        // 呼叫附近搜尋 API（你的 nearby API）
        // 範例: GET /api/nearby?lat=25.03&lng=121.56&limit=5
        const nearbyUrl = `${NEARBY_API}?lat=${lat}&lng=${lng}&limit=5&max_distance_m=3000`;
        const nearRes = await fetch(nearbyUrl);
        const nearJson = await nearRes.json();

        const results = (nearJson && nearJson.results) ? nearJson.results : [];

        if (results.length === 0) {
          await replyToLine(replyToken, { type: "text", text: "抱歉，附近沒有符合條件的建築資料。" });
          const flex = buildFlexMessageFromResults(results);
        } else {
          const flex = buildFlexMessageFromResults(results);
          await replyToLine(replyToken, flex);
        }
      } else if (event.type === "message" && event.message.type === "text") {
        // 例如指令 "找附近建築"→引導使用者傳位置
        const txt = event.message.text.trim();
        const replyToken = event.replyToken;
        if (txt.includes("找附近") || txt.includes("附近建築")) {
          // Quick reply 提示使用者傳位置（用戶點選會開啟位置分享）
          const quickReply = {
            type: "text",
            text: "請傳送你的位置（點選下方按鈕）",
            quickReply: {
              items: [
                {
                  type: "action",
                  action: { type: "location", label: "傳送位置" }
                }
              ]
            }
          };
          await replyToLine(replyToken, quickReply);
        } else {
          // 預設回應（可改）
          await replyToLine(replyToken, { type: "text", text: "請傳送位置或輸入「找附近」以查詢附近建築。" });
        }
      } else if (event.type === "postback") {
        // 可用來處理卡片按鈕的 postback
      }
    }

    return res.status(200).send("ok");
  } catch (err) {
    console.error(err);
    return res.status(500).send(err.message);
  }
}
