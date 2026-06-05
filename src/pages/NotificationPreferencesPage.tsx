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
import { useTranslation } from 'react-i18next';
import { DS } from '../constants.js';
import { usePushNotifications } from '../hooks/usePushNotifications';

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
        borderBottom: `1px solid ${DS.border}`,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{ flex: 1, paddingRight: 16 }}>
        <div id={id} style={{ fontSize: 14, fontWeight: 600, color: DS.textMain, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 12, color: DS.textSec, lineHeight: 1.5 }}>{description}</div>
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
          background: checked ? DS.primary : DS.border,
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
            background: DS.surface,
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
  const { t } = useTranslation();

  if (permission === 'unsupported') {
    return (
      <div
        style={{
          background: DS.warningLight,
          border: `1px solid ${DS.warningBorder}`,
          borderRadius: 12,
          padding: '12px 16px',
          marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 13, color: DS.textSec, lineHeight: 1.6 }}>
          {t('notifications.unsupported')}
        </div>
      </div>
    );
  }

  if (permission === 'denied') {
    return (
      <div
        style={{
          background: DS.errorLight,
          border: `1px solid ${DS.errorBorder}`,
          borderRadius: 12,
          padding: '12px 16px',
          marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: DS.error, marginBottom: 6 }}>
          {t('notifications.blocked')}
        </div>
        <div style={{ fontSize: 12, color: DS.textSec, lineHeight: 1.6 }}>
          {t('notifications.blockedDescription')}
        </div>
      </div>
    );
  }

  if (permission === 'granted') {
    return (
      <div
        style={{
          background: DS.successLight,
          border: `1px solid ${DS.successBorder}`,
          borderRadius: 12,
          padding: '12px 16px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ color: DS.success, fontSize: 16 }}>✓</span>
        <div style={{ fontSize: 13, color: DS.success, fontWeight: 500 }}>
          {t('notifications.granted')}
        </div>
      </div>
    );
  }

  // permission === 'default'
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          background: DS.primaryLight,
          border: `1px solid ${DS.primaryBorder}`,
          borderRadius: 12,
          padding: '14px 16px',
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 13, color: DS.textSec, lineHeight: 1.6, marginBottom: 12 }}>
          {t('notifications.enableDescription')}
        </div>
        <div
          style={{
            fontSize: 11,
            color: DS.textSec,
            lineHeight: 1.6,
            fontStyle: 'italic',
            marginBottom: 12,
          }}
        >
          {t('notifications.enablePrivacyNote')}
        </div>
        <button
          onClick={onRequest}
          disabled={loading}
          style={{
            width: '100%',
            background: loading ? DS.border : DS.primary,
            color: loading ? DS.textSec : DS.surface,
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
          {loading ? t('notifications.enabling') : t('notifications.enableButton')}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function NotificationPreferencesPage() {
  const { t } = useTranslation();
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
          background: DS.surface,
          borderBottom: `1px solid ${DS.border}`,
        }}
      >
        <div
          style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: 13,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: DS.textSec,
            marginBottom: 4,
          }}
        >
          {t('notifications.sectionLabel')}
        </div>
        <div
          style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: 24,
            color: DS.textMain,
            fontStyle: 'italic',
          }}
        >
          {t('notifications.pageTitle')}
        </div>
      </div>

      <div style={{ padding: '22px' }}>
        {/* Error banner */}
        {error && (
          <div
            role="status"
            aria-live="polite"
            style={{
              background: DS.errorLight,
              border: `1px solid ${DS.errorBorder}`,
              borderRadius: 10,
              padding: '10px 14px',
              marginBottom: 16,
              fontSize: 13,
              color: DS.error,
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
            color: DS.textMain,
            marginBottom: 14,
          }}
        >
          {t('notifications.pushTitle')}
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
            color: DS.textMain,
            marginBottom: 14,
            marginTop: 8,
          }}
        >
          {t('notifications.remindersTitle')}
        </div>

        <div
          style={{
            background: DS.surface,
            border: `1px solid ${DS.border}`,
            borderRadius: 14,
            padding: '0 16px',
            marginBottom: 20,
          }}
        >
          <Toggle
            id="daily-reminder"
            label={t('notifications.dailyReminder')}
            description={t('notifications.dailyReminderDesc')}
            checked={preferences?.daily_reminder_enabled ?? false}
            onChange={(v) => void handleToggle('daily_reminder_enabled', v)}
            disabled={loading || permission === 'unsupported' || permission === 'denied'}
          />

          {/* Time picker — only shown when reminder is enabled */}
          {preferences?.daily_reminder_enabled && (
            <div
              style={{
                padding: '14px 0',
                borderBottom: `1px solid ${DS.border}`,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: DS.textSec,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                {t('notifications.reminderTime')}
              </div>
              <input
                type="time"
                aria-label={t('notifications.reminderTimeAriaLabel')}
                value={preferences.daily_reminder_time}
                onChange={(e) => void handleTimeChange(e.target.value)}
                onFocus={e => { e.target.style.outline = `2px solid ${DS.primary}`; e.target.style.outlineOffset = '2px'; }}
                onBlur={e => { e.target.style.outline = 'none'; }}
                style={{
                  background: DS.surface,
                  border: `1px solid ${DS.border}`,
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 14,
                  color: DS.textMain,
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
            color: DS.textMain,
            marginBottom: 14,
          }}
        >
          {t('notifications.alertsTitle')}
        </div>

        <div
          style={{
            background: DS.surface,
            border: `1px solid ${DS.border}`,
            borderRadius: 14,
            padding: '0 16px',
            marginBottom: 20,
          }}
        >
          <Toggle
            id="apex-alert"
            label={t('notifications.instructorComments')}
            description={t('notifications.instructorCommentsDesc')}
            checked={preferences?.apex_alert_enabled ?? true}
            onChange={(v) => void handleToggle('apex_alert_enabled', v)}
            disabled={loading || permission === 'unsupported' || permission === 'denied'}
          />
          <Toggle
            id="conflict-alert"
            label={t('notifications.conflictResolution')}
            description={t('notifications.conflictResolutionDesc')}
            checked={preferences?.conflict_alert_enabled ?? true}
            onChange={(v) => void handleToggle('conflict_alert_enabled', v)}
            disabled={loading || permission === 'unsupported' || permission === 'denied'}
          />
        </div>

        {/* Privacy notice */}
        <div
          style={{
            background: DS.surface,
            border: `1px solid ${DS.border}`,
            borderRadius: 12,
            padding: '12px 14px',
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: DS.textSec,
              lineHeight: 1.7,
              textAlign: 'center',
              fontStyle: 'italic',
            }}
          >
            {t('notifications.privacyNotice')}
          </div>
        </div>
      </div>
    </div>
  );
}
