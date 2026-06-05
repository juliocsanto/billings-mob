// CENPLAFAM two-row chart layout
// @react-pdf/renderer uses Helvetica by default which covers Portuguese diacritics
import {
  Document, Page, View, Text, Svg, Circle, Line,
  StyleSheet,
} from '@react-pdf/renderer';
import { useTranslation } from 'react-i18next';

// ── Stamp colors aligned with CENPLAFAM legend ──
const STAMP_COLORS = {
  sangramento: { fill: '#CC3333', stroke: '#992222', text: '' },
  seco:        { fill: '#336633', stroke: '#224422', text: '' },
  muco:        { fill: '#F5F0DC', stroke: '#887730', text: '' },
  apice:       { fill: '#F5F0DC', stroke: '#8C3C28', text: '✕' },
};

const styles = StyleSheet.create({
  page:        { padding: 16, fontFamily: 'Helvetica', backgroundColor: '#FFFFFF' },
  header:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, borderBottomWidth: 1, borderColor: '#CCC', paddingBottom: 6 },
  headerLeft:  { flexDirection: 'column', gap: 2 },
  headerTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  headerSub:   { fontSize: 8, color: '#666' },
  sectionLabel:{ fontSize: 7, color: '#888', marginBottom: 3, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  row:         { flexDirection: 'row', marginBottom: 8 },
  dayCol:      { width: 24, borderWidth: 0.5, borderColor: '#BBBBBB', alignItems: 'center' },
  cellLabel:   { fontSize: 6, color: '#666', backgroundColor: '#F5F5F5', width: '100%', textAlign: 'center', paddingVertical: 1, borderBottomWidth: 0.5, borderColor: '#DDD' },
  cellDate:    { fontSize: 7, paddingVertical: 1, textAlign: 'center' },
  cellStamp:   { height: 24, alignItems: 'center', justifyContent: 'center', borderTopWidth: 0.5, borderColor: '#DDD' },
  cellText:    { fontSize: 6, paddingVertical: 1, textAlign: 'center', color: '#444' },
  legend:      { flexDirection: 'row', gap: 12, marginTop: 8, flexWrap: 'wrap' },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendText:  { fontSize: 7, color: '#555' },
  rowLabel:    { width: 52, justifyContent: 'center' },
  rowLabelTxt: { fontSize: 7, color: '#666', fontFamily: 'Helvetica-Bold' },
  disclaimer:  { fontSize: 6, color: '#888', marginTop: 8, textAlign: 'center' },
});

function StampCircle({ stamp }) {
  if (!stamp) {
    return (
      <Svg width={18} height={18} viewBox="0 0 18 18">
        <Circle cx={9} cy={9} r={7} fill="none" stroke="#DDD" strokeWidth={0.5} />
      </Svg>
    );
  }
  const s = STAMP_COLORS[stamp] || { fill: '#EEE', stroke: '#999', text: '' };
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      <Circle cx={9} cy={9} r={7} fill={s.fill} stroke={s.stroke} strokeWidth={1} />
    </Svg>
  );
}

function DayColumn({ day, obs, stampLabels, mucusMap, bleedMap }) {
  const stamp = obs?.stamp || null;

  return (
    <View style={styles.dayCol}>
      {/* Date */}
      <Text style={styles.cellDate}>{day.date ? new Date(day.date+'T12:00:00').getDate() : ''}</Text>
      {/* Day number */}
      <Text style={[styles.cellText, { borderTopWidth: 0.5, borderColor: '#DDD', color: '#333', fontFamily:'Helvetica-Bold' }]}>
        {day.n}
      </Text>
      {/* Stamp */}
      <View style={styles.cellStamp}>
        <StampCircle stamp={stamp} />
        {stamp === 'apice' && <Text style={{ fontSize: 7, position:'absolute', color:'#8C3C28', fontFamily:'Helvetica-Bold' }}>✕</Text>}
      </View>
      {/* Sensation */}
      <Text style={[styles.cellText, { borderTopWidth: 0.5, borderColor: '#DDD', fontSize: 5.5 }]}>
        {stamp ? stampLabels[stamp] || '' : ''}
      </Text>
      {/* Mucus type */}
      <Text style={[styles.cellText, { borderTopWidth: 0.5, borderColor: '#DDD', color: '#886000' }]}>
        {obs?.mucus ? mucusMap[obs.mucus] || '' : ''}
      </Text>
      {/* Bleeding */}
      <Text style={[styles.cellText, { borderTopWidth: 0.5, borderColor: '#DDD', color: '#993333', fontSize: 6 }]}>
        {obs?.bleeding ? bleedMap[obs.bleeding] || '' : ''}
      </Text>
      {/* Relations */}
      <Text style={[styles.cellText, { borderTopWidth: 0.5, borderColor: '#DDD', color: '#993333', fontSize: 8 }]}>
        {obs?.relations ? '♥' : ''}
      </Text>
    </View>
  );
}

