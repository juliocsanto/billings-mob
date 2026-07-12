import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { pdf } from '@react-pdf/renderer';
import { Toaster, toast } from 'sonner';
import { ChartDocument } from './pdf/ChartPDF.jsx';
import { STAMPS, EMPTY_FORM } from './constants.js';
import { getLastOpenDate, setLastOpenDate, getOnboardingSeen, setOnboardingSeen } from './utils/storage.js';
import { OnboardingFlow } from './components/onboarding/OnboardingFlow.jsx';
import { supabase } from './lib/supabaseClient';
import { today, addDays, genDays } from './utils/dates.js';
import { computeMultiCycleStats } from './utils/analysis.js';
import { deriveInstructorLinkStatus } from './utils/instructorLinkStatus.js';
import { computeStreak, hasRecordedToday, missedYesterday } from './utils/streak.js';
import { useObservationData } from './hooks/useObservationData';
import { useInstructorLink } from './hooks/useInstructorLink';
import { DayDetailModal } from './components/DayDetailModal.jsx';
import { BottomNav } from './components/BottomNav';
import { OfflineIndicator, Badge } from './components/ui';
import { HojePage } from './pages/HojePage.jsx';
import { GraficoPage } from './pages/GraficoPage.jsx';
import { AnalisePage } from './pages/AnalisePage.jsx';
import { GuiaPage } from './pages/GuiaPage.jsx';
import { PerfilPage } from './pages/PerfilPage.jsx';
import { LinkInstructorPage } from './pages/LinkInstructorPage.tsx';
import { NotificationPreferencesPage } from './pages/NotificationPreferencesPage.tsx';
import { FeedbackPage } from './components/feedback/FeedbackPage.tsx';
import { PrivacyTrustPage } from './pages/PrivacyTrustPage.jsx';

// ── Demo data (anonymous try-out mode only — never shown to logged-in users) ──
function buildDemoData() {
  const tod = today();
  const daysAgo = (n) => addDays(tod, -n);
  const DS_START = daysAgo(28);
  const DO = {};
  const mk = (stamp, extra = {}) => ({ ...EMPTY_FORM, stamp, ...extra });
  [
    [daysAgo(28), mk('sangramento', { bleeding: 'intenso', tipo_observacao: 'sangue' })],
    [daysAgo(27), mk('sangramento', { bleeding: 'moderado', tipo_observacao: 'sangue' })],
    [daysAgo(26), mk('sangramento', { bleeding: 'leve', tipo_observacao: 'sangue' })],
    [daysAgo(25), mk('seco', { sensacao: 'seca' })],
    [daysAgo(24), mk('seco', { sensacao: 'seca' })],
    [daysAgo(23), mk('seco', { sensacao: 'seca' })],
    [daysAgo(22), mk('muco', { mucus: 'opaco', sensacao: 'molhada' })],
    [daysAgo(21), mk('muco', { mucus: 'cremoso', sensacao: 'molhada' })],
    [daysAgo(20), mk('muco', { mucus: 'transparente', sensacao: 'lubrificante' })],
    [daysAgo(19), mk('apice', { mucus: 'elastico', sensacao: 'lubrificante' })],
    [daysAgo(18), mk('seco', { sensacao: 'seca' })],
    [daysAgo(17), mk('seco', { sensacao: 'seca' })],
    [daysAgo(2), mk('seco', { sensacao: 'seca' })],
  ].forEach(([d, o]) => {
    DO[d] = o;
  });
  return { cycleStart: DS_START, obs: DO, history: [] };
}

// ── Main App ──────────────────────────────────────────────

