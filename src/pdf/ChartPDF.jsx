// CENPLAFAM two-row chart layout
// @react-pdf/renderer uses Helvetica by default which covers Portuguese diacritics
import {
  Document, Page, View, Text, Svg, Circle, Line,
  StyleSheet,
} from '@react-pdf/renderer';

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

function DayColumn({ day, obs }) {
  const stamp = obs?.stamp || null;
  const mucusMap = { opaco:'Op', cremoso:'Cr', transparente:'Tr', elastico:'El' };
  const sensMap  = { sangramento:'Sang', seco:'Seco', muco:'Muco', apice:'Ápice' };
  const bleedMap = { intenso:'●●●', moderado:'●●', leve:'●', manchas:'·' };

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
        {stamp ? sensMap[stamp] || '' : ''}
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

function ChartRow({ days, label }) {
  return (
    <View>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
        {/* Row legend */}
        <View style={{ width: 40, marginRight: 4 }}>
          {['Data','Dia','Obs.','Sens.','Muco','Sang.','Rel.'].map((l, i) => (
            <View key={i} style={{ height: i === 2 ? 26 : 13, justifyContent: 'center' }}>
              <Text style={{ fontSize: 5.5, color: '#888', textAlign: 'right' }}>{l}</Text>
            </View>
          ))}
        </View>
        {/* Day columns */}
        {days.map(d => (
          <DayColumn key={d.n} day={d} obs={d.obs} />
        ))}
      </View>
    </View>
  );
}

export function ChartDocument({ cycle, history = [], instructor = null }) {
  const { start, obs = {} } = cycle;
  const allCycles = [...history, cycle];
  const cycleNum  = allCycles.length;

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

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Gráfico do Ciclo — Método de Ovulação Billings (MOB)</Text>
            <Text style={styles.headerSub}>Ciclo Nº {cycleNum}  ·  Início: {fmtDate(start)}</Text>
            {instructor && (
              <Text style={styles.headerSub}>Instrutora: {instructor.name}  ·  {instructor.email}</Text>
            )}
          </View>
          <View style={{ alignItems:'flex-end' }}>
            <Text style={{ fontSize: 7, color: '#888' }}>Gerado em {fmtDate(new Date().toISOString().split('T')[0])}</Text>
          </View>
        </View>

        {/* Chart rows */}
        <ChartRow days={topRow}    label="Dias 1 – 16" />
        <ChartRow days={bottomRow} label="Dias 17 – 35" />

        {/* Legend */}
        <View style={styles.legend}>
          <Text style={{ fontSize: 7, color: '#555', fontFamily: 'Helvetica-Bold' }}>Legenda:  </Text>
          {[
            { fill:'#CC3333', label:'Sangramento / Menstruação' },
            { fill:'#336633', label:'Seco / PBI' },
            { fill:'#F5F0DC', label:'Muco presente / Ponto de mudança' },
            { fill:'#F5F0DC', label:'Ápice (✕) — último dia lubrificante' },
            { fill:'transparent', label:'♥ Relações íntimas' },
          ].map((item, i) => (
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
          <Text style={{ fontSize: 7, color: '#888', fontFamily: 'Helvetica-Bold' }}>Notas do ciclo:</Text>
          {Object.entries(obs).filter(([,o]) => o?.notes).slice(0, 6).map(([date, o]) => (
            <Text key={date} style={{ fontSize: 7, color: '#555', marginTop: 2 }}>
              {fmtDate(date)}: {o.notes}
            </Text>
          ))}
        </View>

        {/* Disclaimer */}
        <Text style={styles.disclaimer}>
          Este gráfico é uma ferramenta de registro. A interpretação do ciclo é exclusiva da instrutora credenciada CENPLAFAM/WOOMB.
        </Text>
      </Page>
    </Document>
  );
}
