const KEY = 'billings-mob-v1';

export function loadData() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveData(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Storage error', e);
  }
}

/**
 * User-scoped data storage. When a userId is provided, data is stored under
 * 'billings-mob-v1-{userId}' — isolated per authenticated user.
 * Falls back to anonymous key when no userId is given (offline / not logged in).
 */
export function loadUserData(userId) {
  const key = userId ? `${KEY}-${userId}` : KEY;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveUserData(data, userId) {
  const key = userId ? `${KEY}-${userId}` : KEY;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error('Storage error', e);
  }
}

export function loadApiKey() {
  return localStorage.getItem('billings-api-key') || '';
}

export function saveApiKey(key) {
  localStorage.setItem('billings-api-key', key);
}

// Reminder: check if user logged today
export function didLogToday(dateStr) {
  return localStorage.getItem(`billings-log-${dateStr}`) === '1';
}

export function markLoggedToday(dateStr) {
  localStorage.setItem(`billings-log-${dateStr}`, '1');
}

export function getLastOpenDate() {
  return localStorage.getItem('billings-last-open') || null;
}

export function setLastOpenDate(dateStr) {
  localStorage.setItem('billings-last-open', dateStr);
}
