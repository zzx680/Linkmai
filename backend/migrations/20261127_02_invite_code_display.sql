-- Migration date: 2026-11-27
-- Keep the invite code itself next to its hash so the operator console can
-- show a code after it has been created. Codes are still looked up by hash at
-- redemption time; the plain column is display-only.
--
-- Codes created before this migration have no stored value and stay hidden
-- ("不可回显") in the console — there is nothing to recover from a hash.
--
-- Service-role only, same as the rest of the table: no anon or authenticated
-- grants are added here.

alter table public.invite_codes
  add column if not exists code text;
