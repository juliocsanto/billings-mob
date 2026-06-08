/**
 * NotificationService — ADR-012
 *
 * Orchestrates notification dispatch for all domain events.
 * Supports WhatsApp (via hexagonal WhatsAppPort) and logs FCM sends
 * until Sprint 4 S4-07 (real FCM integration).
 *
 * Design invariants:
 * 1. dispatch() NEVER throws — errors are caught and logged. Notification
 *    failures must never interrupt clinical operations.
 * 2. Rate limiting via notification_rate_limits prevents duplicate sends.
 * 3. buildPayload() is the ONLY function that constructs text — no inline
 *    message construction is allowed in this service.
 * 4. No clinical data (stamp, mucus, bleeding, relations, notes) ever flows
 *    through this service — enforced by NotificationEvent type.
 *
 * ADR-011: WhatsApp hexagonal port
 * ADR-012: NotificationService design
 * LGPD: notification bodies are strictly non-clinical
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { WhatsAppPort } from '../whatsapp/WhatsAppPort';
import type { EmailPort } from '../email/EmailPort';
import type { NotificationEvent } from './NotificationEvent';
import { buildPayload, buildWhatsAppTemplate } from './buildPayload';
import {
  feedbackPendingAdminHtml,
  feedbackPendingAdminText,
} from '../email/templates/feedbackPendingAdmin';
import {
  feedbackFinalApprovedHtml,
  feedbackFinalApprovedText,
} from '../email/templates/feedbackFinalApproved';

/** How long a sent notification is deduplicated (milliseconds). */
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 60 minutes

interface PushPreferences {
  fcm_token: string | null;
  whatsapp_enabled: boolean;
}

interface UserProfile {
  phone: string | null;
}

export class NotificationService {
  constructor(
    private readonly whatsApp: WhatsAppPort,
    private readonly supabase: SupabaseClient,
    private readonly email?: EmailPort,
  ) {}

  /**
   * Returns admin contact from environment variables.
   * ADMIN_EMAIL and ADMIN_PHONE_E164 are set via Vercel env vars.
   */
  private getAdminContact(): { email: string | null; phone: string | null } {
    return {
      email: process.env['ADMIN_EMAIL'] ?? null,
      phone: process.env['ADMIN_PHONE_E164'] ?? null,
    };
  }

