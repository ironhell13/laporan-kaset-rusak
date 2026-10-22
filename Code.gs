/**
 * =========================================================================
 * LAPORAN KASET ALSUT - BACKEND GOOGLE APPS SCRIPT (API & SHEET ENGINE)
 * =========================================================================
 * Bertindak sebagai Headless API untuk frontend Vercel maupun Google Apps Script.
 * Data disimpan ke Google Spreadsheet pada sheet "Format Laporan Kaset Rusak".
 */

// =========================================================================
// KONFIGURASI APLIKASI
// =========================================================================
const CONFIG = {
  // SPREADSHEET_ID opsional:
  // - Jika script dibuat container-bound (Extensions > Apps Script dari Spreadsheet), biarkan kosong "".
  // - Jika script dibuat standalone (terpisah), isi ID spreadsheet di bawah ini.
  SPREADSHEET_ID: "",

  // Nama sheet
  SHEET_NAME_REPORT: "Format Laporan Kaset Rusak",
  SHEET_NAME_TYPE: "Type Mesin",

  // Struktur baris
  HEADER_ROW: 2,
  FIRST_DATA_ROW: 3,

  // Zona waktu & format tanggal
  TIMEZONE: "Asia/Jakarta",
  DATE_DISPLAY_FORMAT: "dd MMM yyyy",
  DATE_NUMBER_FORMAT: "d MMM yyyy",

  // Normalisasi S/N
  SN_NORMALIZE: true,
  SN_PREFIX: "SAB10"
};

/**
 * Mendapatkan referensi Spreadsheet (Container-bound atau Standalone via ID)
 */
function getSpreadsheet() {
  if (CONFIG.SPREADSHEET_ID && CONFIG.SPREADSHEET_ID.trim() !== "") {
    return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID.trim());
  }
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error("Spreadsheet tidak ditemukan. Jika script standalone, isi CONFIG.SPREADSHEET_ID pada Code.gs.");
  }
  return active;
}