export default function App({ user, session } = {}) {
  const { t } = useTranslation();
  const userId = user?.id ?? null;
  const [tab, setTab] = useState('hoje');
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saved, setSaved] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [selCycle, setSelCycle] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null); // { date, n, obs } for DayDetailModal
  const chatEnd = useRef(null);

  // First-use onboarding gate — shown once, gated by localStorage.
  // Initialized lazily so SSR-hostile localStorage is only read once on mount.
  const [showOnboarding, setShowOnboarding] = useState(() => !getOnboardingSeen());
  const handleOnboardingDone = () => {
    setOnboardingSeen();
    setShowOnboarding(false);
  };

  // Local-first observation store with server sync (C-3 / ADR-004).
  const {
    loaded,
    hydrating,
    pendingCount,
    obs,
    cycleStart,
    history,
    saveObservation,
    startNewCycle,
  } = useObservationData(session ?? null, buildDemoData);

  // Real instructor link (Vínculo flow) — used by Perfil and the PDF export.
  const { links, getMyLinks } = useInstructorLink(session ?? null);
  useEffect(() => {
    if (session) void getMyLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  const activeLink = links.find((l) => l.status === 'active') ?? null;
  const instructorLinkStatus = deriveInstructorLinkStatus(links);

  // Daily reminder toast (LVL-17 — replaces sticky banner).
  // Extended with missed-day nudge: if the aluna has a live streak but hasn't
  // recorded today, encourage keeping it; if yesterday was also missed, softer
  // "resume" message. One toast only — non-nagging, once per day.
  // Suppressed on first use: the onboarding overlay already welcomes the user;
  // showing a toast simultaneously would be redundant and noisy.
  useEffect(() => {
    const last = getLastOpenDate();
    if (last !== today()) {
      setLastOpenDate(today());
      // Skip toast if the user is seeing the onboarding for the first time.
      if (!getOnboardingSeen()) return;

      const streak = computeStreak(obs, today());
      const recordedToday = hasRecordedToday(obs, today());
      const missed = missedYesterday(obs, today());

      let message;
      if (streak > 0 && !recordedToday) {
        // Streak alive but today not yet recorded — encourage continuing.
        message = t('streak.nudgeContinue', { count: streak });
      } else if (missed && !recordedToday) {
        // No active streak and yesterday was missed — gentle resume prompt.
        message = t('streak.nudgeResume');
      } else {
        // Default daily reminder.
        message = t('app.banner');
      }

      toast.info(message, { duration: 6000 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Reflect today's observation in the form once data (and hydration) land.
  useEffect(() => {
    if (!loaded || hydrating) return;
    const todayObs = obs?.[today()];
    if (todayObs) {
      setForm({ ...EMPTY_FORM, ...todayObs });
      setSaved(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, hydrating]);

  const handleSave = (newForm) => {
    void saveObservation(today(), newForm);
    setSaved(true);
  };

  const handleStartNewCycle = (f, ns) => {
    void startNewCycle(f, ns);
    setForm(f);
    setSaved(true);
  };

  // Save edited observation from DayDetailModal (supports past and today)
  const handleDaySave = (date, formData) => {
    void saveObservation(date, formData);
    if (date === today()) {
      setForm({ ...EMPTY_FORM, ...formData });
      setSaved(true);
    }
  };

  const handlePDFDownload = async () => {
    setPdfLoading(true);
    try {
      const cycle = selCycle || { start: cycleStart, obs };
      const instructor = activeLink ? { name: activeLink.instructor_name, email: '' } : null;
      const blob = await pdf(<ChartDocument cycle={cycle} history={history} instructor={instructor} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `grafico-billings-${cycle.start}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Erro ao gerar PDF: ' + e.message);
    }
    setPdfLoading(false);
  };

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  // sendAI — ADR-016: proxied via Supabase Edge Function (claude-sonnet-4-6 SSE streaming).
  // LGPD: only { question } is sent — never observations, stamps, notes, or relations.
  const sendAI = async (text) => {
    const msg = text || input.trim();
    if (!msg || aiLoading) return;
    setInput('');
    setMsgs((p) => [...p, { role: 'user', content: msg }]);
    setAiLoading(true);

    // Auth: require Supabase session — no user-provided API key needed
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();
    if (!currentSession?.access_token) {
      setMsgs((p) => [...p, { role: 'assistant', content: t('app.guideNeedApiKeyMsg') }]);
      setAiLoading(false);
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/ai-guide`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentSession.access_token}`,
        },
        // LGPD: only question is forwarded — never cycle data
        body: JSON.stringify({ question: msg }),
      });

      if (!response.ok) {
        setMsgs((p) => [...p, { role: 'assistant', content: t('app.guideErrorConnection') }]);
        setAiLoading(false);
        return;
      }

      // Read SSE stream and accumulate tokens in real time
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMsg = '';
      setMsgs((p) => [...p, { role: 'assistant', content: '' }]);

      let streamDone = false;
      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              streamDone = true;
              break;
            }
            try {
              const { token } = JSON.parse(data);
              assistantMsg += token;
              setMsgs((p) => {
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
      setMsgs((p) => [...p, { role: 'assistant', content: t('app.guideErrorConnection') }]);
    }

    setAiLoading(false);
  };

  const days = genDays(cycleStart, obs);
  const todayN = days.find((d) => d.date === today())?.n || 1;
  const aStamp = STAMPS.find((s) => s.id === form.stamp);
  const sStamp = STAMPS.find((s) => s.id === obs[today()]?.stamp);
  const disp = aStamp || sStamp;
  const stats = computeMultiCycleStats({ start: cycleStart, obs }, history);

  if (!loaded)
    return (
      <div role="status" className="flex h-screen items-center justify-center bg-bg-app font-sans text-text-sec">
        {t('common.loading')}
      </div>
    );

  return (
    <div className="relative mx-auto min-h-screen max-w-[430px] bg-bg-app font-sans text-text-main">
      <Toaster position="top-center" richColors closeButton theme="system" />
      <OfflineIndicator />

      {/* ── FIRST-USE ONBOARDING ─────────────────── */}
      {showOnboarding && <OnboardingFlow onFinish={handleOnboardingDone} />}

      {/* ── HEADER ─────────────────────────────── */}
      {/* LVL-17: inline style removed — now uses sticky top-0 Tailwind class */}
      {/* LVL-09: context-sensitive header — hero date on Hoje tab */}
      <div className="sticky top-0 z-20 border-b border-border bg-surface px-5 py-3.5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {tab === 'hoje' ? (
              <>
                <p className="text-[10px] uppercase tracking-wider text-text-sec">{t('auth.appName')}</p>
                <p className="font-display italic text-2xl text-text-main leading-tight">
                  {(() => {
                    const wd = new Date(today() + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' });
                    return wd.charAt(0).toUpperCase() + wd.slice(1);
                  })()}
                </p>
              </>
            ) : (
              <>
                <p className="font-display text-xl font-bold text-text-main">{t('auth.appName')}</p>
                <p className="mt-0.5 text-xs text-text-sec">
                  {t('app.headerSubtitle', {
                    day: todayN,
                    date: new Date(today() + 'T12:00:00').toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                    }),
                  })}
                </p>
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {pendingCount > 0 && (
              <Badge tone="warning" data-testid="pending-sync">
                {t('app.pendingSync', { count: pendingCount })}
              </Badge>
            )}
            {disp && (
              <span
                className="rounded-full border px-2.5 py-1 text-xs font-bold"
                style={{ color: disp.c, background: disp.bg, borderColor: disp.border || disp.c }}
              >
                {t('stamps.' + disp.id)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── PAGES — LVL-13: key={tab} triggers fade-in on every tab switch ── */}
      <div key={tab} className="animate-fade-in motion-reduce:animate-none">
        {tab === 'hoje' && (
          <HojePage
            form={form}
            setForm={setForm}
            saved={saved}
            confirmNew={confirmNew}
            setConfirmNew={setConfirmNew}
            onSave={handleSave}
            onStartNewCycle={handleStartNewCycle}
            obs={obs}
          />
        )}

        {tab === 'grafico' && (
          <GraficoPage
            obs={obs}
            cycleStart={cycleStart}
            history={history}
            todayN={todayN}
            selCycle={selCycle}
            setSelCycle={setSelCycle}
            onDayClick={setSelectedDay}
            onExportPDF={handlePDFDownload}
            pdfLoading={pdfLoading}
          />
        )}

        {tab === 'analise' && (
          <AnalisePage
            stats={stats}
            obs={obs}
            instructorLinkStatus={instructorLinkStatus}
            onNavigate={setTab}
          />
        )}

        {tab === 'guia' && (
          <GuiaPage msgs={msgs} input={input} setInput={setInput} aiLoading={aiLoading} sendAI={sendAI} chatEnd={chatEnd} />
        )}

        {tab === 'vinculo' && <LinkInstructorPage session={session} onBack={() => setTab('perfil')} />}

        {tab === 'notificacoes' && user && <NotificationPreferencesPage />}
        {tab === 'notificacoes' && !user && (
          <p className="px-5 py-10 text-center text-sm italic text-text-sec">{t('app.loginRequired')}</p>
        )}

        {tab === 'perfil' && (
          <PerfilPage
            user={user}
            activeLink={activeLink}
            todayN={todayN}
            cycleStart={cycleStart}
            onNavigate={setTab}
          />
        )}

        {tab === 'privacidade' && <PrivacyTrustPage onBack={() => setTab('perfil')} />}

        {tab === 'feedback' && <FeedbackPage session={session} />}
      </div>

      {/* ── NAV ─────────────────────────────────── */}
      <BottomNav tab={tab} onNavigate={setTab} />

      {/* ── DAY DETAIL MODAL ────────────────────── */}
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
