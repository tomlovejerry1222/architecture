export default function handler(req, res) {
  const sheetUrl = process.env.SHEET_API_URL;

  if (!sheetUrl) {
    return res.status(500).json({
      status: "error",
      message:
        "SHEET_API_URL is undefined. Please check Vercel Environment Variables."
    });
  }

  res.status(200).json({
    status: "ok",
    SHEET_API_URL: sheetUrl
  });
}
