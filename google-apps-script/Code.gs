const SHEET_ID = '1E-n7KpEPMju5_LY_3c045MDhEMxv6a9G8eVf6TbZ0CA';
const SHEET_NAME = 'Bookings';
const INTERVIEW_DATES = ['15 June 2026', '16 June 2026', '17 June 2026'];
const TIME_SLOTS = [
  '19:00',
  '19:15',
  '19:30',
  '19:45',
  '20:00',
  '20:15',
  '20:30',
  '20:45',
  '21:00',
  '21:15',
  '21:30',
  '21:45',
  '22:00',
  '22:15',
];
const MAX_BOOKINGS_PER_SLOT = 3;
const BOOKING_HEADERS = [
  'Candidate Name',
  'Interview Date',
  'Interview Time Slot',
  'Booking Reference Number',
  'Booking Timestamp',
];

function doGet(e) {
  return handleRequest(e.parameter || {});
}

function doPost(e) {
  const payload = parseRequestBody(e);
  return handleRequest(payload);
}

function handleRequest(params) {
  const action = String(params.action || '').toLowerCase();

  switch (action) {
    case 'availability':
      return jsonResponse(getAvailability());
    case 'book':
      return jsonResponse(bookAppointment(params));
    case 'admin':
      return jsonResponse(getAllBookings());
    default:
      return jsonResponse({ error: 'Invalid action. Use availability, book, or admin.' });
  }
}

function parseRequestBody(e) {
  try {
    if (e.postData && e.postData.contents) {
      return JSON.parse(e.postData.contents);
    }
  } catch (error) {
    // Fall through to use query parameters
  }

  return e.parameter || {};
}

function getBookingSheet() {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    sheet.appendRow(BOOKING_HEADERS);
  } else {
    ensureBookingHeader(sheet);
  }

  return sheet;
}

function ensureBookingHeader(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    sheet.appendRow(BOOKING_HEADERS);
    return;
  }

  const firstCell = String(sheet.getRange(1, 1).getValue() || '').trim();
  if (firstCell !== BOOKING_HEADERS[0]) {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, BOOKING_HEADERS.length).setValues([BOOKING_HEADERS]);
  }
}

function getBookingRows(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length === 0) {
    return [];
  }

  const firstCell = String(values[0][0] || '').trim();
  const hasHeader = firstCell === BOOKING_HEADERS[0];
  return hasHeader ? values.slice(1) : values;
}

/**
 * Normalize various time representations from Sheets into frontend format 'h:mm a' (e.g. '7:00 PM').
 * Supports Date objects, 24-hour strings like '19:00', AM/PM strings like '7:00 PM',
 * and numeric time values (fraction of day or milliseconds).
 */
function normalizeTime(raw) {
  if (raw instanceof Date) {
    return Utilities.formatDate(raw, Session.getScriptTimeZone(), 'HH:mm');
  }

  if (typeof raw === 'number' && !isNaN(raw)) {
    var msFromNumber = Math.round(raw * 24 * 3600 * 1000);
    return Utilities.formatDate(new Date(msFromNumber), Session.getScriptTimeZone(), 'HH:mm');
  }

  var s = (raw === null || raw === undefined) ? '' : String(raw).trim();
  if (s === '') return '';

  // Numeric values: fraction of day (0.x) or epoch milliseconds
  var num = Number(s);
  if (!isNaN(num)) {
    if (num > 1) {
      // treat as epoch milliseconds if large
      if (num > 1000000000) {
        return Utilities.formatDate(new Date(num), Session.getScriptTimeZone(), 'h:mm a');
      }
      // otherwise treat as fraction-of-day incorrectly formatted as number >1
      var msA = Math.round((num % 1) * 24 * 3600 * 1000);
      return Utilities.formatDate(new Date(msA), Session.getScriptTimeZone(), 'h:mm a');
    }
    var ms = Math.round(num * 24 * 3600 * 1000);
    return Utilities.formatDate(new Date(ms), Session.getScriptTimeZone(), 'h:mm a');
  }

  // Normalize AM/PM punctuation and spacing
  s = s.replace(/\./g, '').replace(/\s+/g, ' ').trim();

  // If contains AM/PM
  var ampmMatch = s.match(/(am|pm)$/i);
  if (ampmMatch) {
    var m = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
    if (m) {
      var hh = parseInt(m[1], 10);
      var mm = parseInt(m[2], 10);
      var period = m[3].toUpperCase();
      if (period === 'PM' && hh !== 12) hh += 12;
      if (period === 'AM' && hh === 12) hh = 0;
      return Utilities.formatDate(new Date(0, 0, 0, hh, mm), Session.getScriptTimeZone(), 'HH:mm');
    }
  }

  // 24-hour HH:MM
  var m2 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m2) {
    var hh2 = parseInt(m2[1], 10);
    var mm2 = parseInt(m2[2], 10);
    return Utilities.formatDate(new Date(0, 0, 0, hh2, mm2), Session.getScriptTimeZone(), 'HH:mm');
  }

  // fallback: return as-is
  return s;
}

