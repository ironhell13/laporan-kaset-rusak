/**
 * Helper untuk Serverless Function Vercel menghubungkan request ke Google Apps Script Web App.
 * Dioptimasi dengan automatic retry & jitter untuk mendukung hingga 20+ user submit bersamaan.
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

  let lastError = null;
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(gasUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify(bodyData),
        redirect: "follow"
      });

      const responseText = await response.text();
      let parsed;
      try {
        parsed = JSON.parse(responseText);
      } catch (err) {
        throw new Error("Respons dari Google Apps Script bukan JSON: " + responseText.substring(0, 150));
      }

      // Jika script mengembalikan pesan antrian/lock sibuk, tunggu jeda singkat dan coba kembali
      if (parsed && !parsed.success && parsed.message && /sibuk|busy|lock|antrian/i.test(parsed.message) && attempt < maxAttempts) {
        const jitter = Math.floor(Math.random() * 300);
        await new Promise(r => setTimeout(r, (300 * attempt) + jitter));
        continue;
      }

      return parsed;

    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const jitter = Math.floor(Math.random() * 300);
        await new Promise(r => setTimeout(r, (300 * attempt) + jitter));
      }
    }
  }

  throw lastError || new Error("Gagal menghubungi server Apps Script setelah beberapa percobaan.");
}
