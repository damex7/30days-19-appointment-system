-- 006: from Day 17's "user / admin" to a studio's three kinds of account.
--
-- Migrations 001-005 are Day 17's auth tables, copied unchanged. Applied
-- migrations are history, so the changes for this app go in a NEW file
-- rather than edits to the old ones: a database that already ran 001-005
-- ends up exactly like a fresh one.

-- ROLES
--   client  : anyone who signs up. Books, reschedules and cancels their OWN bookings.
--   stylist : created by an admin only. Sees their OWN schedule and time off.
--   admin   : runs the studio. Sees and changes everything.
-- Sign-up always creates a client (the column default AND the INSERT in
-- lib/users.ts say so), so nobody can sign themselves up as staff by
-- adding role=admin to the form.
--
-- Drop the old CHECK first, move existing rows over, then add the new
-- CHECK, so no row is ever invalid. (users_role_check is the name
-- PostgreSQL gave the inline CHECK in 001.)
ALTER TABLE users DROP CONSTRAINT users_role_check;
UPDATE users SET role = 'client' WHERE role = 'user';
ALTER TABLE users
  ALTER COLUMN role SET DEFAULT 'client',
  ADD CONSTRAINT users_role_check CHECK (role IN ('client', 'stylist', 'admin'));

ALTER TABLE users
  -- A Nigerian mobile number in +234 form (lib/phone.ts normalises it).
  -- Optional at sign-up; it lets the studio call or WhatsApp a client who
  -- is running late. NULL means "not given". The CHECK keeps the stored
  -- form uniform, so a search for the number finds it.
  ADD COLUMN phone text NULL CHECK (phone ~ '^\+234[0-9]{10}$'),

  -- Set when an admin creates a stylist with a temporary password. Until
  -- the stylist picks their own, every page sends them to
  -- /account/password (lib/auth/dal.ts): the admin saw the temporary
  -- password, so it must not stay in use.
  ADD COLUMN must_change_password boolean NOT NULL DEFAULT false,

  -- DEACTIVATED, not deleted. Bookings point at their client and stylist
  -- with ON DELETE RESTRICT, because the studio's history (who had which
  -- appointment, who cancelled) must survive someone leaving. A
  -- deactivated user's sessions are deleted in the same statement,
  -- readSession ignores them and login refuses them. A timestamp rather
  -- than a boolean also records WHEN.
  ADD COLUMN deactivated_at timestamptz NULL;

-- New audit event types for admin-created accounts and (de)activation.
-- The old types stay in the list, so existing rows remain valid.
ALTER TABLE auth_events DROP CONSTRAINT auth_events_type_check;
ALTER TABLE auth_events ADD CONSTRAINT auth_events_type_check CHECK (type IN (
  'signed_up', 'email_verified', 'logged_in', 'login_failed', 'logged_out',
  'password_changed', 'password_reset_requested', 'password_reset',
  'session_revoked', 'role_changed', 'profile_updated', 'account_deleted',
  'user_created', 'user_deactivated', 'user_reactivated'
));
