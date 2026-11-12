-- 77 — Echte 2FA (TOTP) en passkeys (WebAuthn) voor Better Auth in neon_auth.
alter table neon_auth."user" add column if not exists "twoFactorEnabled" boolean default false;

create table if not exists neon_auth."twoFactor" (
  id                        text primary key,
  secret                    text not null,
  "backupCodes"             text not null,
  "userId"                  text not null,
  verified                  boolean default true,
  "failedVerificationCount" integer default 0,
  "lockedUntil"             timestamptz
);
create index if not exists two_factor_user_idx on neon_auth."twoFactor" ("userId");
create index if not exists two_factor_secret_idx on neon_auth."twoFactor" (secret);

create table if not exists neon_auth.passkey (
  id             text primary key,
  name           text,
  "publicKey"    text not null,
  "userId"       text not null,
  "credentialID" text not null,
  counter        integer not null,
  "deviceType"   text not null,
  "backedUp"     boolean not null,
  transports     text,
  "createdAt"    timestamptz default now(),
  aaguid         text
);
create index if not exists passkey_user_idx on neon_auth.passkey ("userId");
create index if not exists passkey_credential_idx on neon_auth.passkey ("credentialID");

grant select, insert, update, delete on neon_auth."twoFactor", neon_auth.passkey to rout_app;
