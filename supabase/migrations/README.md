# Supabase migrations

This project was originally created without a checked-in Supabase migration history. The live policy change documented here replaces the permissive account and budget policies with authenticated, owner-scoped policies.

The SQL is documented in `secure_financial_data_rls.sql` so future local Supabase setup can reproduce the live security policy.