  /**
   * Dispatches a notification for the given event.
   *
   * Safe to call from any HTTP handler — never propagates exceptions.
   */
  async dispatch(event: NotificationEvent): Promise<void> {
    try {
      await this._dispatchInternal(event);
    } catch (err) {
      // Notification failures must NEVER interrupt clinical operations
      console.error('[NotificationService] dispatch error', {
        type: event.type,
        recipientId: event.recipientId,
        entityId: event.entityId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async _dispatchInternal(event: NotificationEvent): Promise<void> {
    // 1. Build deduplification key and check rate limit
    const dedupKey = `${event.type}:${event.entityId}`;
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

    const { data: existingLimit } = await this.supabase
      .from('notification_rate_limits')
      .select('id')
      .eq('dedup_key', dedupKey)
      .eq('channel', 'whatsapp')
      .eq('recipient_id', event.recipientId)
      .gte('sent_at', windowStart)
      .limit(1)
      .single();

    if (existingLimit !== null) {
      // Already sent within the rate-limit window — skip silently
      return;
    }

    // 2. Fetch recipient's push preferences (default: whatsapp_enabled=false)
    const { data: prefs, error: prefsError } = await this.supabase
      .from('push_preferences')
      .select('fcm_token, whatsapp_enabled')
      .eq('user_id', event.recipientId)
      .single();

    if (prefsError && prefsError.code !== 'PGRST116') {
      // PGRST116 = "no rows returned" — treat as default preferences
      console.error('[NotificationService] push_preferences fetch error', {
        recipientId: event.recipientId,
        error: prefsError.message,
      });
      return;
    }

    const preferences: PushPreferences = prefs ?? {
      fcm_token: null,
      whatsapp_enabled: false,
    };

    // 3. Build the notification text (single source of truth — no inline text)
    const payload = buildPayload(event);

    // 4. FCM log (real send is S4-07)
    // SEC4-01: fcm_token is LGPD personal data — NEVER materialise the value in logs.
    if (preferences.fcm_token) {
      console.warn(
        `[NotificationService] FCM queued — title: ${payload.title} (token present)`,
      );
    }

    // 5. WhatsApp send (only if enabled and phone is available)
    if (preferences.whatsapp_enabled) {
      const { data: profile, error: profileError } = await this.supabase
        .from('user_profiles')
        .select('phone')
        .eq('id', event.recipientId)
        .single();

      if (profileError) {
        console.error('[NotificationService] user_profiles fetch error', {
          recipientId: event.recipientId,
          error: profileError.message,
        });
        return;
      }

      const userProfile = profile as UserProfile | null;

      if (!userProfile?.phone) {
        // No phone registered — cannot send WhatsApp
        return;
      }

      const template = buildWhatsAppTemplate(event);
      const result = await this.whatsApp.sendMessage({
        to: userProfile.phone,
        body: payload.body,
        ...(template ?? {}),
      });

      if (!result.success) {
        console.error('[NotificationService] WhatsApp send failed', {
          recipientId: event.recipientId,
          error: result.error,
        });
        return;
      }

      // 6. Register successful send in rate_limits table
      await this.supabase.from('notification_rate_limits').insert({
        dedup_key: dedupKey,
        channel: 'whatsapp',
        recipient_id: event.recipientId,
        sent_at: new Date().toISOString(),
      });
    }

    // ── Email dispatch for feedback events (ADR-018) ──────────────────────
    // Feedback events bypass the push_preferences check — email is sent to
    // admin contact (env vars) or directly to the feedback author's email.
    // Email is fire-and-forget within the dispatch call.
    if (this.email) {
      await this._dispatchEmailForFeedbackEvent(event);
    }
  }

  /**
   * Dispatches email notifications for feedback pipeline events (ADR-018).
   * Called only when this.email adapter is available.
   * Never throws — errors are caught and logged.
   */
  private async _dispatchEmailForFeedbackEvent(event: NotificationEvent): Promise<void> {
    if (!this.email) return;

    const adminContact = this.getAdminContact();

    try {
      if (event.type === 'feedback_triaged' && adminContact.email) {
        const html = feedbackPendingAdminHtml({
          feedbackId: event.entityId,
          feedbackTitle: event.metadata.feedbackTitle ?? 'Feedback sem título',
          category: '',
          authorRole: '',
          triageType: '',
          triageImpact: event.metadata.triageImpact ?? 'desconhecido',
          triageSummary: event.metadata.triageSummary ?? '',
          triageRoadmap: '',
          triageAgents: '',
          triageSkills: '',
          triageCosts: '',
          adminPanelUrl: event.metadata.adminPanelUrl ?? '',
        });
        const text = feedbackPendingAdminText({
          feedbackId: event.entityId,
          feedbackTitle: event.metadata.feedbackTitle ?? 'Feedback sem título',
          category: '',
          authorRole: '',
          triageType: '',
          triageImpact: event.metadata.triageImpact ?? 'desconhecido',
          triageSummary: event.metadata.triageSummary ?? '',
          triageRoadmap: '',
          triageAgents: '',
          triageSkills: '',
          triageCosts: '',
          adminPanelUrl: event.metadata.adminPanelUrl ?? '',
        });

        await this.email.sendEmail({
          to: adminContact.email,
          subject: `[Billings] Feedback para revisão — ${event.metadata.feedbackTitle ?? event.entityId}`,
          html,
          text,
        });
      } else if (event.type === 'user_feedback_implemented') {
        // Send to the feedback author — recipientId resolves their email via user_profiles
        const { data: profile } = await this.supabase
          .from('user_profiles')
          .select('email, full_name')
          .eq('id', event.recipientId)
          .single();

        const authorEmail = (profile as { email?: string; full_name?: string } | null)?.email;
        const authorName = (profile as { email?: string; full_name?: string } | null)?.full_name
          ?? event.metadata.userName
          ?? 'usuário';

        if (authorEmail) {
          const discountPercent = event.metadata.discountPercent ?? 50;
          const html = feedbackFinalApprovedHtml({
            userName: authorName,
            feedbackTitle: event.metadata.feedbackTitle ?? '',
            discountPercent,
          });
          const text = feedbackFinalApprovedText({
            userName: authorName,
            feedbackTitle: event.metadata.feedbackTitle ?? '',
            discountPercent,
          });

          await this.email.sendEmail({
            to: authorEmail,
            subject: 'Sua sugestão foi implementada — Billings Grafico',
            html,
            text,
          });
        }
      }
    } catch (emailErr) {
      // Email failures must never interrupt the notification pipeline
      console.error('[NotificationService] email dispatch error', {
        type: event.type,
        entityId: event.entityId,
        error: emailErr instanceof Error ? emailErr.message : String(emailErr),
      });
    }
  }
}
