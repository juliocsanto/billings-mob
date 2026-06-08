
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { pdf } from '@react-pdf/renderer';
import { ChartDocument } from './pdf/ChartPDF.jsx';
import { C, DS, STAMPS, MUCUS, BLEEDING, EMPTY_FORM } from './constants.js';
import { loadUserData, saveUserData, getLastOpenDate, setLastOpenDate } from './utils/storage.js';
import { supabase } from './lib/supabaseClient';
import { today, fmtLong, fmtShort, fmtMonthYear, getDay, genDays, addDays, diffDays } from './utils/dates.js';
import { computeMultiCycleStats, getApiceDay } from './utils/analysis.js';
import { generateDailyReminder, downloadICS } from './utils/ics.js';
import { DayDetailModal } from './components/DayDetailModal.jsx';
import { LinkInstructorPage } from './pages/LinkInstructorPage.tsx';
import { NotificationPreferencesPage } from './pages/NotificationPreferencesPage.tsx';
import { FeedbackPage } from './components/feedback/FeedbackPage.tsx';

// ── Micro-components ──────────────────────────────────────

const Tag = ({ label, color, bg, border }) => (
  <span style={{ fontSize:11, fontWeight:600, color, background:bg, border:`1px solid ${border}`,
    borderRadius:4, padding:'3px 10px', letterSpacing:'0.04em' }}>
    {label}
  </span>
);

const Lbl = ({ children }) => (
  <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase',
    color:DS.textSec, marginBottom:10 }}>
    {children}
  </div>
);