/**
 * HTTP GET:
 * - Jika dipanggil dengan ?action=..., return response JSON (API Mode).
 * - Jika dibuka langsung di browser tanpa parameter, render HTML (Web App Mode).
 */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "";

  if (action) {
    var result = { success: false, message: "Aksi tidak dikenal" };
    try {
      if (action === "getInitialData") {
        result = getInitialData();
      } else if (action === "checkDuplicate") {
        result = checkDuplicate(e.parameter.nomorKaset);
      } else {
        result = { success: false, message: "Aksi GET '" + action + "' tidak didukung." };
      }
    } catch (err) {
      result = { success: false, message: "Server error: " + err.message };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Fallback: Jika dibuka di browser langsung
  var template = HtmlService.createTemplateFromFile("Index");
  return template.evaluate()
    .setTitle("Laporan Kaset Alsut")
    .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * HTTP POST:
 * Endpoint utama API untuk Frontend Vercel.
 * Menerima payload JSON: { action: "getInitialData" | "checkDuplicate" | "saveReport", ... }
 */
function doPost(e) {
  var result = { success: false, message: "Request tidak valid" };

  try {
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : "";
    var body = {};

    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch (parseErr) {
        // Fallback jika dikirim form-encoded
        body = e.parameter || {};
      }
    } else if (e && e.parameter) {
      body = e.parameter;
    }

    var action = body.action || (e && e.parameter && e.parameter.action) || "";

    if (action === "getInitialData") {
      result = getInitialData();
    } else if (action === "checkDuplicate") {
      var nomorKaset = body.nomorKaset || (e && e.parameter && e.parameter.nomorKaset) || "";
      result = checkDuplicate(nomorKaset);
    } else if (action === "saveReport") {
      var payload = body.payload || body;
      result = saveReport(payload);
    } else {
      result = {
        success: false,
        message: "Aksi '" + action + "' tidak dikenali. Gunakan getInitialData, checkDuplicate, atau saveReport."
      };
    }

  } catch (err) {
    result = { success: false, message: "Kesalahan server doPost: " + err.message };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Format tanggal dalam bahasa Indonesia (mis. "22 Okt 2026")
 */
function formatIndonesianDate(date) {
  var months = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
  ];
  var day = Utilities.formatDate(date, CONFIG.TIMEZONE, "d");
  var monthIndex = parseInt(Utilities.formatDate(date, CONFIG.TIMEZONE, "M"), 10) - 1;
  var year = Utilities.formatDate(date, CONFIG.TIMEZONE, "yyyy");
  return day + " " + months[monthIndex] + " " + year;
}

/**
 * Sanitasi string untuk mencegah Formula Injection di Spreadsheet
 */
function sanitizeInput(val) {
  if (val === null || val === undefined) return "";
  var str = String(val).trim();
  if (/^[=+\-@]/.test(str)) {
    return "'" + str;
  }
  return str;
}

/**
 * Normalisasi S/N kaset ATM CRM
 */
function normalizeSN(raw) {
  if (!raw) return "";
  var str = String(raw).trim().toUpperCase();

  if (!CONFIG.SN_NORMALIZE) {
    return str;
  }

  // 1. Hapus awalan SN: atau S/N
  str = str.replace(/^(SN\s*:|S\/N\s*:?)\s*/i, "").trim();

  // 2. Cek apakah mengandung pola SAB10 yang diikuti angka (dengan spasi/strip/tanda hubung)
  var sabMatch = str.match(/SAB10[\s\-_]*(\d+)/i);
  if (sabMatch && sabMatch[1]) {
    return CONFIG.SN_PREFIX + sabMatch[1];
  }

  // 3. Jika hanya angka murni
  if (/^\d+$/.test(str)) {
    return CONFIG.SN_PREFIX + str;
  }

  // 4. Default: kembalikan string apa adanya
  return str;
}

/**
 * Mendapatkan data awal untuk form saat pertama dibuka:
 * - Tanggal hari ini (Asia/Jakarta, format ID)
 * - Daftar Type Mesin dari sheet "Type Mesin"
 */
function getInitialData() {
  try {
    var ss = getSpreadsheet();
    var now = new Date();
    var todayFormatted = formatIndonesianDate(now);

    var typeSheet = ss.getSheetByName(CONFIG.SHEET_NAME_TYPE);
    if (!typeSheet) {
      return {
        success: false,
        message: "Sheet '" + CONFIG.SHEET_NAME_TYPE + "' tidak ditemukan di spreadsheet. Hubungi admin.",
        today: todayFormatted,
        typeMesinList: []
      };
    }

    var lastRow = typeSheet.getLastRow();
    var typeMesinList = [];

    if (lastRow >= 2) {
      var rawValues = typeSheet.getRange(2, 1, lastRow - 1, 1).getValues();
      var seen = {};

      for (var i = 0; i < rawValues.length; i++) {
        var cell = rawValues[i][0];
        if (cell !== null && cell !== undefined) {
          var val = String(cell).trim();
          if (val !== "" && !seen[val]) {
            seen[val] = true;
            typeMesinList.push(val);
          }
        }
      }
    }

    if (typeMesinList.length === 0) {
      return {
        success: false,
        message: "Daftar Type Mesin di sheet kosong. Hubungi admin.",
        today: todayFormatted,
        typeMesinList: []
      };
    }

    return {
      success: true,
      today: todayFormatted,
      typeMesinList: typeMesinList
    };

  } catch (err) {
    return {
      success: false,
      message: "Gagal mengambil data awal: " + err.message,
      today: formatIndonesianDate(new Date()),
      typeMesinList: []
    };
  }
}

/**
 * Mencari baris kosong berikutnya hanya pada kolom A-F
 * Menghindari bug getLastRow() jika ada formatting di bawah data
 */
function findNextEmptyRow(sheet) {
  var maxRows = sheet.getMaxRows();
  if (maxRows < CONFIG.FIRST_DATA_ROW) {
    sheet.insertRowsAfter(maxRows, CONFIG.FIRST_DATA_ROW - maxRows);
    return CONFIG.FIRST_DATA_ROW;
  }

  var numRowsToCheck = maxRows - CONFIG.FIRST_DATA_ROW + 1;
  var values = sheet.getRange(CONFIG.FIRST_DATA_ROW, 1, numRowsToCheck, 6).getValues();

  var lastFilledOffset = -1;
  for (var r = values.length - 1; r >= 0; r--) {
    var row = values[r];
    var isFilled = false;
    for (var c = 0; c < 6; c++) {
      if (row[c] !== "" && row[c] !== null && row[c] !== undefined) {
        isFilled = true;
        break;
      }
    }
    if (isFilled) {
      lastFilledOffset = r;
      break;
    }
  }

  var nextRow = (lastFilledOffset === -1)
    ? CONFIG.FIRST_DATA_ROW
    : (CONFIG.FIRST_DATA_ROW + lastFilledOffset + 1);

  if (nextRow > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), 5);
  }

  return nextRow;
}

