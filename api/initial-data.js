import { callGas, setCorsHeaders } from "./_utils.js";

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const customGasUrl = req.headers["x-gas-url"] || req.query.gasUrl;
    const result = await callGas("getInitialData", {}, customGasUrl);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Gagal mengambil data awal: " + err.message
    });
  }
}
