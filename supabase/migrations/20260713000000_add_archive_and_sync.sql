-- Add is_archived column to jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE NOT NULL;

-- Create sync_logs table to track email sync timestamps
CREATE TABLE IF NOT EXISTS sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sync_type TEXT NOT NULL, -- e.g., 'email'
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Insert initial record for email sync if it doesn't exist
INSERT INTO sync_logs (sync_type, last_synced_at)
SELECT 'email', timezone('utc'::text, now() - INTERVAL '2 days')
WHERE NOT EXISTS (SELECT 1 FROM sync_logs WHERE sync_type = 'email');