function ChartRow({ days, label, stampLabels, mucusMap, bleedMap, rowLabels }) {
  return (
    <View>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
        {/* Row legend */}
        <View style={{ width: 40, marginRight: 4 }}>
          {rowLabels.map((l, i) => (
            <View key={i} style={{ height: i === 2 ? 26 : 13, justifyContent: 'center' }}>
              <Text style={{ fontSize: 5.5, color: '#888', textAlign: 'right' }}>{l}</Text>
            </View>
          ))}
        </View>
        {/* Day columns */}
        {days.map(d => (
          <DayColumn key={d.n} day={d} obs={d.obs} stampLabels={stampLabels} mucusMap={mucusMap} bleedMap={bleedMap} />
        ))}
      </View>
    </View>
  );
}

export function ChartDocument({ cycle, history = [], instructor = null }) {
  const { t } = useTranslation();
  const { start, obs = {} } = cycle;
  const allCycles = [...history, cycle];
  const cycleNum  = allCycles.length;

  // Localised label maps
  const stampLabels = {
    sangramento: t('pdf.stampSangramento'),
    seco:        t('pdf.stampSeco'),
    muco:        t('pdf.stampMuco'),
    apice:       t('pdf.stampApice'),
  };
  const mucusMap = { opaco:'Op', cremoso:'Cr', transparente:'Tr', elastico:'El' };
  const bleedMap = { intenso:'●●●', moderado:'●●', leve:'●', manchas:'·' };
  const rowLabels = [
    t('pdf.rowData'),
    t('pdf.rowDay'),
    t('pdf.rowObs'),
    t('pdf.rowSens'),
    t('pdf.rowMucus'),
    t('pdf.rowBleeding'),
    t('pdf.rowRelations'),
  ];

  // Build 35-day array
  const allDays = [];
  for (let i = 0; i < 35; i++) {
    const d = new Date(start + 'T12:00:00');
    d.setDate(d.getDate() + i);
    const date = d.toISOString().split('T')[0];
    allDays.push({ n: i + 1, date, obs: obs[date] || null });
  }

  const topRow    = allDays.slice(0, 16);   // days 1–16
  const bottomRow = allDays.slice(16, 35);  // days 17–35

  const fmtDate = ds =>
    new Date(ds + 'T12:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' });

  const legendItems = [
    { fill:'#CC3333', label: t('pdf.legendBleeding') },
    { fill:'#336633', label: t('pdf.legendDry') },
    { fill:'#F5F0DC', label: t('pdf.legendMucus') },
    { fill:'#F5F0DC', label: t('pdf.legendApice') },
    { fill:'transparent', label: t('pdf.legendRelations') },
  ];

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>{t('pdf.chartTitle')}</Text>
            <Text style={styles.headerSub}>{t('pdf.cycleNumber', {num: cycleNum})}  ·  {t('pdf.cycleStart', {date: fmtDate(start)})}</Text>
            {instructor && (
              <Text style={styles.headerSub}>{t('pdf.instructor', {name: instructor.name, email: instructor.email})}</Text>
            )}
          </View>
          <View style={{ alignItems:'flex-end' }}>
            <Text style={{ fontSize: 7, color: '#888' }}>{t('pdf.generatedOn', {date: fmtDate(new Date().toISOString().split('T')[0])})}</Text>
          </View>
        </View>

        {/* Chart rows */}
        <ChartRow days={topRow}    label={t('pdf.rowDays1_16')} stampLabels={stampLabels} mucusMap={mucusMap} bleedMap={bleedMap} rowLabels={rowLabels} />
        <ChartRow days={bottomRow} label={t('pdf.rowDays17_35')} stampLabels={stampLabels} mucusMap={mucusMap} bleedMap={bleedMap} rowLabels={rowLabels} />

        {/* Legend */}
        <View style={styles.legend}>
          <Text style={{ fontSize: 7, color: '#555', fontFamily: 'Helvetica-Bold' }}>{t('pdf.legendLabel')}</Text>
          {legendItems.map((item, i) => (
            <View key={i} style={styles.legendItem}>
              <Svg width={10} height={10} viewBox="0 0 10 10">
                <Circle cx={5} cy={5} r={4} fill={item.fill} stroke="#888" strokeWidth={0.5} />
              </Svg>
              <Text style={styles.legendText}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* Notes */}
        <View style={{ marginTop: 8, borderTopWidth: 0.5, borderColor: '#CCC', paddingTop: 4 }}>
          <Text style={{ fontSize: 7, color: '#888', fontFamily: 'Helvetica-Bold' }}>{t('pdf.cycleNotes')}</Text>
          {Object.entries(obs).filter(([,o]) => o?.notes).slice(0, 6).map(([date, o]) => (
            <Text key={date} style={{ fontSize: 7, color: '#555', marginTop: 2 }}>
              {fmtDate(date)}: {o.notes}
            </Text>
          ))}
        </View>

        {/* Disclaimer */}
        <Text style={styles.disclaimer}>
          {t('pdf.disclaimer')}
        </Text>
      </Page>
    </Document>
  );
}
