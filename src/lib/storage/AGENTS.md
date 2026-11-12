# Rules
- Temporary QR files are private objects with `expires_at` in `shared_files` (db/51), served only via `/f/<id>` presigned redirects and purged by cron. Why: shared links must expire.
