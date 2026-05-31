/**
 * NotificationService factory — ADR-012
 *
 * Singleton pattern: the same NotificationService instance is returned
 * on every call within the same Vercel serverless function runtime.
 *
 * Uses:
 *   - getWhatsAppAdapter() for the hexagonal port (ADR-011)
 *   - createServiceClient() for push_preferences + user_profiles reads
 *     (service role required because these tables may have restrictive RLS)
 *
 * vi.resetModules() in tests clears the singleton between isolated test runs.
 */

import { NotificationService } from './NotificationService';
import { getWhatsAppAdapter } from '../whatsapp/factory';
import { createServiceClient } from '../supabaseClient';

let instance: NotificationService | null = null;

export function getNotificationService(): NotificationService {
  if (instance !== null) {
    return instance;
  }

  instance = new NotificationService(
    getWhatsAppAdapter(),
    createServiceClient(),
  );

  return instance;
}
