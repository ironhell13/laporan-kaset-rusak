import { callGas, setCorsHeaders } from "./_utils.js";
import fs from "fs";
import path from "path";

const DEFAULT_MODULES = ["1", "2", "3", "4", "5", "Reject", "Retract"];
const DEFAULT_TYPES = ["Hyosung", "Hitachi", "OKI", "NCR", "YIHUA"];

function getFallbackWsidList() {
  try {
    const candidatePaths = [
      path.join(process.cwd(), "public", "data", "wsid.json"),
      path.join(process.cwd(), "data", "wsid.json")
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, "utf-8");
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    }
  } catch (e) {
    console.error("Gagal load fallback wsid:", e.message);
  }
  return [];
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  let result = null;
  try {
    const customGasUrl = req.headers["x-gas-url"] || req.query.gasUrl;
    result = await callGas("getInitialData", {}, customGasUrl);
  } catch (err) {
    console.warn("callGas getInitialData warning:", err.message);
  }

  if (!result || typeof result !== "object") {
    result = { success: true };
  }

  // Pastikan typeMesinList tersedia
  if (!result.typeMesinList || !Array.isArray(result.typeMesinList) || result.typeMesinList.length === 0) {
    result.typeMesinList = DEFAULT_TYPES;
  }

  // Pastikan moduleList tersedia
  if (!result.moduleList || !Array.isArray(result.moduleList) || result.moduleList.length === 0) {
    result.moduleList = DEFAULT_MODULES;
  }

  // Pastikan wsidList tersedia
  if (!result.wsidList || !Array.isArray(result.wsidList) || result.wsidList.length === 0) {
    result.wsidList = getFallbackWsidList();
  }

  if (!result.today) {
    const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    const now = new Date();
    result.today = now.getDate() + " " + months[now.getMonth()] + " " + now.getFullYear();
  }

  result.success = true;
  return res.status(200).json(result);
}
