-- Run this in the Supabase SQL Editor if the Activity Log page shows an error.
-- The activity_log table is written to by DB triggers (not the app user),
-- so RLS must be disabled for the app to read it.

ALTER TABLE activity_log DISABLE ROW LEVEL SECURITY;
