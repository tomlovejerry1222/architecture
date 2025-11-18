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

export default async function handler(req, res) {
  try {
    // 先檢查環境變數
    if (!process.env.SHEET_API_URL) {
      return res.status(500).json({
        error:
          "SHEET_API_URL is undefined. 請確認 Vercel Environment Variables 是否正確設定。",
      });
    }

    let lat, lng, limit = 5, max_distance_m = 200000;

    if (req.method === "GET") {
      lat = parseFloat(req.query.lat);
      lng = parseFloat(req.query.lng);
      if (req.query.limit) limit = parseInt(req.query.limit);
      if (req.query.max_distance_m) max_distance_m = parseInt(req.query.max_distance_m);
    }

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: "Missing lat or lng" });
    }

    const data = await loadData();

    const normalized = data
      .map((item) => {
        const latitude = parseFloat(item.latitude ?? item.lat);
        const longitude = parseFloat(item.longitude ?? item.lng);
        if (!latitude || !longitude) return null;
        return {
          ...item,
          latitude,
          longitude,
        };
      })
      .filter(Boolean);

    const results = normalized
      .map((item) => ({
        ...item,
        distance_m: Math.round(
          haversine(lat, lng, item.latitude, item.longitude)
        ),
      }))
      .filter((x) => x.distance_m <= max_distance_m)
      .sort((a, b) => a.distance_m - b.distance_m)
      .slice(0, limit);

    res.status(200).json({
      status: "ok",
      query: { lat, lng, limit, max_distance_m },
      results,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
