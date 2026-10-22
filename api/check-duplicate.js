import { callGas, setCorsHeaders } from "./_utils.js";

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const customGasUrl = req.headers["x-gas-url"] || req.query.gasUrl;
    let nomorKaset = "";

    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch (e) {}
      }
      nomorKaset = (body && body.nomorKaset) ? body.nomorKaset : "";
    } else {
      nomorKaset = req.query.nomorKaset || "";
    }

    const result = await callGas("checkDuplicate", { nomorKaset: nomorKaset }, customGasUrl);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Gagal memeriksa duplikat: " + err.message
    });
  }
}
