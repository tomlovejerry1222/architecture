export default function handler(req, res) {
  try {
    const sheetUrl = process.env.SHEET_API_URL;
    res.status(200).json({
      SHEET_API_URL: sheetUrl ?? null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
