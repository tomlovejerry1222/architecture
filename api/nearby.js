import allData from "../data.json";

export default function handler(req, res) {
  const { lat, lng, limit = 5, max_distance_m = 2000, all } = req.query;

  // ------- A. all=1 → 回傳全部建築（給 Leaflet 用） -------
  if (all === "1") {
    return res.status(200).json({
      status: "ok",
      mode: "all",
      count: allData.length,
      results: allData
    });
  }

  // ------- B. 以下是原本的附近搜尋 -------
  if (!lat || !lng) {
    return res.status(400).json({
      status: "error",
      message: "lat and lng are required",
    });
  }

  const userLat = parseFloat(lat);
  const userLng = parseFloat(lng);

  // 計算距離
  function distance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  const filtered = allData
    .map((item) => {
      const lat2 = item.lat || item.latitude;
      const lng2 = item.lng || item.longitude;
      if (!lat2 || !lng2) return null;

      const d = distance(userLat, userLng, lat2, lng2);
      return { ...item, distance: d };
    })
    .filter((item) => item && item.distance <= max_distance_m)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);

  return res.status(200).json({
    status: "ok",
    mode: "nearby",
    query: { lat: userLat, lng: userLng, limit, max_distance_m },
    count: filtered.length,
    results: filtered
  });
}
