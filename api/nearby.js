import fetch from "node-fetch";

// 簡單快取（避免每次都 ping sheet.best）
let CACHE = {
  data: null,
  ts: 0,
};
const CACHE_TTL_MS = 60000; // 1 分鐘

function haversine(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function loadData() {
  const now = Date.now();
  if (CACHE.data && now - CACHE.ts < CACHE_TTL_MS) return CACHE.data;

  const url = process.env.SHEET_API_URL;

  if (!url) {
    // 如果環境變數沒設定，回傳清楚錯誤
    throw new Error(
      "SHEET_API_URL is undefined. 請確認 Vercel Environment Variables 是否正確設定。"
    );
  }

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch data from SHEET_API_URL: ${res.status}`);
  }

  const data = await res.json();

  CACHE = { data, ts: now };
  return data;
}

export default function handler(req, res) {
  try {
    const { lat, lng, limit = 20, max_distance_m = 3000 } = req.query;

    // ------------------------------------------------------
    // 🆕 方案 B：all=1 → 回傳全部建築（Leaflet 載入用）
    // ------------------------------------------------------
    if (req.query.all === "1") {
      return res.status(200).json({
        status: "ok",
        results: data
      });
    }
    // ------------------------------------------------------

    // 沒有 lat / lng → 無效
    if (!lat || !lng) {
      return res.status(400).json({
        status: "error",
        message: "missing lat/lng"
      });
    }

    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);

    // 計算距離
    let list = data
      .map((item) => {
        const d = distance(
          userLat,
          userLng,
          item.latitude || item.lat,
          item.longitude || item.lng
        );

        return { ...item, distance: d };
      })
      .filter((x) => x.distance <= max_distance_m);

    // 排序
    list.sort((a, b) => a.distance - b.distance);

    // 限制回傳筆數
    list = list.slice(0, Number(limit));

    return res.status(200).json({
      status: "ok",
      query: req.query,
      results: list
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: "error", message: err.message });
  }
}
