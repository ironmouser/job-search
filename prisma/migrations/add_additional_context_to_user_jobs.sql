-- Migration: Add additional_context to user_jobs for job-specific candidate experience notes
ALTER TABLE user_jobs ADD COLUMN IF NOT EXISTS additional_context TEXT;