const Pill = ({ label, active, color, onClick }) => (
  <button onClick={onClick} style={{
    background: active ? DS.primary : DS.bg,
    border:`1.5px solid ${active ? DS.primary : DS.border}`,
    borderRadius:20, padding:'6px 14px', fontSize:12, fontWeight:500,
    color: active ? DS.surface : DS.textSec, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s',
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
  const { t } = useTranslation();
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

  // sendAI — ADR-016: proxied via Supabase Edge Function (claude-sonnet-4-6 SSE streaming).
  // LGPD: only { question } is sent — never observations, stamps, notes, or relations.
  const sendAI = async (text) => {
    const msg = text || input.trim();
    if (!msg || aiLoading) return;
    setInput('');
    setMsgs(p => [...p, { role: 'user', content: msg }]);
    setAiLoading(true);

    // Auth: require Supabase session — no user-provided API key needed
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (!currentSession?.access_token) {
      setMsgs(p => [...p, { role: 'assistant', content: t('app.guideNeedApiKeyMsg') }]);
      setAiLoading(false);
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/ai-guide`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentSession.access_token}`,
        },
        // LGPD: only question is forwarded — never cycle data
        body: JSON.stringify({ question: msg }),
      });

      if (!response.ok) {
        setMsgs(p => [...p, { role: 'assistant', content: t('app.guideErrorConnection') }]);
        setAiLoading(false);
        return;
      }

      // Read SSE stream and accumulate tokens in real time
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMsg = '';
      setMsgs(p => [...p, { role: 'assistant', content: '' }]);

      let streamDone = false;
      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') { streamDone = true; break; }
            try {
              const { token } = JSON.parse(data);
              assistantMsg += token;
              setMsgs(p => {
                const next = [...p];
                next[next.length - 1] = { role: 'assistant', content: assistantMsg };
                return next;
              });
            } catch {
              // Ignore malformed SSE lines
            }
          }
        }
      }
    } catch {
      setMsgs(p => [...p, { role: 'assistant', content: t('app.guideErrorConnection') }]);
    }

    setAiLoading(false);
  };

  const days     = genDays(cycleStart, obs);
  const todayN   = days.find(d=>d.date===today())?.n || 1;
  const aStamp   = STAMPS.find(s=>s.id===form.stamp);
  const sStamp   = STAMPS.find(s=>s.id===obs[today()]?.stamp);
  const disp     = aStamp || sStamp;
  const phaseMap = {
    sangramento: t('app.phaseSangramento'),
    seco: t('app.phaseSeco'),
    muco: t('stamps.muco'),
    apice: t('app.phaseApice'),
  };
  const stats    = computeMultiCycleStats({start:cycleStart,obs}, history);

  if (!loaded) return (
    <div style={{background:DS.bg,height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Lato,sans-serif',color:DS.textSec}}>
      {t('common.loading')}
    </div>
  );

  return (
    <div style={{background:DS.bg,minHeight:'100vh',fontFamily:'Lato,sans-serif',color:DS.textMain,maxWidth:430,margin:'0 auto',position:'relative'}}>

      {/* Daily reminder banner */}
      {showBanner && (
        <div style={{background:DS.primary,color:DS.surface,padding:'10px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',animation:'fadeIn 0.3s ease',position:'sticky',top:0,zIndex:30}}>
          <span style={{fontSize:12}}>{t('app.banner')}</span>
          <button onClick={()=>setShowBanner(false)} aria-label={t('common.close')} style={{background:'none',border:'none',color:DS.surface,cursor:'pointer',fontSize:16,padding:0}}>✕</button>
        </div>
      )}

      {/* ── HEADER ─────────────────────────────── */}
      <div style={{padding:'20px 22px 0',background:DS.surface,borderBottom:`1px solid ${DS.border}`,boxShadow:DS.shadowCard,position:'sticky',top:showBanner?42:0,zIndex:20}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',paddingBottom:14}}>
          <div>
            <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:20,color:DS.textMain,fontWeight:700}}>{t('auth.appName')}</div>
            <div style={{fontSize:12,color:DS.textSec,marginTop:2}}>{t('app.headerSubtitle', {day: todayN, date: new Date(today()+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})})}</div>
          </div>
          {disp && <Tag label={phaseMap[disp.id]||t('stamps.'+disp.id)} color={disp.c} bg={disp.bg} border={disp.border}/>}
        </div>
        <nav role="navigation" aria-label={t('nav.hoje')}>
          <div role="tablist" style={{display:'flex',gap:0}}>
            {[{id:'hoje',l:t('nav.hoje')},{id:'grafico',l:t('nav.grafico')},{id:'analise',l:t('nav.analise')},{id:'guia',l:t('nav.guia')},{id:'feedback',l:'Feedback'},{id:'vinculo',l:t('nav.vinculo')},{id:'notificacoes',l:t('nav.notificacoes')},{id:'perfil',l:t('nav.perfil')}].map(navItem=>(
              <button key={navItem.id} role="tab" aria-selected={tab===navItem.id} onClick={()=>setTab(navItem.id)} style={{
                flex:1,background:'none',border:'none',cursor:'pointer',padding:'10px 0',
                fontSize:11,fontWeight:tab===navItem.id?700:400,
                color:tab===navItem.id?DS.primary:DS.textSec,
                borderBottom:`2px solid ${tab===navItem.id?DS.primary:'transparent'}`,
                transition:'all 0.2s',fontFamily:'inherit',
              }}>{navItem.l}</button>
            ))}
          </div>
        </nav>
      </div>

      {/* ══ HOJE ══════════════════════════════════════ */}
      {tab==='hoje' && (
        <div style={{padding:'24px 22px 100px'}}>
          {saved && (
            <div style={{background:DS.successLight,border:`1px solid ${DS.successBorder}`,borderRadius:12,padding:'10px 16px',marginBottom:20,display:'flex',alignItems:'center',gap:8}}>
              <span style={{color:DS.success,fontSize:14}}>✓</span>
              <span style={{fontSize:13,color:DS.success}}>{t('app.savedToday')}</span>
            </div>
          )}

          {/* Stamps */}
          <div style={{marginBottom:24}}>
            <Lbl>{t('app.observacaoHoje')}</Lbl>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              {STAMPS.map(s=>{
                const active = form.stamp===s.id;
                return (
                  <button key={s.id} onClick={()=>setForm(p=>({...p,stamp:s.id,mucus:null,bleeding:null}))}
                    aria-pressed={active}
                    data-testid={`stamp-${s.id}`}
                    style={{background:active?DS.primary:DS.surface,border:`1.5px solid ${active?DS.primary:DS.border}`,borderRadius:14,
                      padding:'16px 14px',textAlign:'left',cursor:'pointer',fontFamily:'inherit',transition:'all 0.2s',
                      boxShadow:active?DS.shadowCard:'none'}}>
                    <div style={{width:34,height:34,borderRadius:'50%',background:active?DS.surface:s.bg,
                      border:`1.5px solid ${s.c}`,display:'flex',alignItems:'center',justifyContent:'center',
                      fontSize:18,color:active?DS.primary:s.c,marginBottom:10,fontFamily:'Georgia,serif',fontWeight:700}}>{s.sym}</div>
                    <div style={{fontSize:14,fontWeight:700,color:active?DS.surface:DS.textMain}}>{t('stamps.'+s.id)}</div>
                    <div style={{fontSize:11,color:active?'rgba(255,255,255,0.8)':DS.textSec,marginTop:2}}>{t('stampsub.'+s.id)}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bleeding detail */}
          {form.stamp==='sangramento' && (
            <div style={{marginBottom:22}}>
              <Lbl>{t('dayDetail.intensity')}</Lbl>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {BLEEDING.map(b=>(
                  <Pill key={b.id} label={t('bleeding.'+b.id)} active={form.bleeding===b.id} color={DS.bleedingColor}
                    onClick={()=>setForm(p=>({...p,bleeding:b.id}))}/>
                ))}
              </div>
            </div>
          )}

          {/* Mucus detail */}
          {form.stamp==='muco' && (
            <div style={{marginBottom:22}}>
              <Lbl>{t('dayDetail.mucusType')}</Lbl>
              {MUCUS.map(m=>(
                <button key={m.id} onClick={()=>setForm(p=>({...p,mucus:m.id}))}
                  style={{display:'block',width:'100%',background:form.mucus===m.id?DS.primary:DS.bg,
                    border:`1px solid ${form.mucus===m.id?DS.primary:DS.border}`,borderRadius:12,
                    padding:'11px 14px',textAlign:'left',cursor:'pointer',fontFamily:'inherit',marginBottom:8,transition:'all 0.15s'}}>
                  <div style={{fontSize:13,fontWeight:700,color:form.mucus===m.id?DS.surface:DS.textMain}}>{t('mucus.'+m.id)}</div>
                  <div style={{fontSize:11,color:form.mucus===m.id?'rgba(255,255,255,0.8)':DS.textSec,marginTop:2}}>{t('mucus.'+m.id+'_desc')}</div>
                </button>
              ))}
            </div>
          )}

          {/* Apex info */}
          {form.stamp==='apice' && (
            <div style={{background:DS.warningLight,border:`1px solid ${DS.warningBorder}`,borderRadius:14,padding:'14px 16px',marginBottom:22}}>
              <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:17,color:DS.warning,marginBottom:6,fontStyle:'italic'}}>{t('dayDetail.apiceMarked')}</div>
              <div style={{fontSize:12,color:DS.textSec,lineHeight:1.8}}>
                {t('app.apiceDescLine1')}<br/>
                {t('app.apiceDescLine2')}<br/>
                <span style={{color:DS.textSec}}>{t('app.apiceDescLine3')}</span>
              </div>
            </div>
          )}

          {/* Relations */}
          <div style={{marginBottom:22}}>
            <Lbl>{t('dayDetail.intimateRelations')}</Lbl>
            <button onClick={()=>setForm(p=>({...p,relations:!p.relations}))}
              aria-pressed={form.relations}
              data-testid="toggle-relations"
              style={{display:'flex',alignItems:'center',gap:12,background:form.relations?DS.errorLight:DS.bg,
                border:`1.5px solid ${form.relations?DS.error:DS.border}`,borderRadius:12,padding:'12px 16px',
                cursor:'pointer',fontFamily:'inherit',width:'100%',textAlign:'left',transition:'all 0.2s'}}>
              <div style={{width:22,height:22,borderRadius:'50%',flexShrink:0,
                background:form.relations?DS.error:'transparent',border:`1.5px solid ${form.relations?DS.error:DS.border}`,
                display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,color:DS.surface,transition:'all 0.2s'}}>
                {form.relations?'♥':''}
              </div>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:form.relations?DS.error:DS.textMain}}>
                  {form.relations?t('app.relationsYesToday'):t('app.relationsNoToday')}
                </div>
                <div style={{fontSize:11,color:DS.textSec,marginTop:2}}>{t('app.relationsVisibility')}</div>
              </div>
            </button>
          </div>

          {/* Notes */}
          <div style={{marginBottom:22}}>
            <Lbl>{t('dayDetail.notesLabel')}</Lbl>
            <textarea value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))}
              placeholder={t('app.notesPlaceholder')}
              aria-label={t('dayDetail.notesLabel')}
              style={{width:'100%',background:DS.bg,border:`1px solid ${DS.border}`,borderRadius:12,
                padding:'12px 16px',fontSize:13,color:DS.textMain,minHeight:72,
                boxSizing:'border-box',outline:'none',lineHeight:1.6}}
            />
          </div>

          {/* Save */}
          <button onClick={()=>form.stamp&&persist(form)}
            data-testid="save-observation"
            style={{width:'100%',background:form.stamp?DS.primary:DS.border,color:form.stamp?DS.surface:DS.textSec,
              border:'none',borderRadius:DS.radiusBtn,padding:'15px',fontSize:14,fontWeight:700,letterSpacing:'0.06em',
              textTransform:'uppercase',cursor:form.stamp?'pointer':'default',fontFamily:'Lato,sans-serif',
              transition:'all 0.2s',boxShadow:form.stamp?DS.shadowFAB:'none',marginBottom:10}}>
            {t('app.saveObservation')}
          </button>

          {!confirmNew ? (
            <button onClick={()=>setConfirmNew(true)}
              data-testid="start-new-cycle"
              style={{width:'100%',background:'transparent',color:DS.textSec,border:`1px solid ${DS.border}`,
                borderRadius:DS.radiusBtn,padding:'12px',fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>
              {t('app.startNewCycle')}
            </button>
          ) : (
            <div style={{background:DS.errorLight,border:`1px solid ${DS.errorBorder}`,borderRadius:14,padding:16}}>
              <div style={{fontSize:13,color:DS.error,marginBottom:12}}>{t('app.confirmNewCycle')}</div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>{const f={...EMPTY_FORM,stamp:'sangramento',bleeding:'moderado'};archiveAndReset(f,today());setConfirmNew(false);}}
                  data-testid="confirm-new-cycle"
                  style={{flex:1,background:DS.error,color:DS.surface,border:'none',borderRadius:10,padding:'10px',fontSize:13,cursor:'pointer',fontFamily:'inherit',fontWeight:700}}>{t('common.confirm')}</button>
                <button onClick={()=>setConfirmNew(false)}
                  style={{flex:1,background:DS.bg,color:DS.textSec,border:`1px solid ${DS.border}`,borderRadius:10,padding:'10px',fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>{t('common.cancel')}</button>
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
              <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:13,letterSpacing:'0.14em',textTransform:'uppercase',color:DS.textSec,marginBottom:4}}>{t('app.cycleHistory')}</div>
              <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:24,color:DS.textMain,fontStyle:'italic'}}>{selCycle?selCycle.label:t('app.currentCycle')}</div>
              <div style={{fontSize:12,color:DS.textSec,marginTop:2}}>
                {selCycle
                  ? `${t('app.cycleStart')}${fmtShort(selCycle.start)} · ${t('app.days', {count: selCycle.duration||Object.keys(selCycle.obs||{}).length})}`
                  : `${t('app.cycleStart')}${fmtShort(cycleStart)} · ${t('app.dayN', {n: todayN})} · ${t('app.records', {count: Object.keys(obs).length})}`}
              </div>
            </div>

            {/* Cycle selector */}
            <div style={{overflowX:'auto',borderBottom:`1px solid ${DS.border}`,background:DS.surface}}>
              <div style={{display:'flex',minWidth:'max-content',padding:'0 16px'}}>
                <button onClick={()=>setSelCycle(null)} style={{background:'none',border:'none',borderBottom:`2px solid ${!selCycle?DS.primary:'transparent'}`,padding:'12px 12px',cursor:'pointer',fontFamily:'inherit'}}>
                  <div style={{fontSize:12,fontWeight:600,color:!selCycle?DS.primary:DS.textSec}}>{t('app.current')}</div>
                  <div style={{fontSize:10,color:DS.textSec}}>{t('app.dayN', {n: todayN})}</div>
                </button>
                {history.map((c,i)=>(
                  <button key={i} onClick={()=>setSelCycle(c)} style={{background:'none',border:'none',borderBottom:`2px solid ${selCycle===c?DS.primary:'transparent'}`,padding:'12px 12px',cursor:'pointer',fontFamily:'inherit'}}>
                    <div style={{fontSize:12,fontWeight:600,color:selCycle===c?DS.primary:DS.textSec}}>{c.label}</div>
                    <div style={{fontSize:10,color:DS.textSec}}>{t('app.days', {count: c.duration||Object.keys(c.obs||{}).length})}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div style={{display:'flex',gap:8,padding:'14px 22px',borderBottom:`1px solid ${DS.border}`}}>
              {[
                {l:t('app.statsRecords'), v:Object.keys(vObs).length},
                {l:t('app.statsApice'),   v:apiceN?t('app.dayN', {n: apiceN}):'—'},
                {l:t('app.statsLuteal'), v:apiceN?`${t('app.dayN', {n: apiceN+4})}+`:'—'},
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
                  <span style={{fontSize:11,color:DS.textSec}}>{t('stamps.'+s.id)}</span>
                </div>
              ))}
            </div>

            {/* Horizontal chart */}
            <div style={{padding:'16px 0 0'}}>
              <div style={{overflowX:'auto'}}>
                <div style={{minWidth:vDays.length*34+80,padding:'0 22px'}}>
                  {[
                    {key:'n', label:t('app.dayN', {n:'#'}).replace('#','').trim()||'Dia',   render:d=><div style={{fontSize:10,color:d.date===today()&&!selCycle?DS.secondary:DS.textSec,fontWeight:d.date===today()&&!selCycle?700:400,textAlign:'center'}}>{d.n}</div>},
                    {key:'date', label:'Data', render:d=><div style={{fontSize:9,color:DS.textSec,textAlign:'center'}}>{getDay(d.date)}</div>},
                  ].map(row=>(
                    <div key={row.key} style={{display:'flex',alignItems:'center',marginBottom:2}}>
                      <div style={{width:60,flexShrink:0,fontSize:9,color:DS.textSec}}>{row.label}</div>
                      {vDays.map(d=><div key={d.n} style={{width:32,flexShrink:0}}>{row.render(d)}</div>)}
                    </div>
                  ))}
                  {/* Stamps row — each day circle is clickable (opens DayDetailModal) */}
                  <div style={{display:'flex',alignItems:'center',marginBottom:6,paddingBottom:6,borderBottom:`1px solid ${DS.border}`}}>
                    <div style={{width:60,flexShrink:0,fontSize:9,color:DS.textSec,fontWeight:600}}>{t('app.rowObs')}</div>
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
                            aria-label={clickable ? t('dayDetail.cycleDayLabel', {n: d.n}) : undefined}
                            role={clickable ? 'button' : undefined}
                            tabIndex={clickable ? 0 : undefined}
                            onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedDay(d); } : undefined}
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
                    {label:t('app.rowMuco'), render:d=>ml[d.obs?.mucus]||'', color:DS.warning},
                    {label:t('app.rowSang'), render:d=>d.obs?.bleeding?bm[d.obs.bleeding]||'●':'', color:DS.error},
                    {label:t('app.rowRel'),  render:d=>d.obs?.relations?'♥':'', color:DS.error},
                  ].map(row=>(
                    <div key={row.label} style={{display:'flex',alignItems:'center',marginBottom:4}}>
                      <div style={{width:60,flexShrink:0,fontSize:9,color:DS.textSec}}>{row.label}</div>
                      {vDays.map(d=>(
                        <div key={d.n} style={{width:32,flexShrink:0,textAlign:'center',fontSize:row.label===t('app.rowRel')?11:9,color:row.color}}>{row.render(d)}</div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Apex card */}
            {apiceN && (
              <div style={{margin:'12px 22px 0',background:DS.warningLight,border:`1px solid ${DS.warning}`,borderRadius:DS.radiusCard,padding:'12px 16px',display:'flex',gap:12,alignItems:'center'}}>
                <div style={{width:32,height:32,borderRadius:'50%',background:DS.warning,display:'flex',alignItems:'center',justifyContent:'center',color:DS.surface,fontFamily:'Georgia,serif',fontSize:14,fontWeight:700,flexShrink:0}}>✕</div>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:DS.warningText}}>{t('app.apiceOnDay', {day: apiceN})}</div>
                  <div style={{fontSize:12,color:DS.textSec,marginTop:2}}>{t('app.lutealFrom', {day: apiceN+4})}</div>
                </div>
              </div>
            )}

            {/* PDF button */}
            <div style={{padding:'16px 22px 0'}}>
              <button onClick={handlePDFDownload} disabled={pdfLoading}
                data-testid="export-pdf"
                style={{width:'100%',background:pdfLoading?DS.border:DS.primary,color:pdfLoading?DS.textSec:DS.surface,border:'none',borderRadius:DS.radiusBtn,padding:'13px',fontSize:13,fontWeight:700,letterSpacing:'0.04em',cursor:pdfLoading?'default':'pointer',fontFamily:'Lato,sans-serif',marginBottom:8}}>
                {pdfLoading?t('app.generatingPDF'):t('app.exportPDF')}
              </button>
            </div>

            {/* Recent list */}
            <div style={{padding:'20px 22px 0',background:DS.bg}}>
              <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:18,color:DS.textMain,marginBottom:14,fontStyle:'italic'}}>{t('app.recentRecords')}</div>
              {!Object.keys(vObs).length ? (
                <div style={{textAlign:'center',padding:'28px 0',color:DS.textSec,fontSize:13,fontStyle:'italic'}}>
                  <span style={{marginRight:6}}>○</span>{t('app.noRecords')}
                </div>
              ) : Object.entries(vObs).sort(([a],[b])=>b.localeCompare(a)).slice(0,10).map(([date,o])=>{
                const s=STAMPS.find(x=>x.id===o.stamp);
                return (
                  <div key={date} style={{background:DS.surface,border:`1px solid ${DS.border}`,borderRadius:DS.radiusCard,padding:'12px 14px',marginBottom:8,display:'flex',gap:12,alignItems:'flex-start',boxShadow:DS.shadowCard}}>
                    <div style={{width:38,height:38,borderRadius:'50%',background:s?.bg||DS.surface,border:`1.5px solid ${s?.c||DS.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Georgia,serif',fontSize:18,color:s?.c||DS.textSec,flexShrink:0,fontWeight:700}}>{s?.sym||'·'}</div>
                    <div style={{flex:1}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:2}}>
                        <span style={{fontFamily:'Cormorant Garamond,serif',fontSize:15,fontWeight:500,color:DS.textMain}}>{fmtShort(date)}</span>
                        <div style={{display:'flex',gap:6}}>
                          {o.stamp==='apice'&&<Tag label={t('stamps.apice')} color={DS.warningText} bg={DS.warningLight} border={DS.warning}/>}
                          {o.relations&&<span style={{color:DS.error,fontSize:14}}>♥</span>}
                        </div>
                      </div>
                      <div style={{fontSize:12,color:DS.textSec}}>{s&&t('stamps.'+s.id)}{o.mucus&&` · ${t('mucus.'+o.mucus)}`}{o.bleeding&&` · ${t('bleeding.'+o.bleeding)}`}</div>
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
          <div style={{padding:'24px 22px 16px',background:DS.surface,borderBottom:`1px solid ${DS.border}`}}>
            <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:13,letterSpacing:'0.14em',textTransform:'uppercase',color:DS.textSec,marginBottom:4}}>{t('app.patternsLabel')}</div>
            <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:24,color:DS.textMain,fontStyle:'italic'}}>{t('app.cycleAnalysis')}</div>
            <div style={{fontSize:12,color:DS.textSec,marginTop:2}}>{t('app.analysisBasedOn', {count: stats?.cycleCount||0})}</div>
          </div>

          {!stats ? (
            <div style={{padding:'40px 22px',textAlign:'center',color:DS.textSec,fontStyle:'italic',fontSize:13}}>
              {t('app.analysisMinCycles')}
            </div>
          ) : (
            <div style={{padding:'22px'}}>
              {/* Metrics grid */}
              {[
                { title:t('app.sectionCycleDuration'), items:[
                    {l:t('app.labelMean'),v:stats.avgLength?`${stats.avgLength} ${t('app.days', {count: stats.avgLength}).replace(stats.avgLength+' ','')}`:'—'},
                    {l:t('app.labelMin'),v:stats.minLength?`${stats.minLength} ${t('app.days', {count: stats.minLength}).replace(stats.minLength+' ','')}`:'—'},
                    {l:t('app.labelMax'),v:stats.maxLength?`${stats.maxLength} ${t('app.days', {count: stats.maxLength}).replace(stats.maxLength+' ','')}`:'—'},
                ]},
                { title:t('app.sectionLutealPhase'), items:[
                    {l:t('app.labelMean'),v:stats.avgLuteal?`${stats.avgLuteal} ${t('app.days', {count: stats.avgLuteal}).replace(stats.avgLuteal+' ','')}`:'—'},
                    {l:t('app.labelMin'),v:stats.minLuteal?`${stats.minLuteal} ${t('app.days', {count: stats.minLuteal}).replace(stats.minLuteal+' ','')}`:'—'},
                    {l:t('app.labelMax'),v:stats.maxLuteal?`${stats.maxLuteal} ${t('app.days', {count: stats.maxLuteal}).replace(stats.maxLuteal+' ','')}`:'—'},
                ]},
                { title:t('app.sectionApiceDay'), items:[
                    {l:t('app.labelAvg'),v:stats.avgApice?t('app.dayN', {n: stats.avgApice}):'—'},
                    {l:t('app.labelEarliest'),v:stats.minApice?t('app.dayN', {n: stats.minApice}):'—'},
                    {l:t('app.labelLatest'),v:stats.maxApice?t('app.dayN', {n: stats.maxApice}):'—'},
                ]},
              ].map(section=>(
                <div key={section.title} style={{background:DS.surface,border:`1px solid ${DS.border}`,borderRadius:14,padding:'16px',marginBottom:14,boxShadow:DS.shadowCard}}>
                  <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:16,color:DS.textMain,marginBottom:12}}>{section.title}</div>
                  <div style={{display:'flex',gap:8}}>
                    {section.items.map(item=>(
                      <div key={item.l} style={{flex:1,background:DS.bg,borderRadius:10,padding:'10px 8px',textAlign:'center'}}>
                        <div style={{fontSize:16,fontWeight:700,color:DS.textMain,fontFamily:'Cormorant Garamond,serif'}}>{item.v}</div>
                        <div style={{fontSize:10,color:DS.textSec,marginTop:2}}>{item.l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* BIP status */}
              <div style={{background:stats.bipConfirmed?DS.successLight:DS.warningLight,border:`1px solid ${stats.bipConfirmed?DS.successBorder:DS.warningBorder}`,borderRadius:14,padding:'14px 16px',marginBottom:14}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                  <span style={{fontSize:16,color:stats.bipConfirmed?DS.success:DS.warning}}>{stats.bipConfirmed?'✓':'○'}</span>
                  <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:16,color:stats.bipConfirmed?DS.success:DS.warning}}>{t('app.pbiTitle')}</div>
                </div>
                <div style={{fontSize:12,color:DS.textSec,lineHeight:1.6}}>
                  {stats.bipConfirmed ? t('app.pbiConfirmed') : t('app.pbiNotConfirmed')}
                </div>
              </div>

              {/* Flags */}
              <div style={{marginBottom:14}}>
                <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:16,color:DS.textMain,marginBottom:12}}>{t('app.clinicalObservations')}</div>
                {stats.flags.map((flag,i)=>{
                  const flagColors = {
                    ok:        {bg:DS.successLight, border:DS.successBorder, text:DS.success,  icon:'✓'},
                    informação:{bg:DS.warningLight,  border:DS.warningBorder, text:DS.warning,  icon:'ℹ'},
                    atenção:   {bg:DS.errorLight,    border:DS.errorBorder,   text:DS.error,    icon:'!'},
                  };
                  const fc = flagColors[flag.level] || flagColors.informação;
                  return (
                    <div key={i} style={{background:fc.bg,border:`1px solid ${fc.border}`,borderRadius:12,padding:'12px 14px',marginBottom:10,display:'flex',gap:10,alignItems:'flex-start'}}>
                      <span style={{color:fc.text,fontSize:14,flexShrink:0,marginTop:1}}>{fc.icon}</span>
                      <div style={{fontSize:12,color:DS.textSec,lineHeight:1.7}}>{flag.msg}</div>
                    </div>
                  );
                })}
              </div>

              {/* Disclaimer */}
              <div style={{background:DS.surface,border:`1px solid ${DS.border}`,borderRadius:12,padding:'12px 14px',boxShadow:DS.shadowCard}}>
                <div style={{fontSize:11,color:DS.textSec,lineHeight:1.6,textAlign:'center',fontStyle:'italic'}}>
                  {t('app.analysisDisclaimer')}
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
            <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:20,marginBottom:8,color:DS.textMain}}>{t('app.guideTitle')}</div>
            <div style={{background:DS.warningLight,border:`1px solid ${DS.warningBorder}`,borderRadius:12,padding:'10px 14px',marginBottom:10}}>
              <div style={{fontSize:12,color:DS.textSec,lineHeight:1.6}}>
                {t('app.guideWarning')} <strong style={{color:DS.warning}}>{t('app.guideWarningCycleInterpretation')}</strong> {t('app.guideWarningCycleInterpretationSuffix')}
              </div>
            </div>
          </div>

          <div style={{flex:1,overflowY:'auto',padding:'0 22px 12px'}}>
            {!msgs.length && (
              <div>
                <div style={{fontSize:11,color:DS.textSec,marginBottom:10,fontFamily:'Cormorant Garamond,serif',fontStyle:'italic'}}>{t('app.guideFAQTitle')}</div>
                {[t('app.guideFAQ1'),t('app.guideFAQ2'),t('app.guideFAQ3'),t('app.guideFAQ4'),t('app.guideFAQ5')].map(q=>(
                  <button key={q} onClick={()=>sendAI(q)} style={{display:'block',width:'100%',background:DS.surface,border:`1px solid ${DS.border}`,borderRadius:10,padding:'11px 14px',textAlign:'left',fontSize:13,color:DS.textSec,cursor:'pointer',marginBottom:8,fontFamily:'inherit',boxShadow:DS.shadowCard}}>
                    {q}
                  </button>
                ))}
              </div>
            )}
            {msgs.map((m,i)=>(
              <div key={i} style={{display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start',marginBottom:10}}>
                <div style={{maxWidth:'82%',padding:'10px 14px',fontSize:13,lineHeight:1.6,
                  borderRadius:m.role==='user'?'16px 16px 4px 16px':'16px 16px 16px 4px',
                  background:m.role==='user'?DS.primary:DS.surface,color:m.role==='user'?DS.surface:DS.textMain,
                  border:m.role==='assistant'?`1px solid ${DS.border}`:'none',boxShadow:m.role==='assistant'?DS.shadowCard:'none'}}>
                  {m.content}
                </div>
              </div>
            ))}
            {aiLoading && (
              <div style={{display:'flex',gap:4,padding:'4px 0 12px'}}>
                {[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:'50%',background:DS.primary,animation:`dot 1s ${i*0.2}s infinite`}}/>)}
              </div>
            )}
            <div ref={chatEnd}/>
          </div>

          <div style={{padding:'10px 22px 24px',borderTop:`1px solid ${DS.border}`,background:DS.surface,display:'flex',gap:8}}>
            <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendAI()}
              placeholder={t('app.guideInputPlaceholder')}
              aria-label={t('app.guideInputPlaceholder')}
              style={{flex:1,background:DS.bg,border:`1px solid ${DS.border}`,borderRadius:12,padding:'11px 14px',fontSize:13,color:DS.textMain,outline:'none'}}
            />
            <button onClick={()=>sendAI()} disabled={aiLoading||!input.trim()}
              aria-label={t('common.save')}
              style={{background:input.trim()?DS.primary:DS.border,color:input.trim()?DS.surface:DS.textSec,border:'none',borderRadius:12,padding:'11px 18px',cursor:input.trim()?'pointer':'default',fontSize:15}}>↑</button>
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
        <div style={{padding:'40px 22px',textAlign:'center',color:DS.textSec,fontStyle:'italic',fontSize:13}}>
          {t('app.loginRequired')}
        </div>
      )}

      {/* ══ PERFIL ═══════════════════════════════════ */}
      {tab==='perfil' && (
        <div style={{paddingBottom:100}}>
          <div style={{padding:'24px 22px 16px',background:DS.surface,borderBottom:`1px solid ${DS.border}`}}>
            <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:13,letterSpacing:'0.14em',textTransform:'uppercase',color:DS.textSec,marginBottom:4}}>{t('app.profileLabel')}</div>
            <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:24,color:DS.textMain,fontStyle:'italic'}}>{t('app.profileTitle')}</div>
          </div>

          <div style={{padding:'22px'}}>
            {/* Instructor */}
            <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:18,color:DS.textMain,marginBottom:14}}>{t('app.myInstructor')}</div>
            {!instructor ? (
              <div>
                <div style={{textAlign:'center',padding:'16px 0 20px',color:DS.textSec}}>
                  <div style={{fontSize:32,marginBottom:8}}>○</div>
                  <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:16,color:DS.textSec,marginBottom:4}}>{t('app.noInstructor')}</div>
                </div>
                <div style={{background:DS.surface,border:`1px solid ${DS.border}`,borderRadius:14,padding:'18px',marginBottom:16,boxShadow:DS.shadowCard}}>
                  {[
                    {key:'name',label:t('app.nameLabel'),ph:t('app.instructorNamePh'),type:'text'},
                    {key:'email',label:t('app.emailLabel'),ph:t('app.instructorEmailPh'),type:'email'},
                  ].map(f=>(
                    <div key={f.key} style={{marginBottom:14}}>
                      <label htmlFor={`instructor-${f.key}`} style={{display:'block',fontSize:10,fontWeight:700,color:DS.textSec,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:8}}>{f.label}</label>
                      <input id={`instructor-${f.key}`} value={instrForm[f.key]} type={f.type} onChange={e=>setInstrForm(p=>({...p,[f.key]:e.target.value}))}
                        placeholder={f.ph}
                        style={{width:'100%',background:DS.bg,border:`1px solid ${DS.border}`,borderRadius:10,padding:'11px 14px',fontSize:13,color:DS.textMain,outline:'none',boxSizing:'border-box'}}
                      />
                    </div>
                  ))}
                  <button onClick={()=>{if(instrForm.name.trim()&&instrForm.email.trim())saveInstructor({name:instrForm.name.trim(),email:instrForm.email.trim()});}}
                    data-testid="associate-instructor"
                    style={{width:'100%',background:instrForm.name.trim()&&instrForm.email.trim()?DS.primary:DS.border,color:instrForm.name.trim()&&instrForm.email.trim()?DS.surface:DS.textSec,border:'none',borderRadius:DS.radiusBtn,padding:'13px',fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:'Lato,sans-serif',letterSpacing:'0.04em'}}>
                    {t('app.associateInstructor')}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{marginBottom:16}}>
                <div style={{background:DS.surface,border:`1px solid ${DS.primaryBorder}`,borderRadius:14,padding:'16px',marginBottom:10,boxShadow:DS.shadowCard}}>
                  <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
                    <div style={{width:44,height:44,borderRadius:'50%',background:DS.primaryLight,border:`1.5px solid ${DS.primaryBorder}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,color:DS.primary,flexShrink:0}}>○</div>
                    <div>
                      <div style={{fontSize:15,fontWeight:700,color:DS.textMain}}>{instructor.name}</div>
                      <div style={{fontSize:12,color:DS.textSec,marginTop:2}}>{instructor.email}</div>
                    </div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:6,background:DS.successLight,border:`1px solid ${DS.successBorder}`,borderRadius:8,padding:'7px 12px'}}>
                    <span style={{color:DS.success,fontSize:12}}>✓</span>
                    <span style={{fontSize:12,color:DS.success,fontWeight:600}}>{t('app.activeAssociation')}</span>
                  </div>
                </div>
                <button onClick={()=>window.open(`https://wa.me/?text=${encodeURIComponent(t('app.whatsappMessage', {name: instructor.name, day: todayN, date: fmtShort(cycleStart)}))}`, '_blank')}
                  data-testid="share-whatsapp"
                  style={{width:'100%',background:DS.secondary,color:DS.surface,border:'none',borderRadius:DS.radiusBtn,padding:'13px',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'Lato,sans-serif',marginBottom:8,display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                  <span>↗</span> {t('app.shareWhatsApp')}
                </button>
                {!instrConfirm ? (
                  <button onClick={()=>setInstrConfirm(true)}
                    data-testid="dissociate-instructor"
                    style={{width:'100%',background:'transparent',color:DS.textSec,border:`1px solid ${DS.border}`,borderRadius:DS.radiusBtn,padding:'11px',fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>
                    {t('app.dissociateInstructor')}
                  </button>
                ) : (
                  <div style={{background:DS.errorLight,border:`1px solid ${DS.errorBorder}`,borderRadius:14,padding:14}}>
                    <div style={{fontSize:13,color:DS.error,marginBottom:12}}>{t('app.confirmDissociate', {name: instructor.name})}</div>
                    <div style={{display:'flex',gap:8}}>
                      <button onClick={removeInstructor} data-testid="confirm-dissociate" style={{flex:1,background:DS.error,color:DS.surface,border:'none',borderRadius:10,padding:'10px',fontSize:13,cursor:'pointer',fontFamily:'inherit',fontWeight:700}}>{t('common.confirm')}</button>
                      <button onClick={()=>setInstrConfirm(false)} style={{flex:1,background:DS.bg,color:DS.textSec,border:`1px solid ${DS.border}`,borderRadius:10,padding:'10px',fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>{t('common.cancel')}</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Reminders */}
            <div style={{fontFamily:'Cormorant Garamond,serif',fontSize:18,color:DS.textMain,marginBottom:12,marginTop:16}}>{t('app.remindersSection')}</div>
            <div style={{background:DS.surface,border:`1px solid ${DS.border}`,borderRadius:14,padding:'16px',marginBottom:16,boxShadow:DS.shadowCard}}>
              <div style={{fontSize:13,color:DS.textSec,lineHeight:1.6,marginBottom:14}}>
                {t('app.remindersDesc')}
              </div>
              <button onClick={()=>downloadICS(generateDailyReminder({hour:21}))}
                data-testid="download-reminder"
                style={{width:'100%',background:DS.primary,color:DS.surface,border:'none',borderRadius:DS.radiusBtn,padding:'13px',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'Lato,sans-serif',letterSpacing:'0.04em'}}>
                {t('app.downloadReminder')}
              </button>
            </div>

            {/* Disclaimer */}
            <div style={{marginTop:20,background:DS.warningLight,border:`1px solid ${DS.warningBorder}`,borderRadius:12,padding:'12px 14px'}}>
              <div style={{fontSize:11,color:DS.textSec,lineHeight:1.7}}>
                <strong style={{color:DS.warning}}>{t('app.importantLabel')}</strong> — {t('app.profileDisclaimer')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ FEEDBACK ══════════════════════════════════ */}
      {tab==='feedback' && (
        <FeedbackPage session={session} />
      )}

      {/* ══ NAV ══════════════════════════════════════ */}
      <nav role="navigation" aria-label={t('nav.hoje')} style={{position:'fixed',bottom:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:430,background:DS.surface,boxShadow:'0 -2px 8px rgba(0,0,0,0.06)',zIndex:20,padding:'6px 16px 12px'}}>
        <div role="tablist" style={{display:'flex',gap:4}}>
          {[{id:'hoje',l:t('nav.hoje'),i:'◎'},{id:'grafico',l:t('nav.grafico'),i:'⊞'},{id:'analise',l:t('nav.analise'),i:'◈'},{id:'guia',l:t('nav.guia'),i:'✦'},{id:'feedback',l:'Feedback',i:'◫'},{id:'vinculo',l:t('nav.vinculo'),i:'⊕'},{id:'notificacoes',l:t('nav.notificacoes'),i:'◉'},{id:'perfil',l:t('nav.perfil'),i:'○'}].map(navItem=>(
            <button key={navItem.id} role="tab" aria-selected={tab===navItem.id} onClick={()=>setTab(navItem.id)} style={{flex:1,background:tab===navItem.id?`${DS.primary}18`:'transparent',border:`1px solid ${tab===navItem.id?DS.primary:DS.border}`,borderRadius:10,padding:'8px 0 6px',cursor:'pointer',fontFamily:'inherit',display:'flex',flexDirection:'column',alignItems:'center',gap:2,transition:'all 0.2s'}}>
              <span style={{fontSize:16,color:tab===navItem.id?DS.primary:DS.textSec}}>{navItem.i}</span>
              <span style={{fontSize:9,color:tab===navItem.id?DS.primary:DS.textSec,fontWeight:tab===navItem.id?700:400}}>{navItem.l}</span>
            </button>
          ))}
        </div>
      </nav>

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
