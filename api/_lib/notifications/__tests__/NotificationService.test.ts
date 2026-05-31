/**
 * TDD RED phase — NotificationService unit tests
 *
 * ADR-012: NotificationService — dispatch() never propagates exceptions.
 * ADR-011: WhatsApp hexagonal port.
 * LGPD: whatsApp.sendMessage body must never contain clinical data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NotificationService } from '../NotificationService';
import { WhatsAppMockAdapter } from '../../whatsapp/WhatsAppMockAdapter';
import type { NotificationEvent } from '../NotificationEvent';

// ---------------------------------------------------------------------------
// Helpers to build a minimal Supabase mock
// ---------------------------------------------------------------------------

type MockQueryBuilder = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  lt: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

function makeQueryBuilder(resolveValue: unknown): MockQueryBuilder {
  const builder: MockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolveValue),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };
  return builder;
}

interface SupabaseMockOptions {
  rateLimitData?: unknown;
  rateLimitError?: unknown;
  prefsData?: unknown;
  prefsError?: unknown;
  profileData?: unknown;
  profileError?: unknown;
  insertError?: unknown;
}

function makeSupabaseMock(opts: SupabaseMockOptions = {}): SupabaseClient {
  const fromFn = vi.fn((table: string) => {
    if (table === 'notification_rate_limits') {
      // The NotificationService may call .insert() or .select()... on this table
      const builder: MockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: opts.rateLimitData ?? null,
          error: opts.rateLimitError ?? null,
        }),
        insert: vi.fn().mockResolvedValue({
          data: null,
          error: opts.insertError ?? null,
        }),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
      };
      return builder;
    }

    if (table === 'push_preferences') {
      return makeQueryBuilder({
        data: opts.prefsData ?? null,
        error: opts.prefsError ?? null,
      });
    }

    if (table === 'user_profiles') {
      return makeQueryBuilder({
        data: opts.profileData ?? null,
        error: opts.profileError ?? null,
      });
    }

    return makeQueryBuilder({ data: null, error: null });
  });

  return { from: fromFn } as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('NotificationService', () => {
  let mockAdapter: WhatsAppMockAdapter;

  beforeEach(() => {
    mockAdapter = new WhatsAppMockAdapter();
    mockAdapter.clearInbox();
  });

  // ─── dispatch() never propagates exceptions ─────────────────────────────

  describe('error isolation — dispatch() never propagates exceptions', () => {
    it('resolves without throwing when whatsApp.sendMessage rejects', async () => {
      const failingAdapter = {
        sendMessage: vi.fn().mockRejectedValue(new Error('Network failure')),
        isAvailable: vi.fn().mockReturnValue(true),
      };

      const supabase = makeSupabaseMock({
        prefsData: { fcm_token: null, whatsapp_enabled: true },
        profileData: { phone: '+5511999999999' },
      });

      const svc = new NotificationService(failingAdapter, supabase);

      const event: NotificationEvent = {
        type: 'new_observation',
        recipientId: 'user-001',
        entityId: 'obs-001',
        metadata: { studentName: 'Ana', date: '2026-01-01' },
      };

      await expect(svc.dispatch(event)).resolves.toBeUndefined();
    });

    it('resolves without throwing when Supabase push_preferences query fails', async () => {
      const supabase = makeSupabaseMock({
        prefsError: { message: 'DB error', code: '500' },
      });

      const svc = new NotificationService(mockAdapter, supabase);
      const event: NotificationEvent = {
        type: 'link_request',
        recipientId: 'user-002',
        entityId: 'link-001',
        metadata: { studentName: 'Bia' },
      };

      await expect(svc.dispatch(event)).resolves.toBeUndefined();
    });

    it('resolves without throwing when Supabase user_profiles query fails', async () => {
      const supabase = makeSupabaseMock({
        prefsData: { fcm_token: null, whatsapp_enabled: true },
        profileError: { message: 'Not found', code: '404' },
      });

      const svc = new NotificationService(mockAdapter, supabase);
      const event: NotificationEvent = {
        type: 'conflict_detected',
        recipientId: 'user-003',
        entityId: 'obs-003',
        metadata: { studentName: 'Carla', date: '2026-02-01' },
      };

      await expect(svc.dispatch(event)).resolves.toBeUndefined();
    });
  });

  // ─── Rate limit ──────────────────────────────────────────────────────────

  describe('rate limit', () => {
    it('skips dispatch when dedup_key already exists in notification_rate_limits', async () => {
      // Simulate rate limit record found — "already sent within 60 min"
      const supabase = makeSupabaseMock({
        rateLimitData: { id: 'rl-001', dedup_key: 'new_observation:obs-001', channel: 'whatsapp' },
        prefsData: { fcm_token: null, whatsapp_enabled: true },
        profileData: { phone: '+5511999999999' },
      });

      const svc = new NotificationService(mockAdapter, supabase);

      const event: NotificationEvent = {
        type: 'new_observation',
        recipientId: 'user-001',
        entityId: 'obs-001',
        metadata: { studentName: 'Ana', date: '2026-01-01' },
      };

      await svc.dispatch(event);

      // whatsApp.sendMessage must NOT have been called
      expect(mockAdapter.getInbox()).toHaveLength(0);
    });

    it('does NOT skip dispatch when dedup_key is absent from rate limits', async () => {
      // No rate limit record found
      const supabase = makeSupabaseMock({
        rateLimitData: null,
        prefsData: { fcm_token: null, whatsapp_enabled: true },
        profileData: { phone: '+5511999999999' },
      });

      const svc = new NotificationService(mockAdapter, supabase);

      const event: NotificationEvent = {
        type: 'new_observation',
        recipientId: 'user-001',
        entityId: 'obs-002',
        metadata: { studentName: 'Ana', date: '2026-01-02' },
      };

      await svc.dispatch(event);

      expect(mockAdapter.getInbox()).toHaveLength(1);
    });
  });

  // ─── WhatsApp gating ─────────────────────────────────────────────────────

  describe('WhatsApp gating', () => {
    it('does NOT call sendMessage when whatsapp_enabled is false', async () => {
      const supabase = makeSupabaseMock({
        rateLimitData: null,
        prefsData: { fcm_token: null, whatsapp_enabled: false },
        profileData: { phone: '+5511999999999' },
      });

      const svc = new NotificationService(mockAdapter, supabase);

      const event: NotificationEvent = {
        type: 'new_observation',
        recipientId: 'user-001',
        entityId: 'obs-003',
        metadata: { studentName: 'Ana', date: '2026-01-03' },
      };

      await svc.dispatch(event);
      expect(mockAdapter.getInbox()).toHaveLength(0);
    });

    it('does NOT call sendMessage when push_preferences is null (defaults to disabled)', async () => {
      const supabase = makeSupabaseMock({
        rateLimitData: null,
        prefsData: null, // no preferences row
        profileData: { phone: '+5511999999999' },
      });

      const svc = new NotificationService(mockAdapter, supabase);

      const event: NotificationEvent = {
        type: 'link_request',
        recipientId: 'user-001',
        entityId: 'link-002',
        metadata: { studentName: 'Bia' },
      };

      await svc.dispatch(event);
      expect(mockAdapter.getInbox()).toHaveLength(0);
    });

    it('does NOT call sendMessage when phone is null', async () => {
      const supabase = makeSupabaseMock({
        rateLimitData: null,
        prefsData: { fcm_token: null, whatsapp_enabled: true },
        profileData: { phone: null }, // no phone
      });

      const svc = new NotificationService(mockAdapter, supabase);

      const event: NotificationEvent = {
        type: 'new_observation',
        recipientId: 'user-001',
        entityId: 'obs-004',
        metadata: { studentName: 'Carla', date: '2026-01-04' },
      };

      await svc.dispatch(event);
      expect(mockAdapter.getInbox()).toHaveLength(0);
    });

    it('calls sendMessage with the correct phone number when whatsapp_enabled is true', async () => {
      const phone = '+5511987654321';
      const supabase = makeSupabaseMock({
        rateLimitData: null,
        prefsData: { fcm_token: null, whatsapp_enabled: true },
        profileData: { phone },
      });

      const svc = new NotificationService(mockAdapter, supabase);

      const event: NotificationEvent = {
        type: 'new_observation',
        recipientId: 'user-001',
        entityId: 'obs-005',
        metadata: { studentName: 'Dana', date: '2026-01-05' },
      };

      await svc.dispatch(event);

      const inbox = mockAdapter.getInbox();
      expect(inbox).toHaveLength(1);
      expect(inbox[0].to).toBe(phone);
    });
  });

  // ─── SEC4-01: FCM token must never appear in log output (LGPD) ──────────

  describe('LGPD — fcm_token must never be materialised in logs (SEC4-01)', () => {
    it('does NOT log the raw fcm_token value when FCM token is present', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      const TOKEN = 'super-secret-fcm-token-abc123';

      const supabase = makeSupabaseMock({
        rateLimitData: null,
        prefsData: { fcm_token: TOKEN, whatsapp_enabled: false },
        profileData: { phone: null },
      });

      const svc = new NotificationService(mockAdapter, supabase);

      const event: NotificationEvent = {
        type: 'new_observation',
        recipientId: 'user-001',
        entityId: 'obs-fcm-01',
        metadata: { studentName: 'Sec', date: '2026-01-10' },
      };

      await svc.dispatch(event);

      // Every console.log call must NOT contain the raw token value
      for (const call of consoleSpy.mock.calls) {
        const serialized = call.map((arg) => JSON.stringify(arg)).join(' ');
        expect(serialized).not.toContain(TOKEN);
      }

      consoleSpy.mockRestore();
    });

    it('logs "token present" phrase (not the token value) when FCM token exists', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      const TOKEN = 'another-secret-token-xyz789';

      const supabase = makeSupabaseMock({
        rateLimitData: null,
        prefsData: { fcm_token: TOKEN, whatsapp_enabled: false },
        profileData: { phone: null },
      });

      const svc = new NotificationService(mockAdapter, supabase);

      const event: NotificationEvent = {
        type: 'link_request',
        recipientId: 'user-002',
        entityId: 'link-fcm-01',
        metadata: { studentName: 'Sec2' },
      };

      await svc.dispatch(event);

      const allLogOutput = consoleSpy.mock.calls
        .map((call) => call.map((arg) => String(arg)).join(' '))
        .join('\n');

      expect(allLogOutput).toContain('token present');

      consoleSpy.mockRestore();
    });
  });

  // ─── Body must not contain clinical data ─────────────────────────────────

  describe('LGPD — body must not contain clinical data', () => {
    const FORBIDDEN_TERMS = [
      'fértil', 'fertil', 'infértil', 'infertil',
      'seguro', 'inseguro', 'stamp', 'muco', 'sangramento',
    ];

    it('sends body without any forbidden clinical terms', async () => {
      const phone = '+5511999999999';
      const supabase = makeSupabaseMock({
        rateLimitData: null,
        prefsData: { fcm_token: null, whatsapp_enabled: true },
        profileData: { phone },
      });

      const svc = new NotificationService(mockAdapter, supabase);

      const event: NotificationEvent = {
        type: 'new_observation',
        recipientId: 'user-001',
        entityId: 'obs-006',
        metadata: { studentName: 'Eva', date: '2026-01-06' },
      };

      await svc.dispatch(event);

      const inbox = mockAdapter.getInbox();
      expect(inbox).toHaveLength(1);

      const bodyLower = inbox[0].body.toLowerCase();
      for (const term of FORBIDDEN_TERMS) {
        expect(bodyLower).not.toContain(term);
      }
    });
  });

  // ─── Rate limit registration ──────────────────────────────────────────────

  describe('rate limit registration', () => {
    it('inserts a record into notification_rate_limits after successful whatsapp send', async () => {
      const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
      const selectSingleMock = vi.fn().mockResolvedValue({ data: null, error: null });

      const fromFn = vi.fn((table: string) => {
        if (table === 'notification_rate_limits') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lt: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: selectSingleMock,
            insert: insertMock,
          };
        }
        if (table === 'push_preferences') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { fcm_token: null, whatsapp_enabled: true },
              error: null,
            }),
          };
        }
        if (table === 'user_profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { phone: '+5511999999999' },
              error: null,
            }),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }) };
      });

      const supabase = { from: fromFn } as unknown as SupabaseClient;
      const svc = new NotificationService(mockAdapter, supabase);

      const event: NotificationEvent = {
        type: 'new_observation',
        recipientId: 'user-001',
        entityId: 'obs-007',
        metadata: { studentName: 'Fiona', date: '2026-01-07' },
      };

      await svc.dispatch(event);

      expect(insertMock).toHaveBeenCalledOnce();
      const insertArg = insertMock.mock.calls[0][0] as Record<string, unknown>;
      expect(insertArg).toMatchObject({
        dedup_key: 'new_observation:obs-007',
        channel: 'whatsapp',
        recipient_id: 'user-001',
      });
    });

    it('does NOT insert into notification_rate_limits when whatsapp is disabled', async () => {
      const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
      const fromFn = vi.fn((table: string) => {
        if (table === 'notification_rate_limits') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lt: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: insertMock,
          };
        }
        if (table === 'push_preferences') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { fcm_token: null, whatsapp_enabled: false },
              error: null,
            }),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }) };
      });

      const supabase = { from: fromFn } as unknown as SupabaseClient;
      const svc = new NotificationService(mockAdapter, supabase);

      const event: NotificationEvent = {
        type: 'new_observation',
        recipientId: 'user-001',
        entityId: 'obs-008',
        metadata: { studentName: 'Gabi', date: '2026-01-08' },
      };

      await svc.dispatch(event);
      expect(insertMock).not.toHaveBeenCalled();
    });
  });
});
