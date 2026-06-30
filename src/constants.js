export const C = {
  bg:          '#DDD3C4',
  surface:     '#D4C9B8',
  card:        '#E4D8C8',
  border:      '#B8A898',
  borderStrong:'#9A8878',
  text:        '#241408',
  textSec:     '#6A5040',
  textMuted:   '#9A8070',
  terra:       'var(--stamp-apice-ink)', // same hue as ápice ink; hex defined in src/styles/tokens.css
  terraLight:  '#E8C8BC',
  terraBorder: '#C49080',
  sage:        '#3E5E48',
  sageLight:   '#C8D8CC',
  sageBorder:  '#7EA48A',
  amber:       '#846010',
  amberLight:  '#E4D4A0',
  amberBorder: '#B89848',
  rose:        '#7A2828',
  roseLight:   '#E8C8C8',
  roseBorder:  '#C09090',
  white:       '#F0E8DC',
  shadow:      'rgba(44,26,16,0.12)',
};

/**
 * DS — Wise-inspired design system tokens (Sprint 6.5)
 * Use these for all new or redesigned components.
 * Legacy C tokens remain for backwards compatibility with untouched components.
 */
export const DS = {
  // Palette
  primary:    '#37517E',
  secondary:  '#2EC4B6',
  bg:         '#F7F8FA',
  surface:    '#FFFFFF',
  textMain:   '#1A2B4A',
  textSec:    '#6B7280',
  border:     '#E5E7EB',
  success:    '#10B981',
  warning:    '#F59E0B',
  error:      '#EF4444',
  primaryLight:   '#EBF0F8',
  primaryBorder:  '#C7D4EC',
  successLight:   '#DCFCE7',
  successBorder:  '#86EFAC',
  warningLight:   '#FEF3C7',
  warningBorder:  '#FCD34D',
  errorLight:     '#FEE2E2',
  errorBorder:    '#FCA5A5',
  warningText:    '#92400E',
  bleedingColor:  'var(--stamp-sangramento-ink)', // clinical notation color — theme-invariant, see src/styles/tokens.css
  // Shape & shadow tokens
  radiusCard:   8,
  radiusBtn:    24,
  radiusInput:  8,
  shadowCard:   '0 1px 3px rgba(0,0,0,0.08)',
  shadowModal:  '0 4px 24px rgba(26,43,74,0.18)',
  shadowFAB:    '0 4px 16px rgba(55,81,126,0.4)',
};

/**
 * STAMPS — clinical notation symbols.
 * Colors reference CSS custom properties defined in src/styles/tokens.css.
 * These are theme-invariant: clinical notation colors do NOT change in dark mode.
 */
export const STAMPS = [
  { id:'sangramento', sym:'●', label:'Sangramento', sub:'Menstruação',              c:'var(--stamp-sangramento-ink)', bg:'var(--stamp-sangramento-bg)', border:'var(--stamp-sangramento-ring)' },
  { id:'seco',        sym:'|', label:'Seco',         sub:'PBI — sem muco',          c:'var(--stamp-seco-ink)',        bg:'var(--stamp-seco-bg)',        border:'var(--stamp-seco-ring)'        },
  { id:'muco',        sym:'○', label:'Muco',         sub:'Fluxo presente',          c:'var(--stamp-muco-ink)',        bg:'var(--stamp-muco-bg)',        border:'var(--stamp-muco-ring)'        },
  { id:'apice',       sym:'✕', label:'Ápice',        sub:'Último dia lubrificante', c:'var(--stamp-apice-ink)',       bg:'var(--stamp-apice-bg)',       border:'var(--stamp-apice-ring)'       },
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