/**
 * Normalize sheet/date values to match frontend INTERVIEW_DATES format (e.g. '15 June 2026').
 */
function normalizeDate(raw) {
  if (raw instanceof Date) {
    return Utilities.formatDate(raw, Session.getScriptTimeZone(), 'd MMMM yyyy');
  }

  var s = String(raw || '').trim();
  if (!s) return '';

  if (INTERVIEW_DATES.indexOf(s) !== -1) {
    return s;
  }

  var parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    var formatted = Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'd MMMM yyyy');
    if (INTERVIEW_DATES.indexOf(formatted) !== -1) {
      return formatted;
    }
  }

  return s;
}

function getAvailability() {
  const sheet = getBookingSheet();
  const values = sheet.getDataRange().getValues().slice(1);
  const counts = {};

  values.forEach((row) => {
    const dateRaw = row[1];
    const timeRaw = row[2];

    const date = normalizeDate(dateRaw);
    const time = normalizeTime(timeRaw);

    const key = `${date}||${time}`;
    counts[key] = (counts[key] || 0) + 1;
  });

  const slots = [];

  INTERVIEW_DATES.forEach((date) => {
    TIME_SLOTS.forEach((time) => {
      const key = `${date}||${time}`;
      slots.push({ date, time, count: counts[key] || 0 });
    });
  });

  return { slots };
}

function bookAppointment(payload) {
  const name = String(payload.name || '').trim();
  const date = normalizeDate(payload.date);
  const time = normalizeTime(payload.time);

  if (!name || !date || !time) {
    return { success: false, error: 'Candidate name, interview date, and time slot are required.' };
  }

  if (INTERVIEW_DATES.indexOf(date) === -1 || TIME_SLOTS.indexOf(time) === -1) {
    return { success: false, error: 'Selected date or time slot is not valid.' };
  }

  const availability = getAvailability();
  const key = `${date}||${time}`;
  const count = availability.slots.find((slot) => slot.date === date && slot.time === time)?.count || 0;

  if (count >= MAX_BOOKINGS_PER_SLOT) {
    return { success: false, error: 'That time slot is already fully booked.' };
  }

  const sheet = getBookingSheet();

  // Prevent duplicate bookings by the same candidate name
  try {
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const namesRange = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      const lowerName = name.toLowerCase();
      for (var i = 0; i < namesRange.length; i++) {
        var existing = String(namesRange[i][0] || '').trim().toLowerCase();
        if (existing && existing === lowerName) {
          return { success: false, error: 'You have already booked an interview slot.' };
        }
      }
    }
  } catch (err) {
    // If duplicate check fails for any reason, continue but log to execution transcript
    console.log('Duplicate name check error', err);
  }
  const bookingReference = createBookingReference(name);
  const timestamp = new Date();

  sheet.appendRow([name, date, time, bookingReference, timestamp]);

  return {
    success: true,
    booking: {
      name,
      date,
      time,
      reference: bookingReference,
      timestamp: timestamp.toISOString(),
    },
  };
}

function getAllBookings() {
  const sheet = getBookingSheet();
  const values = sheet.getDataRange().getValues().slice(1);

  const bookings = values.map((row) => ({
    name: row[0],
    date: normalizeDate(row[1]),
    time: normalizeTime(row[2]),
    reference: row[3],
    timestamp: row[4] instanceof Date ? row[4].toISOString() : String(row[4] || ''),
  }));

  return { bookings };
}

function createBookingReference(name) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase())
    .slice(0, 4)
    .join('');
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss');
  const random = Math.floor(100 + Math.random() * 900);
  return `${initials}-${timestamp}-${random}`;
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
