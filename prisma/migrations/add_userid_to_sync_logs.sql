-- Migration: Add userId to sync_logs so each user has their own email sync cursor
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Drop the old implicit uniqueness (if any constraint existed) and add per-user uniqueness
-- We use a partial unique index so NULL user_id rows still work for legacy global syncs
CREATE UNIQUE INDEX IF NOT EXISTS sync_logs_user_id_sync_type_key
  ON sync_logs (user_id, sync_type)
  WHERE user_id IS NOT NULL;
