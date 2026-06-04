
import { useState, useEffect, useRef } from 'react';
import { pdf } from '@react-pdf/renderer';
import { ChartDocument } from './pdf/ChartPDF.jsx';
import { C, DS, STAMPS, MUCUS, BLEEDING, EMPTY_FORM } from './constants.js';
import { loadUserData, saveUserData, loadApiKey, saveApiKey, getLastOpenDate, setLastOpenDate } from './utils/storage.js';
import { today, fmtLong, fmtShort, fmtMonthYear, getDay, genDays, addDays, diffDays } from './utils/dates.js';
import { computeMultiCycleStats, getApiceDay } from './utils/analysis.js';
import { generateDailyReminder, downloadICS } from './utils/ics.js';
import { DayDetailModal } from './components/DayDetailModal.jsx';
import { LinkInstructorPage } from './pages/LinkInstructorPage.tsx';
import { NotificationPreferencesPage } from './pages/NotificationPreferencesPage.tsx';

// ── Micro-components ──────────────────────────────────────

const Tag = ({ label, color, bg, border }) => (
  <span style={{ fontSize:11, fontWeight:600, color, background:bg, border:`1px solid ${border}`,
    borderRadius:4, padding:'3px 10px', letterSpacing:'0.04em' }}>
    {label}
  </span>
);

const Lbl = ({ children }) => (
  <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase',
    color:C.textMuted, marginBottom:10 }}>
    {children}
  </div>
);

const Pill = ({ label, active, color, onClick }) => (
  <button onClick={onClick} style={{
    background: active ? `${color}22` : C.card,
    border:`1.5px solid ${active ? color : C.border}`,
    borderRadius:20, padding:'6px 14px', fontSize:12, fontWeight:500,
    color: active ? color : C.textSec, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s',
  }}>{label}</button>
);

// ── Demo data ─────────────────────────────────────────────

function buildDemoData() {
  const tod = today();
  const daysAgo = n => { const d=new Date(tod+'T12:00:00'); d.setDate(d.getDate()-n); return d.toISOString().split('T')[0]; };
  const DS = daysAgo(28);
  const mkCycle = (startOffset, duration, apiceD) => {
    const start = daysAgo(startOffset + duration - 1);
    const obs = {};
    for (let i=0;i<duration;i++) {
      const d = new Date(start+'T12:00:00'); d.setDate(d.getDate()+i);
      const ds = d.toISOString().split('T')[0]; const n=i+1;
      if(n<=5)       obs[ds]={stamp:'sangramento',bleeding:n<=2?'intenso':n<=4?'moderado':'leve',mucus:null,notes:n===1?'Início do ciclo':'',relations:false};
      else if(n<=8)  obs[ds]={stamp:'seco',bleeding:null,mucus:null,notes:'',relations:false};
      else if(n<=10) obs[ds]={stamp:'muco',bleeding:null,mucus:'opaco',notes:n===9?'Primeiro sinal':'',relations:false};
      else if(n<=12) obs[ds]={stamp:'muco',bleeding:null,mucus:'cremoso',notes:'',relations:false};
      else if(n<=13) obs[ds]={stamp:'muco',bleeding:null,mucus:'transparente',notes:'',relations:false};
      else if(n===14)obs[ds]={stamp:'muco',bleeding:null,mucus:'elastico',notes:'Fios elásticos',relations:false};
      else if(n===apiceD) obs[ds]={stamp:'apice',bleeding:null,mucus:null,notes:'Informei instrutora',relations:false};
      else           obs[ds]={stamp:'seco',bleeding:null,mucus:null,notes:'',relations:n===17||n===22};
    }
    return {start, obs, duration, label: new Date(start+'T12:00:00').toLocaleDateString('pt-BR',{month:'short',year:'numeric'})};
  };
  const DO = {};
  [
    [daysAgo(28),{stamp:'sangramento',bleeding:'intenso',mucus:null,notes:'Início do ciclo',relations:false}],
    [daysAgo(27),{stamp:'sangramento',bleeding:'intenso',mucus:null,notes:'',relations:false}],
    [daysAgo(26),{stamp:'sangramento',bleeding:'moderado',mucus:null,notes:'',relations:false}],
    [daysAgo(25),{stamp:'sangramento',bleeding:'moderado',mucus:null,notes:'',relations:false}],
    [daysAgo(24),{stamp:'sangramento',bleeding:'leve',mucus:null,notes:'',relations:false}],
    [daysAgo(23),{stamp:'sangramento',bleeding:'manchas',mucus:null,notes:'',relations:false}],
    [daysAgo(22),{stamp:'seco',bleeding:null,mucus:null,notes:'',relations:false}],
    [daysAgo(21),{stamp:'seco',bleeding:null,mucus:null,notes:'',relations:false}],
    [daysAgo(20),{stamp:'seco',bleeding:null,mucus:null,notes:'',relations:false}],
    [daysAgo(19),{stamp:'muco',bleeding:null,mucus:'opaco',notes:'Primeiro sinal de muco',relations:false}],
    [daysAgo(18),{stamp:'muco',bleeding:null,mucus:'opaco',notes:'',relations:false}],
    [daysAgo(17),{stamp:'muco',bleeding:null,mucus:'cremoso',notes:'',relations:false}],
    [daysAgo(16),{stamp:'muco',bleeding:null,mucus:'cremoso',notes:'',relations:true}],
    [daysAgo(15),{stamp:'muco',bleeding:null,mucus:'transparente',notes:'Sensação molhada',relations:false}],
    [daysAgo(14),{stamp:'muco',bleeding:null,mucus:'elastico',notes:'Fios elásticos longos',relations:false}],
    [daysAgo(13),{stamp:'apice',bleeding:null,mucus:null,notes:'Informei a instrutora',relations:false}],
    [daysAgo(12),{stamp:'seco',bleeding:null,mucus:null,notes:'',relations:false}],
    [daysAgo(11),{stamp:'seco',bleeding:null,mucus:null,notes:'',relations:true}],
    [daysAgo(10),{stamp:'seco',bleeding:null,mucus:null,notes:'',relations:false}],
    [daysAgo(9), {stamp:'seco',bleeding:null,mucus:null,notes:'',relations:false}],
    [daysAgo(8), {stamp:'seco',bleeding:null,mucus:null,notes:'',relations:false}],
    [daysAgo(7), {stamp:'seco',bleeding:null,mucus:null,notes:'',relations:false}],
    [daysAgo(6), {stamp:'seco',bleeding:null,mucus:null,notes:'',relations:false}],
    [daysAgo(5), {stamp:'seco',bleeding:null,mucus:null,notes:'',relations:false}],
    [daysAgo(4), {stamp:'seco',bleeding:null,mucus:null,notes:'',relations:false}],
    [daysAgo(3), {stamp:'seco',bleeding:null,mucus:null,notes:'',relations:false}],
    [daysAgo(2), {stamp:'seco',bleeding:null,mucus:null,notes:'Consulta marcada',relations:false}],
    [daysAgo(1), {stamp:'seco',bleeding:null,mucus:null,notes:'',relations:false}],
  ].forEach(([k,v]) => { DO[k]=v; });
  const DH = [
    {...mkCycle(29,28,15), label:'Abr 2026'},
    {...mkCycle(58,29,16), label:'Mar 2026'},
    {...mkCycle(88,27,15), label:'Fev 2026'},
  ];
  return { cycleStart:DS, obs:DO, history:DH };
}

