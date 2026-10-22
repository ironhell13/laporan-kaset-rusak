import { callGas, setCorsHeaders } from "./_utils.js";

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Metode tidak diizinkan. Gunakan POST."
    });
  }

  try {
    const customGasUrl = req.headers["x-gas-url"] || req.query.gasUrl;
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch (e) {}
    }

    const payload = (body && body.payload) ? body.payload : body;

    const result = await callGas("saveReport", { payload: payload }, customGasUrl);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Gagal menyimpan laporan: " + err.message
    });
  }
}
