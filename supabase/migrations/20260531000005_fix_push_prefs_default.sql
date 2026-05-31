-- Migration: 20260531000005_fix_push_prefs_default.sql
-- Sprint 4 SEC4-03: Align daily_reminder_enabled SQL default with API buildDefaults()
--
-- Context: migration 20260531000002_push_preferences.sql set DEFAULT true, but
-- buildDefaults() in api/users/push-preferences/index.ts returns false.
-- On first INSERT the column default wins, producing an inconsistent row silently.
--
-- Fix: set the column default to false (data minimisation — LGPD Art. 6 §1 III).
-- buildDefaults() already returns false — no application code change needed.

ALTER TABLE push_preferences
  ALTER COLUMN daily_reminder_enabled SET DEFAULT false;

-- DOWN --
-- To roll back, restore the original (incorrect) default:
-- ALTER TABLE push_preferences
--   ALTER COLUMN daily_reminder_enabled SET DEFAULT true;