// ── Main App ──────────────────────────────────────────────

export default function App({ user, session } = {}) {
  const userId = user?.id ?? null;
  const [tab,          setTab]          = useState('hoje');
  const [cycleStart,   setCycleStart]   = useState(today());
  const [obs,          setObs]          = useState({});
  const [form,         setForm]         = useState({...EMPTY_FORM});
  const [saved,        setSaved]        = useState(false);
  const [loaded,       setLoaded]       = useState(false);
  const [confirmNew,   setConfirmNew]   = useState(false);
  const [history,      setHistory]      = useState([]);
  const [selCycle,     setSelCycle]     = useState(null);
  const [instructor,   setInstructor]   = useState(null);
  const [instrForm,    setInstrForm]    = useState({name:'',email:''});
  const [instrConfirm, setInstrConfirm] = useState(false);
  const [apiKey,       setApiKey]       = useState('');
  const [msgs,         setMsgs]         = useState([]);
  const [input,        setInput]        = useState('');
  const [aiLoading,    setAiLoading]    = useState(false);
  const [pdfLoading,   setPdfLoading]   = useState(false);
  const [showBanner,   setShowBanner]   = useState(false);
  const [selectedDay,  setSelectedDay]  = useState(null); // { date, n, obs } for DayDetailModal
  const chatEnd = useRef(null);

  // Load persisted data (user-scoped when authenticated, anonymous otherwise)
  useEffect(() => {
    const d = loadUserData(userId);
    const demo = buildDemoData();
    if (d) {
      setObs(d.obs || {}); setCycleStart(d.cycleStart || today());
      setHistory(d.history || demo.history);
      if (d.instructor) setInstructor(d.instructor);
      if (d.obs?.[today()]) { setForm({...EMPTY_FORM, ...d.obs[today()]}); setSaved(true); }
    } else {
      setObs(demo.obs); setCycleStart(demo.cycleStart); setHistory(demo.history);
    }
    setApiKey(loadApiKey());
    // Banner: show if user hasn't logged today
    const last = getLastOpenDate();
    if (last !== today()) { setShowBanner(true); setLastOpenDate(today()); }
    setLoaded(true);
  }, [userId]);

  const persist = (newForm, ns) => {
    const u = {...obs, [today()]: newForm};
    setObs(u);
    const data = { cycleStart: ns||cycleStart, obs:u, history, instructor };
    saveUserData(data, userId); setSaved(true);
  };

  const archiveAndReset = (f, ns) => {
    const archived = { start:cycleStart, obs, label:fmtMonthYear(cycleStart) };
    const nh = [archived, ...history].slice(0,12);
    setHistory(nh); setCycleStart(ns); setObs({[ns]:f}); setForm(f); setSaved(true);
    saveUserData({ cycleStart:ns, obs:{[ns]:f}, history:nh, instructor }, userId);
  };

  const saveInstructor = (instr) => {
    setInstructor(instr);
    const d = loadUserData(userId) || {};
    saveUserData({...d, instructor:instr}, userId);
  };

  const removeInstructor = () => {
    setInstructor(null); setInstrForm({name:'',email:''}); setInstrConfirm(false);
    const d = loadUserData(userId) || {}; delete d.instructor; saveUserData(d, userId);
  };

  // Save edited observation from DayDetailModal (supports past and today)
  const handleDaySave = (date, formData) => {
    const updatedObs = { ...obs, [date]: formData };
    setObs(updatedObs);
    if (date === today()) {
      setForm({ ...EMPTY_FORM, ...formData });
      setSaved(true);
    }
    const data = { cycleStart, obs: updatedObs, history, instructor };
    saveUserData(data, userId);
  };

  const handlePDFDownload = async () => {
    setPdfLoading(true);
    try {
      const cycle = selCycle || { start:cycleStart, obs };
      const blob  = await pdf(<ChartDocument cycle={cycle} history={history} instructor={instructor}/>).toBlob();
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement('a');
      a.href = url; a.download = `grafico-billings-${cycle.start}.pdf`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch(e) { alert('Erro ao gerar PDF: ' + e.message); }
    setPdfLoading(false);
  };

  useEffect(() => { chatEnd.current?.scrollIntoView({behavior:'smooth'}); }, [msgs]);

  const sendAI = async (text) => {
    const msg = text || input.trim(); if (!msg || aiLoading) return;
    setInput(''); setMsgs(p=>[...p,{role:'user',content:msg}]); setAiLoading(true);
    const key = apiKey || loadApiKey();
    if (!key) {
      setMsgs(p=>[...p,{role:'assistant',content:'Para usar o Guia IA, adicione sua chave da API Anthropic na aba Perfil.'}]);
      setAiLoading(false); return;
    }
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
        body:JSON.stringify({
          model:'claude-haiku-4-5-20251001', max_tokens:600,
          system:`Você é um guia do Método de Ovulação Billings (MOB). Ajuda mulheres que já fizeram consultoria com instrutora certificada a usar este aplicativo de registro. NUNCA interprete o ciclo como fértil ou infértil — isso é exclusivo da instrutora. Terminologia: Ápice (não pico), PBI. Seja acolhedora, concisa, em português brasileiro.`,
          messages:[...msgs.slice(-6).map(m=>({role:m.role,content:m.content})),{role:'user',content:msg}],
        }),
      });
      const data = await res.json();
      setMsgs(p=>[...p,{role:'assistant',content:data.content?.find(b=>b.type==='text')?.text||'Erro na resposta.'}]);
    } catch { setMsgs(p=>[...p,{role:'assistant',content:'Erro de conexão.'}]); }
    setAiLoading(false);
  };

  const days     = genDays(cycleStart, obs);
  const todayN   = days.find(d=>d.date===today())?.n || 1;
  const aStamp   = STAMPS.find(s=>s.id===form.stamp);
  const sStamp   = STAMPS.find(s=>s.id===obs[today()]?.stamp);
  const disp     = aStamp || sStamp;
  const phaseMap = {sangramento:'Menstruação',seco:'PBI',muco:'Fase Fértil',apice:'Ápice'};
  const stats    = computeMultiCycleStats({start:cycleStart,obs}, history);

  if (!loaded) return (
    <div style={{background:DS.bg,height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Lato,sans-serif',color:DS.textSec}}>
      Carregando...
    </div>
  );

  return (
    <div style={{background:DS.bg,minHeight:'100vh',fontFamily:'Lato,sans-serif',color:DS.textMain,maxWidth:430,margin:'0 auto',position:'relative'}}>

      {/* Daily reminder banner */}
      {showBanner && (
        <div style={{background:DS.primary,color:DS.surface,padding:'10px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',animation:'fadeIn 0.3s ease',position:'sticky',top:0,zIndex:30}}>
          <span style={{fontSize:12}}>Não esqueça de anotar suas observações de hoje</span>
          <button onClick={()=>setShowBanner(false)} style={{background:'none',border:'none',color:DS.surface,cursor:'pointer',fontSize:16,padding:0}}>✕</button>
        </div>
      )}

      {/* ── HEADER ─────────────────────────────── */}
      <div style={{padding:'20px 22px 0',background:DS.surface,borderBottom:`1px solid ${DS.border}`,boxShadow:DS.shadowCard,position:'sticky',top:showBanner?42:0,zIndex:20}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',paddingBottom:14}}>
          <div>
            <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:20,color:DS.textMain,fontWeight:700}}>Billings Gráfico</div>
            <div style={{fontSize:12,color:DS.textSec,marginTop:2}}>Dia {todayN} do ciclo · {new Date(today()+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}</div>
          </div>
          {disp && <Tag label={phaseMap[disp.id]||disp.label} color={disp.c} bg={disp.bg} border={disp.border}/>}
        </div>
        <div style={{display:'flex',gap:0}}>
          {[{id:'hoje',l:'Hoje'},{id:'grafico',l:'Gráfico'},{id:'analise',l:'Análise'},{id:'guia',l:'Guia'},{id:'vinculo',l:'Vínculo'},{id:'notificacoes',l:'Notific.'},{id:'perfil',l:'Perfil'}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              flex:1,background:'none',border:'none',cursor:'pointer',padding:'10px 0',
              fontSize:11,fontWeight:tab===t.id?700:400,
              color:tab===t.id?DS.primary:DS.textSec,
              borderBottom:`2px solid ${tab===t.id?DS.primary:'transparent'}`,
              transition:'all 0.2s',fontFamily:'inherit',
            }}>{t.l}</button>
          ))}
        </div>
      </div>

      {/* ══ HOJE ══════════════════════════════════════ */}
      {tab==='hoje' && (
        <div style={{padding:'24px 22px 100px'}}>
          {saved && (
            <div style={{background:C.sageLight,border:`1px solid ${C.sageBorder}`,borderRadius:12,padding:'10px 16px',marginBottom:20,display:'flex',alignItems:'center',gap:8}}>
              <span style={{color:C.sage,fontSize:14}}>✓</span>
              <span style={{fontSize:13,color:C.sage}}>Observação de hoje salva</span>
            </div>
          )}

          {/* Stamps */}
          <div style={{marginBottom:24}}>
            <Lbl>Observação de hoje</Lbl>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              {STAMPS.map(s=>{
                const active = form.stamp===s.id;
                return (
                  <button key={s.id} onClick={()=>setForm(p=>({...p,stamp:s.id,mucus:null,bleeding:null}))}
                    style={{background:active?s.bg:C.card,border:`1.5px solid ${active?s.c:C.border}`,borderRadius:14,
                      padding:'16px 14px',textAlign:'left',cursor:'pointer',fontFamily:'inherit',transition:'all 0.2s',
                      boxShadow:active?`0 2px 12px ${C.shadow}`:`0 1px 4px ${C.shadow}`}}>
                    <div style={{width:34,height:34,borderRadius:'50%',background:active?C.white:s.bg,
                      border:`1.5px solid ${s.c}`,display:'flex',alignItems:'center',justifyContent:'center',
                      fontSize:18,color:s.c,marginBottom:10,fontFamily:'Georgia,serif',fontWeight:700}}>{s.sym}</div>
                    <div style={{fontSize:14,fontWeight:700,color:active?s.c:C.text}}>{s.label}</div>
                    <div style={{fontSize:11,color:C.textMuted,marginTop:2}}>{s.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bleeding detail */}
          {form.stamp==='sangramento' && (
            <div style={{marginBottom:22}}>
              <Lbl>Intensidade</Lbl>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {BLEEDING.map(b=>(
                  <Pill key={b.id} label={b.label} active={form.bleeding===b.id} color='#A03030'
                    onClick={()=>setForm(p=>({...p,bleeding:b.id}))}/>
                ))}
              </div>
            </div>
          )}

          {/* Mucus detail */}
          {form.stamp==='muco' && (
            <div style={{marginBottom:22}}>
              <Lbl>Tipo de muco</Lbl>
              {MUCUS.map(m=>(
                <button key={m.id} onClick={()=>setForm(p=>({...p,mucus:m.id}))}
                  style={{display:'block',width:'100%',background:form.mucus===m.id?C.amberLight:C.card,
                    border:`1px solid ${form.mucus===m.id?C.amber:C.border}`,borderRadius:12,
                    padding:'11px 14px',textAlign:'left',cursor:'pointer',fontFamily:'inherit',marginBottom:8,transition:'all 0.15s'}}>
                  <div style={{fontSize:13,fontWeight:700,color:form.mucus===m.id?C.amber:C.text}}>{m.label}</div>
                  <div style={{fontSize:11,color:C.textMuted,marginTop:2}}>{m.desc}</div>
                </button>
              ))}
            </div>
          )}

          {/* Apex info */}
          {form.stamp==='apice' && (
            <div style={{background:C.terraLight,border:`1px solid ${C.terraBorder}`,borderRadius:14,padding:'14px 16px',marginBottom:22}}>
              <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:17,color:C.terra,marginBottom:6,fontStyle:'italic'}}>Ápice marcado</div>
              <div style={{fontSize:12,color:C.textSec,lineHeight:1.8}}>
                Último dia de sensação lubrificante ou escorregadia.<br/>
                A partir do <strong>4º dia após o Ápice</strong> inicia a Fase Lútea.<br/>
                <span style={{color:C.textMuted}}>Informe sua instrutora certificada.</span>
              </div>
            </div>
          )}

          {/* Relations */}
          <div style={{marginBottom:22}}>
            <Lbl>Relações íntimas</Lbl>
            <button onClick={()=>setForm(p=>({...p,relations:!p.relations}))}
              style={{display:'flex',alignItems:'center',gap:12,background:form.relations?C.roseLight:C.card,
                border:`1.5px solid ${form.relations?C.rose:C.border}`,borderRadius:12,padding:'12px 16px',
                cursor:'pointer',fontFamily:'inherit',width:'100%',textAlign:'left',transition:'all 0.2s'}}>
              <div style={{width:22,height:22,borderRadius:'50%',flexShrink:0,
                background:form.relations?C.rose:'transparent',border:`1.5px solid ${form.relations?C.rose:C.borderStrong}`,
                display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,color:'#F0E8DC',transition:'all 0.2s'}}>
                {form.relations?'♥':''}
              </div>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:form.relations?C.rose:C.text}}>
                  {form.relations?'Sim — houve relações hoje':'Não houve relações hoje'}
                </div>
                <div style={{fontSize:11,color:C.textMuted,marginTop:2}}>Visível apenas para a instrutora</div>
              </div>
            </button>
          </div>

          {/* Notes */}
          <div style={{marginBottom:22}}>
            <Lbl>Notas para a instrutora</Lbl>
            <textarea value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))}
              placeholder="Observações adicionais..."
              style={{width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
                padding:'12px 16px',fontSize:13,color:C.text,minHeight:72,
                boxSizing:'border-box',outline:'none',lineHeight:1.6}}
            />
          </div>

          {/* Save */}
          <button onClick={()=>form.stamp&&persist(form)}
            style={{width:'100%',background:form.stamp?C.terra:C.border,color:form.stamp?C.white:C.textMuted,
              border:'none',borderRadius:12,padding:'15px',fontSize:14,fontWeight:700,letterSpacing:'0.06em',
              textTransform:'uppercase',cursor:form.stamp?'pointer':'default',fontFamily:'Lato,sans-serif',
              transition:'all 0.2s',boxShadow:form.stamp?`0 4px 16px rgba(140,60,40,0.25)`:'none',marginBottom:10}}>
            Salvar observação
          </button>

          {!confirmNew ? (
            <button onClick={()=>setConfirmNew(true)}
              style={{width:'100%',background:'transparent',color:C.textMuted,border:`1px solid ${C.border}`,
                borderRadius:12,padding:'12px',fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>
              + Iniciar novo ciclo
            </button>
          ) : (
            <div style={{background:C.roseLight,border:`1px solid ${C.roseBorder}`,borderRadius:14,padding:16}}>
              <div style={{fontSize:13,color:C.rose,marginBottom:12}}>Reinicia o gráfico a partir de hoje. Confirma?</div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>{const f={...EMPTY_FORM,stamp:'sangramento',bleeding:'moderado'};archiveAndReset(f,today());setConfirmNew(false);}}
                  style={{flex:1,background:C.rose,color:C.white,border:'none',borderRadius:10,padding:'10px',fontSize:13,cursor:'pointer',fontFamily:'inherit',fontWeight:700}}>Confirmar</button>
                <button onClick={()=>setConfirmNew(false)}
                  style={{flex:1,background:C.card,color:C.textSec,border:`1px solid ${C.border}`,borderRadius:10,padding:'10px',fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ GRÁFICO ═══════════════════════════════════ */}
      {tab==='grafico' && (() => {
        const vObs   = selCycle ? (selCycle.obs||{}) : obs;
        const vStart = selCycle ? selCycle.start : cycleStart;
        const vDays  = genDays(vStart, vObs);
        const apiceEntry = Object.entries(vObs).find(([,o])=>o.stamp==='apice');
        const apiceN = apiceEntry ? vDays.find(d=>d.date===apiceEntry[0])?.n : null;
        const bm = {intenso:'●●●',moderado:'●●',leve:'●',manchas:'·'};
        const ml = {opaco:'Op',cremoso:'Cr',transparente:'Tr',elastico:'El'};
        return (
          <div style={{paddingBottom:100}}>
            <div style={{padding:'24px 22px 16px',background:DS.surface,borderBottom:`1px solid ${DS.border}`}}>
              <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:13,letterSpacing:'0.14em',textTransform:'uppercase',color:DS.textSec,marginBottom:4}}>Histórico de Ciclos</div>
              <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:24,color:DS.textMain,fontStyle:'italic'}}>{selCycle?selCycle.label:'Ciclo atual'}</div>
              <div style={{fontSize:12,color:DS.textSec,marginTop:2}}>
                {selCycle?`Início: ${fmtShort(selCycle.start)} · ${selCycle.duration||Object.keys(selCycle.obs||{}).length} dias`
                  :`Início: ${fmtShort(cycleStart)} · Dia ${todayN} · ${Object.keys(obs).length} registros`}
              </div>
            </div>

            {/* Cycle selector */}
            <div style={{overflowX:'auto',borderBottom:`1px solid ${DS.border}`,background:DS.surface}}>
              <div style={{display:'flex',minWidth:'max-content',padding:'0 16px'}}>
                <button onClick={()=>setSelCycle(null)} style={{background:'none',border:'none',borderBottom:`2px solid ${!selCycle?DS.primary:'transparent'}`,padding:'12px 12px',cursor:'pointer',fontFamily:'inherit'}}>
                  <div style={{fontSize:12,fontWeight:600,color:!selCycle?DS.primary:DS.textSec}}>Atual</div>
                  <div style={{fontSize:10,color:DS.textSec}}>Dia {todayN}</div>
                </button>
                {history.map((c,i)=>(
                  <button key={i} onClick={()=>setSelCycle(c)} style={{background:'none',border:'none',borderBottom:`2px solid ${selCycle===c?DS.primary:'transparent'}`,padding:'12px 12px',cursor:'pointer',fontFamily:'inherit'}}>
                    <div style={{fontSize:12,fontWeight:600,color:selCycle===c?DS.primary:DS.textSec}}>{c.label}</div>
                    <div style={{fontSize:10,color:DS.textSec}}>{c.duration||Object.keys(c.obs||{}).length} dias</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div style={{display:'flex',gap:8,padding:'14px 22px',borderBottom:`1px solid ${DS.border}`}}>
              {[
                {l:'Registros', v:Object.keys(vObs).length},
                {l:'Ápice',     v:apiceN?`Dia ${apiceN}`:'—'},
                {l:'Fase Lútea',v:apiceN?`Dia ${apiceN+4}+`:'—'},
              ].map(s=>(
                <div key={s.l} style={{flex:1,background:DS.surface,border:`1px solid ${DS.border}`,borderRadius:DS.radiusCard,padding:'10px',textAlign:'center',boxShadow:DS.shadowCard}}>
                  <div style={{fontSize:16,fontWeight:700,color:DS.textMain,fontFamily:'Cormorant Garamond,serif'}}>{s.v}</div>
                  <div style={{fontSize:10,color:DS.textSec,marginTop:2}}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* Legenda */}
            <div style={{padding:'12px 22px',display:'flex',gap:12,flexWrap:'wrap',borderBottom:`1px solid ${DS.border}`,background:DS.surface}}>
              {STAMPS.map(s=>(
                <div key={s.id} style={{display:'flex',alignItems:'center',gap:6}}>
                  <div style={{width:16,height:16,borderRadius:'50%',background:s.bg,border:`1.5px solid ${s.c}`,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Georgia,serif',fontSize:9,color:s.c,fontWeight:700}}>{s.sym}</div>
                  <span style={{fontSize:11,color:DS.textSec}}>{s.label}</span>
                </div>
              ))}
            </div>

            {/* Horizontal chart */}
            <div style={{padding:'16px 0 0'}}>
              <div style={{overflowX:'auto'}}>
                <div style={{minWidth:vDays.length*34+80,padding:'0 22px'}}>
                  {[
                    {key:'n', label:'Dia',   render:d=><div style={{fontSize:10,color:d.date===today()&&!selCycle?DS.secondary:DS.textSec,fontWeight:d.date===today()&&!selCycle?700:400,textAlign:'center'}}>{d.n}</div>},
                    {key:'date', label:'Data', render:d=><div style={{fontSize:9,color:DS.textSec,textAlign:'center'}}>{getDay(d.date)}</div>},
                  ].map(row=>(
                    <div key={row.key} style={{display:'flex',alignItems:'center',marginBottom:2}}>
                      <div style={{width:60,flexShrink:0,fontSize:9,color:DS.textSec}}>{row.label}</div>
                      {vDays.map(d=><div key={d.n} style={{width:32,flexShrink:0}}>{row.render(d)}</div>)}
                    </div>
                  ))}
                  {/* Stamps row — each day circle is clickable (opens DayDetailModal) */}
                  <div style={{display:'flex',alignItems:'center',marginBottom:6,paddingBottom:6,borderBottom:`1px solid ${DS.border}`}}>
                    <div style={{width:60,flexShrink:0,fontSize:9,color:DS.textSec,fontWeight:600}}>Obs.</div>
                    {vDays.map(d=>{
                      const s=STAMPS.find(x=>x.id===d.obs?.stamp);
                      const isToday=d.date===today()&&!selCycle, isFut=d.date>today()&&!selCycle;
                      const hasObs = !!s && !isFut;
                      const clickable = !selCycle; // only current cycle is editable
                      // DS color rules: hoje=secondary/teal, registrado=primary/navy, vazio=border/gray
                      const chipBg = isFut ? 'transparent' : isToday ? DS.secondary : hasObs ? DS.primary : DS.border;
                      const chipColor = isFut ? DS.textSec : (isToday || hasObs) ? DS.surface : DS.textSec;
                      const chipBorder = isFut ? DS.border : isToday ? DS.secondary : hasObs ? DS.primary : DS.border;
                      return (
                        <div key={d.n} style={{width:32,flexShrink:0,display:'flex',justifyContent:'center'}}>
                          <div
                            onClick={clickable ? () => setSelectedDay(d) : undefined}
                            style={{width:24,height:24,borderRadius:'50%',background:chipBg,
                              border:`1.5px solid ${chipBorder}`,
                              display:'flex',alignItems:'center',justifyContent:'center',
                              fontFamily:'Georgia,serif',fontSize:12,color:chipColor,fontWeight:700,
                              opacity:isFut?0.25:1,
                              boxShadow:isToday?`0 0 0 2px ${DS.surface},0 0 0 4px ${DS.secondary}`:'none',
                              cursor:clickable?'pointer':'default',
                            }}>
                            {s?s.sym:''}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Muco, Sang, Rel rows */}
                  {[
                    {label:'Muco', render:d=>ml[d.obs?.mucus]||'', color:DS.warning},
                    {label:'Sang.', render:d=>d.obs?.bleeding?bm[d.obs.bleeding]||'●':'', color:DS.error},
                    {label:'Rel.',  render:d=>d.obs?.relations?'♥':'', color:DS.error},
                  ].map(row=>(
                    <div key={row.label} style={{display:'flex',alignItems:'center',marginBottom:4}}>
                      <div style={{width:60,flexShrink:0,fontSize:9,color:DS.textSec}}>{row.label}</div>
                      {vDays.map(d=>(
                        <div key={d.n} style={{width:32,flexShrink:0,textAlign:'center',fontSize:row.label==='Rel.'?11:9,color:row.color}}>{row.render(d)}</div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Apex card */}
            {apiceN && (
              <div style={{margin:'12px 22px 0',background:'#FEF3C7',border:`1px solid ${DS.warning}`,borderRadius:DS.radiusCard,padding:'12px 16px',display:'flex',gap:12,alignItems:'center'}}>
                <div style={{width:32,height:32,borderRadius:'50%',background:DS.warning,display:'flex',alignItems:'center',justifyContent:'center',color:DS.surface,fontFamily:'Georgia,serif',fontSize:14,fontWeight:700,flexShrink:0}}>✕</div>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:'#92400E'}}>Ápice no dia {apiceN}</div>
                  <div style={{fontSize:12,color:DS.textSec,marginTop:2}}>Fase Lútea a partir do dia {apiceN+4}</div>
                </div>
              </div>
            )}

            {/* PDF button */}
            <div style={{padding:'16px 22px 0'}}>
              <button onClick={handlePDFDownload} disabled={pdfLoading}
                style={{width:'100%',background:pdfLoading?DS.border:DS.primary,color:pdfLoading?DS.textSec:DS.surface,border:'none',borderRadius:DS.radiusBtn,padding:'13px',fontSize:13,fontWeight:700,letterSpacing:'0.04em',cursor:pdfLoading?'default':'pointer',fontFamily:'Lato,sans-serif',marginBottom:8}}>
                {pdfLoading?'Gerando PDF...':'↓ Exportar gráfico PDF (CENPLAFAM)'}
              </button>
            </div>

            {/* Recent list */}
            <div style={{padding:'20px 22px 0',background:DS.bg}}>
              <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:18,color:DS.textMain,marginBottom:14,fontStyle:'italic'}}>Registros recentes</div>
              {!Object.keys(vObs).length ? (
                <div style={{textAlign:'center',padding:'28px 0',color:DS.textSec,fontSize:13,fontStyle:'italic'}}>Nenhum registro.</div>
              ) : Object.entries(vObs).sort(([a],[b])=>b.localeCompare(a)).slice(0,10).map(([date,o])=>{
                const s=STAMPS.find(x=>x.id===o.stamp);
                return (
                  <div key={date} style={{background:DS.surface,border:`1px solid ${DS.border}`,borderRadius:DS.radiusCard,padding:'12px 14px',marginBottom:8,display:'flex',gap:12,alignItems:'flex-start',boxShadow:DS.shadowCard}}>
                    <div style={{width:38,height:38,borderRadius:'50%',background:s?.bg||DS.surface,border:`1.5px solid ${s?.c||DS.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Georgia,serif',fontSize:18,color:s?.c||DS.textSec,flexShrink:0,fontWeight:700}}>{s?.sym||'·'}</div>
                    <div style={{flex:1}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:2}}>
                        <span style={{fontFamily:'Cormorant Garamond,serif',fontSize:15,fontWeight:500,color:DS.textMain}}>{fmtShort(date)}</span>
                        <div style={{display:'flex',gap:6}}>
                          {o.stamp==='apice'&&<Tag label="Ápice" color='#92400E' bg='#FEF3C7' border={DS.warning}/>}
                          {o.relations&&<span style={{color:DS.error,fontSize:14}}>♥</span>}
                        </div>
                      </div>
                      <div style={{fontSize:12,color:DS.textSec}}>{s?.label}{o.mucus&&` · ${MUCUS.find(m=>m.id===o.mucus)?.label}`}{o.bleeding&&` · ${o.bleeding}`}</div>
                      {o.notes&&<div style={{fontSize:11,color:DS.textSec,marginTop:3,fontStyle:'italic'}}>{o.notes}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ══ ANÁLISE ══════════════════════════════════ */}
      {tab==='analise' && (
        <div style={{paddingBottom:100}}>
          <div style={{padding:'24px 22px 16px',background:C.surface,borderBottom:`1px solid ${C.border}`}}>
            <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:13,letterSpacing:'0.14em',textTransform:'uppercase',color:C.textMuted,marginBottom:4}}>Padrões</div>
            <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:24,color:C.text,fontStyle:'italic'}}>Análise de ciclos</div>
            <div style={{fontSize:12,color:C.textMuted,marginTop:2}}>Baseada nos últimos {stats?.cycleCount||0} ciclos registrados</div>
          </div>

          {!stats ? (
            <div style={{padding:'40px 22px',textAlign:'center',color:C.textMuted,fontStyle:'italic',fontSize:13}}>
              Registre pelo menos 2 ciclos completos para ver a análise.
            </div>
          ) : (
            <div style={{padding:'22px'}}>
              {/* Metrics grid */}
              {[
                { title:'Duração dos ciclos', items:[
                    {l:'Média',v:stats.avgLength?`${stats.avgLength} dias`:'—'},
                    {l:'Mínimo',v:stats.minLength?`${stats.minLength} dias`:'—'},
                    {l:'Máximo',v:stats.maxLength?`${stats.maxLength} dias`:'—'},
                ]},
                { title:'Fase Lútea (pós-Ápice)', items:[
                    {l:'Média',v:stats.avgLuteal?`${stats.avgLuteal} dias`:'—'},
                    {l:'Mínimo',v:stats.minLuteal?`${stats.minLuteal} dias`:'—'},
                    {l:'Máximo',v:stats.maxLuteal?`${stats.maxLuteal} dias`:'—'},
                ]},
                { title:'Dia do Ápice no ciclo', items:[
                    {l:'Médio',v:stats.avgApice?`Dia ${stats.avgApice}`:'—'},
                    {l:'Mais cedo',v:stats.minApice?`Dia ${stats.minApice}`:'—'},
                    {l:'Mais tarde',v:stats.maxApice?`Dia ${stats.maxApice}`:'—'},
                ]},
              ].map(section=>(
                <div key={section.title} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:'16px',marginBottom:14}}>
                  <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:16,color:C.text,marginBottom:12}}>{section.title}</div>
                  <div style={{display:'flex',gap:8}}>
                    {section.items.map(item=>(
                      <div key={item.l} style={{flex:1,background:C.surface,borderRadius:10,padding:'10px 8px',textAlign:'center'}}>
                        <div style={{fontSize:16,fontWeight:700,color:C.text,fontFamily:'Cormorant Garamond,serif'}}>{item.v}</div>
                        <div style={{fontSize:10,color:C.textMuted,marginTop:2}}>{item.l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* BIP status */}
              <div style={{background:stats.bipConfirmed?C.sageLight:C.amberLight,border:`1px solid ${stats.bipConfirmed?C.sageBorder:C.amberBorder}`,borderRadius:14,padding:'14px 16px',marginBottom:14}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                  <span style={{fontSize:16,color:stats.bipConfirmed?C.sage:C.amber}}>{stats.bipConfirmed?'✓':'○'}</span>
                  <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:16,color:stats.bipConfirmed?C.sage:C.amber}}>Padrão Básico de Infertilidade (PBI)</div>
                </div>
                <div style={{fontSize:12,color:C.textSec,lineHeight:1.6}}>
                  {stats.bipConfirmed
                    ? 'PBI confirmado em 3 ciclos consecutivos de menos de 35 dias com padrão inalterado.'
                    : 'PBI ainda em confirmação. São necessários 3 ciclos seguidos com padrão inalterado para confirmar.'}
                </div>
              </div>

              {/* Flags */}
              <div style={{marginBottom:14}}>
                <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:16,color:C.text,marginBottom:12}}>Observações clínicas</div>
                {stats.flags.map((flag,i)=>{
                  const flagColors = {
                    ok:        {bg:C.sageLight,  border:C.sageBorder,  text:C.sage,  icon:'✓'},
                    informação:{bg:C.amberLight, border:C.amberBorder, text:C.amber, icon:'ℹ'},
                    atenção:   {bg:C.roseLight,  border:C.roseBorder,  text:C.rose,  icon:'!'},
                  };
                  const fc = flagColors[flag.level] || flagColors.informação;
                  return (
                    <div key={i} style={{background:fc.bg,border:`1px solid ${fc.border}`,borderRadius:12,padding:'12px 14px',marginBottom:10,display:'flex',gap:10,alignItems:'flex-start'}}>
                      <span style={{color:fc.text,fontSize:14,flexShrink:0,marginTop:1}}>{fc.icon}</span>
                      <div style={{fontSize:12,color:C.textSec,lineHeight:1.7}}>{flag.msg}</div>
                    </div>
                  );
                })}
              </div>

              {/* Disclaimer */}
              <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:'12px 14px'}}>
                <div style={{fontSize:11,color:C.textMuted,lineHeight:1.6,textAlign:'center',fontStyle:'italic'}}>
                  Esta análise é uma ferramenta de apoio ao registro. A interpretação clínica do ciclo é responsabilidade exclusiva da instrutora credenciada CENPLAFAM/WOOMB.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ GUIA ═════════════════════════════════════ */}
      {tab==='guia' && (
        <div style={{display:'flex',flexDirection:'column',height:'calc(100vh - 72px)'}}>
          <div style={{padding:'20px 22px 0'}}>
            <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:20,marginBottom:8,color:C.text}}>Guia de anotações</div>
            <div style={{background:C.amberLight,border:`1px solid ${C.amberBorder}`,borderRadius:12,padding:'10px 14px',marginBottom:10}}>
              <div style={{fontSize:12,color:C.textSec,lineHeight:1.6}}>
                Ajuda com o uso do app. <strong style={{color:C.amber}}>Interpretação do ciclo</strong> é exclusiva da sua instrutora. {!apiKey&&<span style={{color:C.rose}}> Adicione sua chave API na aba Perfil para ativar.</span>}
              </div>
            </div>
          </div>

          <div style={{flex:1,overflowY:'auto',padding:'0 22px 12px'}}>
            {!msgs.length && (
              <div>
                <div style={{fontSize:11,color:C.textMuted,marginBottom:10,fontFamily:'Cormorant Garamond,serif',fontStyle:'italic'}}>Perguntas frequentes</div>
                {['Como registro o Ápice (✕)?','O que é o PBI — Padrão Básico de Infertilidade?','Diferença entre os tipos de muco','Esqueci de registrar ontem','Como compartilhar com a instrutora?'].map(q=>(
                  <button key={q} onClick={()=>sendAI(q)} style={{display:'block',width:'100%',background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:'11px 14px',textAlign:'left',fontSize:13,color:C.textSec,cursor:'pointer',marginBottom:8,fontFamily:'inherit'}}>
                    {q}
                  </button>
                ))}
              </div>
            )}
            {msgs.map((m,i)=>(
              <div key={i} style={{display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start',marginBottom:10}}>
                <div style={{maxWidth:'82%',padding:'10px 14px',fontSize:13,lineHeight:1.6,
                  borderRadius:m.role==='user'?'16px 16px 4px 16px':'16px 16px 16px 4px',
                  background:m.role==='user'?C.terra:C.card,color:m.role==='user'?C.white:C.text,
                  border:m.role==='assistant'?`1px solid ${C.border}`:'none'}}>
                  {m.content}
                </div>
              </div>
            ))}
            {aiLoading && (
              <div style={{display:'flex',gap:4,padding:'4px 0 12px'}}>
                {[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:'50%',background:C.terra,animation:`dot 1s ${i*0.2}s infinite`}}/>)}
              </div>
            )}
            <div ref={chatEnd}/>
          </div>

          <div style={{padding:'10px 22px 24px',borderTop:`1px solid ${C.border}`,background:C.surface,display:'flex',gap:8}}>
            <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendAI()}
              placeholder="Dúvida sobre anotações..."
              style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:'11px 14px',fontSize:13,color:C.text,outline:'none'}}
            />
            <button onClick={()=>sendAI()} disabled={aiLoading||!input.trim()}
              style={{background:input.trim()?C.terra:C.border,color:input.trim()?C.white:C.textMuted,border:'none',borderRadius:12,padding:'11px 18px',cursor:input.trim()?'pointer':'default',fontSize:15}}>↑</button>
          </div>
        </div>
      )}

      {/* ══ VÍNCULO ══════════════════════════════════ */}
      {tab==='vinculo' && (
        <LinkInstructorPage session={session} onBack={()=>setTab('perfil')} />
      )}

      {/* ══ NOTIFICAÇÕES ═════════════════════════════ */}
      {tab==='notificacoes' && user && (
        <NotificationPreferencesPage />
      )}
      {tab==='notificacoes' && !user && (
        <div style={{padding:'40px 22px',textAlign:'center',color:C.textMuted,fontStyle:'italic',fontSize:13}}>
          Faça login para gerenciar suas notificações.
        </div>
      )}

      {/* ══ PERFIL ═══════════════════════════════════ */}
      {tab==='perfil' && (
        <div style={{paddingBottom:100}}>
          <div style={{padding:'24px 22px 16px',background:C.surface,borderBottom:`1px solid ${C.border}`}}>
            <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:13,letterSpacing:'0.14em',textTransform:'uppercase',color:C.textMuted,marginBottom:4}}>Conta</div>
            <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:24,color:C.text,fontStyle:'italic'}}>Perfil</div>
          </div>

          <div style={{padding:'22px'}}>
            {/* Instructor */}
            <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:18,color:C.text,marginBottom:14}}>Minha Instrutora</div>
            {!instructor ? (
              <div>
                <div style={{textAlign:'center',padding:'16px 0 20px',color:C.textMuted}}>
                  <div style={{fontSize:32,marginBottom:8}}>○</div>
                  <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:16,color:C.textSec,marginBottom:4}}>Nenhuma instrutora associada</div>
                </div>
                <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:'18px',marginBottom:16}}>
                  {[{key:'name',label:'Nome',ph:'Nome da instrutora',type:'text'},{key:'email',label:'E-mail',ph:'email@instrutora.com.br',type:'email'}].map(f=>(
                    <div key={f.key} style={{marginBottom:14}}>
                      <div style={{fontSize:10,fontWeight:700,color:C.textMuted,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:8}}>{f.label}</div>
                      <input value={instrForm[f.key]} type={f.type} onChange={e=>setInstrForm(p=>({...p,[f.key]:e.target.value}))}
                        placeholder={f.ph}
                        style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'11px 14px',fontSize:13,color:C.text,outline:'none',boxSizing:'border-box'}}
                      />
                    </div>
                  ))}
                  <button onClick={()=>{if(instrForm.name.trim()&&instrForm.email.trim())saveInstructor({name:instrForm.name.trim(),email:instrForm.email.trim()});}}
                    style={{width:'100%',background:instrForm.name.trim()&&instrForm.email.trim()?C.sage:C.border,color:instrForm.name.trim()&&instrForm.email.trim()?C.white:C.textMuted,border:'none',borderRadius:12,padding:'13px',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'Lato,sans-serif',letterSpacing:'0.04em'}}>
                    Associar instrutora
                  </button>
                </div>
              </div>
            ) : (
              <div style={{marginBottom:16}}>
                <div style={{background:C.card,border:`1px solid ${C.sageBorder}`,borderRadius:14,padding:'16px',marginBottom:10}}>
                  <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
                    <div style={{width:44,height:44,borderRadius:'50%',background:C.sageLight,border:`1.5px solid ${C.sageBorder}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,color:C.sage,flexShrink:0}}>○</div>
                    <div>
                      <div style={{fontSize:15,fontWeight:700,color:C.text}}>{instructor.name}</div>
                      <div style={{fontSize:12,color:C.textMuted,marginTop:2}}>{instructor.email}</div>
                    </div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:6,background:C.sageLight,border:`1px solid ${C.sageBorder}`,borderRadius:8,padding:'7px 12px'}}>
                    <span style={{color:C.sage,fontSize:12}}>✓</span>
                    <span style={{fontSize:12,color:C.sage,fontWeight:600}}>Associação ativa — instrutora temporária</span>
                  </div>
                </div>
                <button onClick={()=>window.open(`https://wa.me/?text=${encodeURIComponent(`Olá ${instructor.name}! Segue meu gráfico do Método Billings para nossa consulta. Ciclo atual: dia ${todayN}, início em ${fmtShort(cycleStart)}.`)}`, '_blank')}
                  style={{width:'100%',background:C.sage,color:C.white,border:'none',borderRadius:12,padding:'13px',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'Lato,sans-serif',marginBottom:8,display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                  <span>↗</span> Compartilhar via WhatsApp
                </button>
                {!instrConfirm ? (
                  <button onClick={()=>setInstrConfirm(true)}
                    style={{width:'100%',background:'transparent',color:C.textMuted,border:`1px solid ${C.border}`,borderRadius:12,padding:'11px',fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>
                    Desassociar instrutora
                  </button>
                ) : (
                  <div style={{background:C.roseLight,border:`1px solid ${C.roseBorder}`,borderRadius:14,padding:14}}>
                    <div style={{fontSize:13,color:C.rose,marginBottom:12}}>Remover associação com <strong>{instructor.name}</strong>?</div>
                    <div style={{display:'flex',gap:8}}>
                      <button onClick={removeInstructor} style={{flex:1,background:C.rose,color:C.white,border:'none',borderRadius:10,padding:'10px',fontSize:13,cursor:'pointer',fontFamily:'inherit',fontWeight:700}}>Confirmar</button>
                      <button onClick={()=>setInstrConfirm(false)} style={{flex:1,background:C.card,color:C.textSec,border:`1px solid ${C.border}`,borderRadius:10,padding:'10px',fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Reminders */}
            <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:18,color:C.text,marginBottom:12,marginTop:16}}>Lembretes</div>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:'16px',marginBottom:16}}>
              <div style={{fontSize:13,color:C.textSec,lineHeight:1.6,marginBottom:14}}>
                Baixe o lembrete diário para seu calendário (iOS, Google, Outlook). O alarme disparará às 21h todos os dias.
              </div>
              <button onClick={()=>downloadICS(generateDailyReminder({hour:21}))}
                style={{width:'100%',background:C.terra,color:C.white,border:'none',borderRadius:12,padding:'13px',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'Lato,sans-serif',letterSpacing:'0.04em'}}>
                ↓ Baixar lembrete diário (.ics)
              </button>
            </div>

            {/* API Key */}
            <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:18,color:C.text,marginBottom:12,marginTop:4}}>Guia IA</div>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:'16px'}}>
              <div style={{fontSize:12,color:C.textMuted,lineHeight:1.6,marginBottom:12}}>
                Para usar o Guia IA, insira sua chave da API Anthropic. Ela fica salva apenas neste dispositivo.
              </div>
              <input value={apiKey} onChange={e=>setApiKey(e.target.value)} type="password"
                placeholder="sk-ant-..."
                style={{width:'100%',background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'11px 14px',fontSize:13,color:C.text,outline:'none',boxSizing:'border-box',marginBottom:10}}
              />
              <button onClick={()=>saveApiKey(apiKey)}
                style={{width:'100%',background:apiKey?C.sage:C.border,color:apiKey?C.white:C.textMuted,border:'none',borderRadius:12,padding:'12px',fontSize:13,fontWeight:700,cursor:apiKey?'pointer':'default',fontFamily:'Lato,sans-serif'}}>
                Salvar chave
              </button>
            </div>

            {/* Disclaimer */}
            <div style={{marginTop:20,background:C.amberLight,border:`1px solid ${C.amberBorder}`,borderRadius:12,padding:'12px 14px'}}>
              <div style={{fontSize:11,color:C.textMuted,lineHeight:1.7}}>
                <strong style={{color:C.amber}}>Importante</strong> — O aplicativo não deverá ser usado por pessoas que não tenham conhecimento do Método de Ovulação Billings. Para isso, procure uma instrutora oficial ou a CENPLAFAM – WOOMB BRASIL.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ NAV ══════════════════════════════════════ */}
      <div style={{position:'fixed',bottom:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:430,background:DS.surface,boxShadow:'0 -2px 8px rgba(0,0,0,0.06)',zIndex:20,padding:'6px 16px 12px'}}>
        <div style={{display:'flex',gap:4}}>
          {[{id:'hoje',l:'Hoje',i:'◎'},{id:'grafico',l:'Gráfico',i:'⊞'},{id:'analise',l:'Análise',i:'◈'},{id:'guia',l:'Guia',i:'✦'},{id:'vinculo',l:'Vínculo',i:'⊕'},{id:'notificacoes',l:'Notific.',i:'◉'},{id:'perfil',l:'Perfil',i:'○'}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,background:tab===t.id?`${DS.primary}18`:'transparent',border:`1px solid ${tab===t.id?DS.primary:DS.border}`,borderRadius:10,padding:'8px 0 6px',cursor:'pointer',fontFamily:'inherit',display:'flex',flexDirection:'column',alignItems:'center',gap:2,transition:'all 0.2s'}}>
              <span style={{fontSize:16,color:tab===t.id?DS.primary:DS.textSec}}>{t.i}</span>
              <span style={{fontSize:9,color:tab===t.id?DS.primary:DS.textSec,fontWeight:tab===t.id?700:400}}>{t.l}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ══ DAY DETAIL MODAL ══════════════════════ */}
      {selectedDay && (
        <DayDetailModal
          day={selectedDay}
          today={today()}
          onClose={() => setSelectedDay(null)}
          onSave={(date, formData) => {
            handleDaySave(date, formData);
          }}
          observationId={selectedDay.obs?.id ?? undefined}
        />
      )}
    </div>
  );
}
