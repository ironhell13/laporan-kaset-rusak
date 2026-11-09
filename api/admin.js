import { callGas, setCorsHeaders } from "./_utils.js";

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Metode tidak diizinkan. Gunakan GET atau POST."
    });
  }

  try {
    const customGasUrl = req.headers["x-gas-url"] || req.query.gasUrl;
    let body = req.body || {};
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch (e) {}
    }

    if (req.method === "GET") {
      body = {
        subAction: req.query.subAction || "getAdminStats",
        pin: req.query.pin || ""
      };
    }

    const result = await callGas("adminAction", body, customGasUrl);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Gagal memproses request admin: " + err.message
    });
  }
}

