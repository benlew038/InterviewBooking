const GOOGLE_APPS_SCRIPT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxl-Di2ByjvsZjrLNVpDMctrd04rLmawmUZu-sOVJByp7q1kmeulGPvBros1xY4VP1x/exec';
const NETLIFY_PROXY_URL = '/.netlify/functions/proxy';
const API_BASE_URL = window.location.hostname.includes('netlify.app') ? NETLIFY_PROXY_URL : GOOGLE_APPS_SCRIPT_WEB_APP_URL;

const INTERVIEW_DATES = ['15 June 2026', '16 June 2026', '17 June 2026'];
const DATE_TIME_RANGES = {
  '15 June 2026': ['18:30', '22:15'],
  '16 June 2026': ['18:30', '22:15'],
  '17 June 2026': ['19:00', '21:45'],
};
const TIME_SLOTS = generateTimeSlots('18:30', '22:15', 15);
const MAX_BOOKINGS_PER_SLOT = 3;

const nameForm = document.getElementById('nameForm');
const bookingForm = document.getElementById('bookingForm');
const fullNameInput = document.getElementById('fullName');
const interviewDateSelect = document.getElementById('interviewDate');
const timeSlotSelect = document.getElementById('timeSlot');
const slotQuota = document.getElementById('slotQuota');
const nameFeedback = document.getElementById('nameFeedback');
const bookingFeedback = document.getElementById('bookingFeedback');
const confirmationSection = document.getElementById('confirmationSection');
const bookingStep = document.getElementById('bookingStep');
const nameStep = document.getElementById('nameStep');
const adminToggle = document.getElementById('adminToggle');
const adminSection = document.getElementById('adminSection');
const adminRefresh = document.getElementById('adminRefresh');
const adminTableBody = document.querySelector('#adminTable tbody');
const adminFeedback = document.getElementById('adminFeedback');
const confirmName = document.getElementById('confirmName');
const confirmDate = document.getElementById('confirmDate');
const confirmTime = document.getElementById('confirmTime');
const confirmReference = document.getElementById('confirmReference');
const refreshButton = document.getElementById('refreshButton');
const newBookingButton = document.getElementById('newBookingButton');

let currentCandidateName = '';
let slotCounts = {};
let isSubmitting = false;

document.addEventListener('DOMContentLoaded', () => {
  populateDateOptions();
  populateTimeOptions();
  updateSlotSummary();

  nameForm.addEventListener('submit', handleNameSubmit);
  bookingForm.addEventListener('submit', handleBookingSubmit);
  interviewDateSelect.addEventListener('change', () => {
    updateSlotOptions();
    updateSlotSummary();
  });
  timeSlotSelect.addEventListener('change', updateSlotSummary);
  refreshButton.addEventListener('click', loadAvailability);
  adminToggle.addEventListener('click', toggleAdminView);
  adminRefresh.addEventListener('click', loadAdminBookings);
  newBookingButton.addEventListener('click', resetBookingFlow);

  loadAvailability();
});

function populateDateOptions() {
  INTERVIEW_DATES.forEach((date) => {
    const option = document.createElement('option');
    option.value = date;
    option.textContent = date;
    interviewDateSelect.appendChild(option);
  });
}

function populateTimeOptions() {
  TIME_SLOTS.forEach((slot) => {
    const option = document.createElement('option');
    option.value = slot;
    option.textContent = slot;
    timeSlotSelect.appendChild(option);
  });
}

function generateTimeSlots(start, end, intervalMinutes) {
  const startParts = start.split(':').map(Number);
  const endParts = end.split(':').map(Number);
  const slots = [];
  const current = new Date(0, 0, 0, startParts[0], startParts[1]);
  const endTime = new Date(0, 0, 0, endParts[0], endParts[1]);

  while (current <= endTime) {
    slots.push(formatTime(current));
    current.setMinutes(current.getMinutes() + intervalMinutes);
  }

  return slots;
}

