export const today = () => new Date().toISOString().split('T')[0];

export const fmtLong = (ds) =>
  new Date(ds + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

export const fmtShort = (ds) =>
  new Date(ds + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short',
  });

export const fmtMonthYear = (ds) =>
  new Date(ds + 'T12:00:00').toLocaleDateString('pt-BR', {
    month: 'short', year: 'numeric',
  });

export const getDay = (ds) => new Date(ds + 'T12:00:00').getDate();

export const addDays = (ds, n) => {
  const d = new Date(ds + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
};

export const diffDays = (ds1, ds2) => {
  const a = new Date(ds1 + 'T12:00:00');
  const b = new Date(ds2 + 'T12:00:00');
  return Math.round((b - a) / 86400000);
};

export const genDays = (startDate, obs = {}, total = 35) => {
  const days = [];
  for (let i = 0; i < total; i++) {
    const date = addDays(startDate, i);
    days.push({ n: i + 1, date, obs: obs[date] || null });
  }
  return days;
};
