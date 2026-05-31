/**
 * NotificationPreferencesPage — student notification preferences UI.
 *
 * Sections:
 *  1. Push notification permission request / status
 *  2. Daily reminder toggle + time picker
 *  3. Alert toggles (apex, conflict)
 *
 * LGPD: displays no clinical data about the student's cycle.
 * Clinical constraint: NO mention of fertile/infertile phases — the push
 * notifications are purely about app-level events (reminders, comments,
 * instructor conflict resolution), never about cycle interpretation.
 *
 * Graceful degradation:
 *  - When Notification API is absent, shows a friendly unsupported message.
 *  - When permission is denied, shows browser-specific instructions.
 *
 * ADR-005: session-based auth — hook reads access_token from Supabase session.
 */
import React from 'react';
import { usePushNotifications } from '../hooks/usePushNotifications';

// ─── Design tokens (matches App.jsx C palette) ────────────────────────────────
const C = {
  bg:          '#FAF7F4',
  surface:     '#FFFFFF',
  card:        '#F5F0EB',
  border:      '#E8E0D8',
  terra:       '#8C3C28',
  terraLight:  '#FDF3EE',
  terraBorder: '#E8C8BB',
  sage:        '#4A7C5C',
  sageLight:   '#EAF4EE',
  sageBorder:  '#B0D4BC',
  amber:       '#A07828',
  amberLight:  '#FDF6E8',
  amberBorder: '#E8D4A0',
  rose:        '#B05070',
  roseLight:   '#FEF0F4',
  roseBorder:  '#E8C0CC',
  text:        '#2D2520',
  textSec:     '#6B5B52',
  textMuted:   '#9E8E84',
  white:       '#FFFFFF',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ToggleProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function Toggle({ id, label, description, checked, onChange, disabled = false }: ToggleProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        padding: '14px 0',
        borderBottom: `1px solid ${C.border}`,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{ flex: 1, paddingRight: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>{description}</div>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        style={{
          width: 48,
          height: 28,
          borderRadius: 14,
          border: 'none',
          background: checked ? C.terra : C.border,
          cursor: disabled ? 'default' : 'pointer',
          position: 'relative',
          flexShrink: 0,
          transition: 'background 0.2s',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: checked ? 23 : 3,
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: C.white,
            transition: 'left 0.2s',
            boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
          }}
        />
      </button>
    </div>
  );
}

// ─── Permission Status Banner ──────────────────────────────────────────────────

function PermissionBanner({
  permission,
  onRequest,
  loading,
}: {
  permission: string;
  onRequest: () => Promise<void>;
  loading: boolean;
}) {
  if (permission === 'unsupported') {
    return (
      <div
        style={{
          background: C.amberLight,
          border: `1px solid ${C.amberBorder}`,
          borderRadius: 12,
          padding: '12px 16px',
          marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.6 }}>
          Seu navegador não suporta notificações push. Considere usar o app em um
          navegador compatível (Chrome, Firefox, Edge ou Safari no iOS 16.4+).
        </div>
      </div>
    );
  }

  if (permission === 'denied') {
    return (
      <div
        style={{
          background: C.roseLight,
          border: `1px solid ${C.roseBorder}`,
          borderRadius: 12,
          padding: '12px 16px',
          marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: C.rose, marginBottom: 6 }}>
          Notificações bloqueadas
        </div>
        <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.6 }}>
          Para receber notificações, acesse as configurações do seu navegador e
          permita notificações para este site. No Chrome: clique no cadeado na barra
          de endereços &rarr; Notificações &rarr; Permitir.
        </div>
      </div>
    );
  }

  if (permission === 'granted') {
    return (
      <div
        style={{
          background: C.sageLight,
          border: `1px solid ${C.sageBorder}`,
          borderRadius: 12,
          padding: '12px 16px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ color: C.sage, fontSize: 16 }}>✓</span>
        <div style={{ fontSize: 13, color: C.sage, fontWeight: 500 }}>
          Notificações push ativadas neste dispositivo
        </div>
      </div>
    );
  }

  // permission === 'default'
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          background: C.terraLight,
          border: `1px solid ${C.terraBorder}`,
          borderRadius: 12,
          padding: '14px 16px',
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.6, marginBottom: 12 }}>
          Ative as notificações para receber lembretes de registro e avisos sobre
          comentários da instrutora.
        </div>
        <div
          style={{
            fontSize: 11,
            color: C.textMuted,
            lineHeight: 1.6,
            fontStyle: 'italic',
            marginBottom: 12,
          }}
        >
          As notificações nunca contêm dados clínicos do seu ciclo.
        </div>
        <button
          onClick={onRequest}
          disabled={loading}
          style={{
            width: '100%',
            background: loading ? C.border : C.terra,
            color: loading ? C.textMuted : C.white,
            border: 'none',
            borderRadius: 10,
            padding: '12px',
            fontSize: 13,
            fontWeight: 700,
            cursor: loading ? 'default' : 'pointer',
            fontFamily: 'Lato, sans-serif',
            letterSpacing: '0.04em',
          }}
        >
          {loading ? 'Ativando...' : 'Ativar notificações'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function NotificationPreferencesPage() {
  const {
    permission,
    preferences,
    loading,
    error,
    requestPermission,
    updatePreferences,
  } = usePushNotifications();

  const [requestingPermission, setRequestingPermission] = React.useState(false);

  const handleRequestPermission = async () => {
    setRequestingPermission(true);
    await requestPermission();
    setRequestingPermission(false);
  };

  const handleToggle = async (field: string, value: boolean) => {
    await updatePreferences({ [field]: value } as Record<string, boolean>);
  };

  const handleTimeChange = async (value: string) => {
    await updatePreferences({ daily_reminder_time: value });
  };

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* Header */}
      <div
        style={{
          padding: '24px 22px 16px',
          background: C.surface,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div
          style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: 13,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: C.textMuted,
            marginBottom: 4,
          }}
        >
          Configurações
        </div>
        <div
          style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: 24,
            color: C.text,
            fontStyle: 'italic',
          }}
        >
          Notificações
        </div>
      </div>

      <div style={{ padding: '22px' }}>
        {/* Error banner */}
        {error && (
          <div
            style={{
              background: C.roseLight,
              border: `1px solid ${C.roseBorder}`,
              borderRadius: 10,
              padding: '10px 14px',
              marginBottom: 16,
              fontSize: 13,
              color: C.rose,
            }}
          >
            {error}
          </div>
        )}

        {/* Push permission section */}
        <div
          style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: 18,
            color: C.text,
            marginBottom: 14,
          }}
        >
          Notificações push
        </div>

        <PermissionBanner
          permission={permission}
          onRequest={handleRequestPermission}
          loading={requestingPermission}
        />

        {/* Reminders section */}
        <div
          style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: 18,
            color: C.text,
            marginBottom: 14,
            marginTop: 8,
          }}
        >
          Lembretes
        </div>

        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            padding: '0 16px',
            marginBottom: 20,
          }}
        >
          <Toggle
            id="daily-reminder"
            label="Lembrete diário"
            description="Receba um lembrete para anotar suas observações do dia."
            checked={preferences?.daily_reminder_enabled ?? false}
            onChange={(v) => void handleToggle('daily_reminder_enabled', v)}
            disabled={loading || permission === 'unsupported' || permission === 'denied'}
          />

          {/* Time picker — only shown when reminder is enabled */}
          {preferences?.daily_reminder_enabled && (
            <div
              style={{
                padding: '14px 0',
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: C.textMuted,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                Horário do lembrete
              </div>
              <input
                type="time"
                value={preferences.daily_reminder_time}
                onChange={(e) => void handleTimeChange(e.target.value)}
                style={{
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 14,
                  color: C.text,
                  outline: 'none',
                  fontFamily: 'Lato, sans-serif',
                }}
              />
            </div>
          )}
        </div>

        {/* Alerts section */}
        <div
          style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: 18,
            color: C.text,
            marginBottom: 14,
          }}
        >
          Alertas
        </div>

        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            padding: '0 16px',
            marginBottom: 20,
          }}
        >
          <Toggle
            id="apex-alert"
            label="Novos comentários da instrutora"
            description="Notificar quando sua instrutora adicionar um comentário ou revisão."
            checked={preferences?.apex_alert_enabled ?? true}
            onChange={(v) => void handleToggle('apex_alert_enabled', v)}
            disabled={loading || permission === 'unsupported' || permission === 'denied'}
          />
          <Toggle
            id="conflict-alert"
            label="Resolução de observações"
            description="Notificar quando sua instrutora revisar e resolver uma observação."
            checked={preferences?.conflict_alert_enabled ?? true}
            onChange={(v) => void handleToggle('conflict_alert_enabled', v)}
            disabled={loading || permission === 'unsupported' || permission === 'denied'}
          />
        </div>

        {/* Privacy notice */}
        <div
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: '12px 14px',
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: C.textMuted,
              lineHeight: 1.7,
              textAlign: 'center',
              fontStyle: 'italic',
            }}
          >
            As notificações nunca contêm dados clínicos do seu ciclo. As mensagens
            indicam apenas que há novas informações aguardando a sua atenção no
            aplicativo.
          </div>
        </div>
      </div>
    </div>
  );
}