function formatTime(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function handleNameSubmit(event) {
  event.preventDefault();
  const value = fullNameInput.value.trim();
  const validation = validateFullName(value);

  if (!validation.valid) {
    nameFeedback.textContent = validation.message;
    return;
  }

  currentCandidateName = value;
  nameFeedback.textContent = '';
  nameStep.classList.add('hidden');
  bookingStep.classList.remove('hidden');
  confirmationSection.classList.add('hidden');
  loadAvailability();
}

function validateFullName(value) {
  if (!value) {
    return { valid: false, message: 'Full English Name is required.' };
  }

  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    return { valid: false, message: 'Please enter at least two words in your name.' };
  }

  const allowed = /^[A-Za-z'\-\s]+$/;
  if (!allowed.test(value)) {
    return { valid: false, message: "Only English letters, spaces, apostrophes (') and hyphens (-) are allowed." };
  }

  return { valid: true };
}

function updateSlotSummary() {
  const selectedDate = interviewDateSelect.value;
  const selectedTime = timeSlotSelect.value;

  if (!selectedDate || !selectedTime) {
    slotQuota.textContent = 'Choose a date and slot to view remaining quota.';
    return;
  }

  const key = getSlotKey(selectedDate, selectedTime);
  const used = slotCounts[key] || 0;
  const remaining = Math.max(0, MAX_BOOKINGS_PER_SLOT - used);

  slotQuota.textContent = remaining > 0 ? `${remaining} slot${remaining === 1 ? '' : 's'} remaining` : 'Fully Booked';
}

function getSlotKey(date, time) {
  return `${date}||${time}`;
}

function loadAvailability() {
  bookingFeedback.textContent = '';
  slotQuota.textContent = 'Loading availability…';

  if (!isBackendConfigured()) {
    slotCounts = {};
    refreshLocalAvailability();
    return;
  }

  const url = `${API_BASE_URL}?action=availability`;

  fetch(url, {
    method: 'GET',
    mode: 'cors',
    cache: 'no-store',
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.error) {
        bookingFeedback.textContent = data.error;
        refreshLocalAvailability();
        return;
      }

      slotCounts = {};
      (data.slots || []).forEach((entry) => {
        slotCounts[getSlotKey(entry.date, entry.time)] = Number(entry.count || 0);
      });

      updateSlotOptions();
      updateSlotSummary();
    })
    .catch(() => {
      bookingFeedback.textContent = 'Unable to load live availability. Booking will continue in demo mode.';
      refreshLocalAvailability();
    });
}

function refreshLocalAvailability() {
  TIME_SLOTS.forEach((slot) => {
    INTERVIEW_DATES.forEach((date) => {
      const key = getSlotKey(date, slot);
      if (!slotCounts[key]) {
        slotCounts[key] = 0;
      }
    });
  });

  updateSlotOptions();
  updateSlotSummary();
}

function updateSlotOptions() {
  const selectedDate = interviewDateSelect.value;
  const currentDate = selectedDate || INTERVIEW_DATES[0];
  const [startTime, endTime] = DATE_TIME_RANGES[currentDate] || ['18:30', '22:15'];
  const allowedSlots = generateTimeSlots(startTime, endTime, 15);

  Array.from(timeSlotSelect.options).forEach((option) => {
    const key = getSlotKey(currentDate, option.value);
    const used = slotCounts[key] || 0;
    const remaining = Math.max(0, MAX_BOOKINGS_PER_SLOT - used);
    option.textContent = `${option.value} ${remaining > 0 ? `(${remaining} left)` : '(Fully Booked)'}`;
    option.disabled = remaining === 0 || !allowedSlots.includes(option.value);
  });

  if (timeSlotSelect.selectedOptions.length === 0 || timeSlotSelect.selectedOptions[0].disabled) {
    const firstAvailable = Array.from(timeSlotSelect.options).find((option) => !option.disabled);
    if (firstAvailable) {
      timeSlotSelect.value = firstAvailable.value;
    }
  }
}