/**
 * Cek apakah Nomor Kaset sudah pernah dilaporkan sebelumnya di kolom C
 */
function checkDuplicate(nomorKaset) {
  try {
    if (!nomorKaset) {
      return { success: true, isDuplicate: false };
    }

    var cleanKaset = String(nomorKaset).trim().toUpperCase();
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEET_NAME_REPORT);
    if (!sheet) {
      return { success: true, isDuplicate: false };
    }

    var maxRows = sheet.getMaxRows();
    if (maxRows < CONFIG.FIRST_DATA_ROW) {
      return { success: true, isDuplicate: false };
    }

    var numRows = maxRows - CONFIG.FIRST_DATA_ROW + 1;
    var values = sheet.getRange(CONFIG.FIRST_DATA_ROW, 1, numRows, 3).getValues();

    for (var i = values.length - 1; i >= 0; i--) {
      var row = values[i];
      var existingKaset = String(row[2] || "").trim().toUpperCase();
      if (existingKaset === cleanKaset) {
        var existingWsid = String(row[0] || "-").trim();
        var rawDate = row[1];
        var existingDate = "-";
        if (rawDate instanceof Date) {
          existingDate = formatIndonesianDate(rawDate);
        } else if (rawDate) {
          existingDate = String(rawDate).trim();
        }

        return {
          success: true,
          isDuplicate: true,
          duplicateInfo: {
            nomorKaset: cleanKaset,
            wsid: existingWsid,
            tanggal: existingDate,
            rowNumber: CONFIG.FIRST_DATA_ROW + i
          }
        };
      }
    }

    return { success: true, isDuplicate: false };

  } catch (err) {
    return {
      success: false,
      message: "Gagal memeriksa duplikasi: " + err.message
    };
  }
}

/**
 * Menyimpan laporan kaset ke baris kosong berikutnya di sheet "Format Laporan Kaset Rusak"
 * Kolom A-F diisi, Kolom G-H (CCAS) tidak disentuh sama sekali.
 */
