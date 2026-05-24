// RFC 5545-compliant ICS generator
// Uses CRLF (\r\n) as required by the spec

function pad(n) {
  return String(n).padStart(2, '0');
}

function toICSDate(d) {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function escapeText(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export function generateDailyReminder({ hour = 21, minute = 0, count = 365 } = {}) {
  const now = new Date();
  const startLocal = new Date(
    now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0
  );
  if (startLocal < now) startLocal.setDate(startLocal.getDate() + 1);

  const dtstart  = toICSDate(startLocal);
  const dtend    = toICSDate(new Date(startLocal.getTime() + 5 * 60 * 1000));
  const dtstamp  = toICSDate(now);
  const uid      = `billings-mob-${dtstamp}-${Math.random().toString(36).slice(2)}@billings`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Billings MOB PWA//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `RRULE:FREQ=DAILY;COUNT=${count}`,
    `SUMMARY:${escapeText('Anotar observação Billings (MOB)')}`,
    `DESCRIPTION:${escapeText('Registre sensação e aparência do muco ao final do dia. Acesse o app Billings Gráfico.')}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText('Hora de anotar seu registro Billings')}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ];

  // Critical: RFC 5545 §3.1 requires CRLF
  return lines.join('\r\n');
}

export function downloadICS(content, filename = 'lembrete-billings.ics') {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