function handleBookingSubmit(event) {
  event.preventDefault();
  bookingFeedback.textContent = '';

  if (isSubmitting) {
    return;
  }

  isSubmitting = true;

  const submitButton = bookingForm.querySelector(
    'button[type="submit"]'
  );

  submitButton.disabled = true;
  submitButton.textContent = 'Booking...';

  if (!currentCandidateName) {
    bookingFeedback.textContent = 'Please complete Step 1 before booking.';
    return;
  }

  const date = interviewDateSelect.value;
  const time = timeSlotSelect.value;
  const key = getSlotKey(date, time);
  const used = slotCounts[key] ?? 0;

  if (used >= MAX_BOOKINGS_PER_SLOT) {
    bookingFeedback.textContent = 'This slot is already fully booked. Please select another time.';
    loadAvailability();
    return;
  }

  const bookingPayload = {
    action: 'book',
    name: currentCandidateName,
    date,
    time,
  };

  if (!isBackendConfigured()) {
    displayConfirmation({
      name: currentCandidateName,
      date,
      time,
      reference: generateBookingReference(currentCandidateName),
    });
    return;
  }

  fetch(API_BASE_URL, {
    method: 'POST',
    mode: 'cors',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(bookingPayload),
  })
    .then((response) => response.json())
    .then((data) => {
      if (!data.success) {
        bookingFeedback.textContent = data.error || 'Unable to complete booking. Please try again.';
        loadAvailability();
        return;
      }

      const booking = data.booking;
      displayConfirmation(booking);
      loadAvailability();
    })
    .catch(() => {
        bookingFeedback.textContent =
            'Unable to connect to Google Sheets. Please try again later.';
    })
    .finally(() => {
        isSubmitting = false;
        submitButton.disabled = false;
        submitButton.textContent = 'Book Interview';
    });
}

function displayConfirmation({ name, date, time, reference }) {
  confirmName.textContent = name;
  confirmDate.textContent = date;
  confirmTime.textContent = time;
  confirmReference.textContent = reference;

  bookingStep.classList.add('hidden');
  confirmationSection.classList.remove('hidden');
}

function resetBookingFlow() {
  confirmationSection.classList.add('hidden');
  bookingStep.classList.add('hidden');
  nameStep.classList.remove('hidden');
  fullNameInput.value = '';
  currentCandidateName = '';
  nameFeedback.textContent = '';
  bookingFeedback.textContent = '';
  slotQuota.textContent = 'Choose a date and slot to view remaining quota.';
}

function toggleAdminView() {
  const visible = adminSection.classList.toggle('hidden');
  adminSection.classList.toggle('hidden', !visible);
  if (!visible) {
    adminFeedback.textContent = '';
    loadAdminBookings();
  }
}

function loadAdminBookings() {
  adminFeedback.textContent = '';
  if (!isBackendConfigured()) {
    adminFeedback.textContent = 'Admin view requires the Google Apps Script web app URL to be set in script.js.';
    return;
  }

  const url = `${API_BASE_URL}?action=admin`;

  fetch(url, {
    method: 'GET',
    mode: 'cors',
    cache: 'no-store',
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.error) {
        adminFeedback.textContent = data.error;
        return;
      }

      renderAdminTable(data.bookings || []);
    })
    .catch(() => {
      adminFeedback.textContent = 'Unable to load booking records from Google Sheets.';
    });
}

function renderAdminTable(bookings) {
  adminTableBody.innerHTML = '';
  if (bookings.length === 0) {
    adminTableBody.innerHTML = '<tr><td colspan="5">No bookings found.</td></tr>';
    return;
  }

  bookings.forEach((booking) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(booking.name)}</td>
      <td>${escapeHtml(booking.date)}</td>
      <td>${escapeHtml(booking.time)}</td>
      <td>${escapeHtml(booking.reference)}</td>
      <td>${escapeHtml(booking.timestamp)}</td>
    `;
    adminTableBody.appendChild(row);
  });
}

function escapeHtml(value) {
  if (!value) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function generateBookingReference(name) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase())
    .slice(0, 3)
    .join('');
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 900 + 100);
  return `${initials}-${timestamp}-${random}`;
}

function isBackendConfigured() {
  return !GOOGLE_APPS_SCRIPT_WEB_APP_URL.includes('SET_YOUR_GOOGLE_SCRIPT_URL_HERE');
}