function saveReport(payload) {
  var lock = LockService.getScriptLock();
  var lockAcquired = false;

  try {
    // 1. Dapatkan Lock (30 detik timeout)
    lockAcquired = lock.tryLock(30000);
    if (!lockAcquired) {
      return {
        success: false,
        message: "Sistem sedang sibuk memproses data lain. Silakan coba submit beberapa detik lagi."
      };
    }

    // 2. Validasi Input di sisi server
    if (!payload || typeof payload !== "object") {
      return { success: false, message: "Data laporan tidak valid." };
    }

    var wsid = String(payload.wsid || "").trim().toUpperCase();
    var nomorKaset = String(payload.nomorKaset || "").trim().toUpperCase();
    var rawSN = String(payload.sn || "").trim();
    var normalizedSN = normalizeSN(rawSN);
    var moduleNum = parseInt(payload.module, 10);
    var typeMesin = String(payload.typeMesin || "").trim();

    // Validasi kelengkapan
    if (!wsid || !nomorKaset || !normalizedSN || isNaN(moduleNum) || !typeMesin) {
      return { success: false, message: "Semua 6 field wajib diisi." };
    }

    // Validasi WSID: 3-10 karakter alfanumerik
    if (!/^[A-Z0-9]{3,10}$/.test(wsid)) {
      return { success: false, message: "WSID harus terdiri dari 3-10 karakter huruf/angka." };
    }

    // Validasi Module: 1-6
    if (moduleNum < 1 || moduleNum > 6) {
      return { success: false, message: "Module harus berupa angka 1 sampai 6." };
    }

    // 3. Validasi Type Mesin dari sheet Type Mesin
    var ss = getSpreadsheet();
    var typeSheet = ss.getSheetByName(CONFIG.SHEET_NAME_TYPE);
    if (!typeSheet) {
      return { success: false, message: "Sheet '" + CONFIG.SHEET_NAME_TYPE + "' tidak ditemukan." };
    }

    var lastTypeRow = typeSheet.getLastRow();
    var validTypes = [];
    if (lastTypeRow >= 2) {
      var rawTypes = typeSheet.getRange(2, 1, lastTypeRow - 1, 1).getValues();
      for (var t = 0; t < rawTypes.length; t++) {
        var tVal = String(rawTypes[t][0] || "").trim();
        if (tVal) validTypes.push(tVal);
      }
    }

    if (validTypes.indexOf(typeMesin) === -1) {
      return {
        success: false,
        message: "Type Mesin '" + typeMesin + "' tidak valid atau tidak terdaftar di sheet."
      };
    }

    // 4. Buka sheet target laporan
    var reportSheet = ss.getSheetByName(CONFIG.SHEET_NAME_REPORT);
    if (!reportSheet) {
      return {
        success: false,
        message: "Sheet '" + CONFIG.SHEET_NAME_REPORT + "' tidak ditemukan di spreadsheet."
      };
    }

    // 5. Cari baris kosong berikutnya di kolom A-F
    var targetRow = findNextEmptyRow(reportSheet);

    // 6. Tanggal server dibuat independen
    var serverDate = new Date();

    // 7. Siapkan Range Kolom A sampai F pada baris target
    var targetRange = reportSheet.getRange(targetRow, 1, 1, 6);

    // Number format:
    // A: @ (Teks)
    // B: d MMM yyyy (Tanggal asli)
    // C: @ (Teks - kaset)
    // D: @ (Teks - S/N)
    // E: 0 (Angka bulat)
    // F: @ (Teks)
    var formats = [["@", CONFIG.DATE_NUMBER_FORMAT, "@", "@", "0", "@"]];
    targetRange.setNumberFormats(formats);

    // Data yang akan ditulis:
    var rowData = [[
      sanitizeInput(wsid),
      serverDate,
      sanitizeInput(nomorKaset),
      sanitizeInput(normalizedSN),
      moduleNum,
      sanitizeInput(typeMesin)
    ]];

    targetRange.setValues(rowData);

    // Flush perubahan ke Google Sheets
    SpreadsheetApp.flush();

    return {
      success: true,
      message: "Laporan kaset berhasil disimpan.",
      data: {
        rowNumber: targetRow,
        wsid: wsid,
        tanggal: formatIndonesianDate(serverDate),
        nomorKaset: nomorKaset,
        sn: normalizedSN,
        module: moduleNum,
        typeMesin: typeMesin
      }
    };

  } catch (err) {
    return {
      success: false,
      message: "Terjadi kesalahan server saat menyimpan: " + err.message
    };
  } finally {
    if (lockAcquired) {
      try {
        lock.releaseLock();
      } catch (e) {
        // Abaikan
      }
    }
  }
}
