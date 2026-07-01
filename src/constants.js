// DS — Wise-inspired design tokens, backed by the CSS custom properties in
// src/styles/tokens.css (single source of truth; dark mode = .dark variable
// swap). Kept as a JS object only for the remaining inline-styled components
// (DayDetailModal, LinkInstructorPage, NotificationPreferencesPage, feedback/*);
// new code uses Tailwind classes instead.
export const DS = {
  // Palette (CSS-var backed — resolves per theme)
  primary:    'rgb(var(--color-primary))',
  secondary:  'rgb(var(--color-secondary))',
  bg:         'rgb(var(--color-bg))',
  surface:    'rgb(var(--color-surface))',
  textMain:   'rgb(var(--color-text-main))',
  textSec:    'rgb(var(--color-text-sec))',
  border:     'rgb(var(--color-border))',
  success:    'rgb(var(--color-success))',
  warning:    'rgb(var(--color-warning))',
  error:      'rgb(var(--color-danger))',
  primaryLight:   'rgb(var(--color-primary-light))',
  primaryBorder:  'rgb(var(--color-primary) / 0.35)',
  successLight:   'rgb(var(--color-success-light))',
  successBorder:  'rgb(var(--color-success) / 0.4)',
  warningLight:   'rgb(var(--color-warning-light))',
  warningBorder:  'rgb(var(--color-warning) / 0.45)',
  errorLight:     'rgb(var(--color-danger-light))',
  errorBorder:    'rgb(var(--color-danger) / 0.4)',
  warningText:    'rgb(var(--color-warning))',
  bleedingColor:  'var(--stamp-sangramento-ink)', // clinical notation color — theme-invariant
  // Shape & shadow tokens
  radiusCard:   8,
  radiusBtn:    24,
  radiusInput:  8,
  shadowCard:   'var(--shadow-card)',
  shadowModal:  'var(--shadow-modal)',
  shadowFAB:    'var(--shadow-fab)',
};

export const STAMPS = [
  { id:'sangramento', sym:'●', label:'Sangramento', sub:'Menstruação',          c:'var(--stamp-sangramento-ink)', bg:'var(--stamp-sangramento-bg)', border:'var(--stamp-sangramento-ring)' },
  { id:'seco',        sym:'|', label:'Seco',         sub:'PBI — sem muco',      c:'var(--stamp-seco-ink)',        bg:'var(--stamp-seco-bg)',        border:'var(--stamp-seco-ring)'        },
  { id:'muco',        sym:'○', label:'Muco',         sub:'Fluxo presente',      c:'var(--stamp-muco-ink)',        bg:'var(--stamp-muco-bg)',        border:'var(--stamp-muco-ring)'        },
  { id:'apice',       sym:'✕', label:'Ápice',        sub:'Último dia lubrificante', c:'var(--stamp-apice-ink)',  bg:'var(--stamp-apice-bg)',        border:'var(--stamp-apice-ring)'       },
];

export const MUCUS = [
  { id:'opaco',        label:'Opaco / Pegajoso',   desc:'Espesso, esbranquiçado ou amarelado' },
  { id:'cremoso',      label:'Cremoso',            desc:'Consistência pastosa ou leitosa' },
  { id:'transparente', label:'Transparente',       desc:'Claro, liso ou aquoso' },
  { id:'elastico',     label:'Fios elásticos',     desc:'Elástico como clara de ovo — próximo ao Ápice' },
];

export const BLEEDING = [
  { id:'intenso',  label:'Intenso'  },
  { id:'moderado', label:'Moderado' },
  { id:'leve',     label:'Leve'     },
  { id:'manchas',  label:'Manchas'  },
];

export const SENSACAO = [
  { id: 'seca',         label: 'Seca',         desc: 'Sem sensação de umidade' },
  { id: 'molhada',      label: 'Molhada',       desc: 'Sensação de umidade' },
  { id: 'lubrificante', label: 'Lubrificante',  desc: 'Escorregadia / lubrificada' },
];

export const TIPO_OBSERVACAO = [
  { id: 'sangue',  label: 'Sangue'  },
  { id: 'manchas', label: 'Manchas' },
  { id: 'outro',   label: 'Outro'   },
];

export const EMPTY_FORM = {
  stamp: null, mucus: null, bleeding: null, sensacao: null, tipo_observacao: null, notes: '', relations: false, observacao_descricao: null,
};
