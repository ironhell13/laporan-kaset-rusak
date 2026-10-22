/**
 * Helper untuk Serverless Function Vercel menghubungkan request ke Google Apps Script Web App
 */

export function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-GAS-URL");
}

export async function callGas(action, payload, customGasUrl) {
  const gasUrl = customGasUrl || process.env.GAS_URL || process.env.GAS_WEBAPP_URL;

  if (!gasUrl) {
    return {
      success: false,
      message: "GAS_URL belum disetel di Vercel Environment Variables atau Settings aplikasi."
    };
  }

  const bodyData = {
    action: action,
    ...(payload || {})
  };

  const response = await fetch(gasUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(bodyData),
    redirect: "follow"
  });

  const responseText = await response.text();

  try {
    return JSON.parse(responseText);
  } catch (err) {
    throw new Error("Respons dari Google Apps Script bukan JSON: " + responseText.substring(0, 150));
  }
}
