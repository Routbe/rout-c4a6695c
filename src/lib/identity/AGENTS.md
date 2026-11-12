# Rules
- KYC: `identity_verifications` (db/81) stores a peppered HMAC `unique_human_id` (UNIQUE), is immutable for `rout_app` once verified, and its real name overrides `display_name` server-side; Didit is capped monthly in `didit_monthly_usage`. Why: one account per person, no fake names, bounded cost.
