-- 0152: fixed cross-account capability; apply only after 0150/0151 and review.
-- Passkey/HMAC session verification remains in the authenticated server handler.
-- No interactive calls or caller-supplied SQL; errors abort the entire invocation.
create role rout_merge_executor nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant usage on schema public, neon_auth to rout_merge_executor;
grant select on public."identity_verifications" to rout_merge_executor;
create policy atomic_merge_executor on public."identity_verifications" for select to rout_merge_executor using (true);
grant select on public."verified_identities" to rout_merge_executor;
create policy atomic_merge_executor on public."verified_identities" for select to rout_merge_executor using (true);
grant select on public."identity_links" to rout_merge_executor;
create policy atomic_merge_executor on public."identity_links" for select to rout_merge_executor using (true);
grant select on public."wallets" to rout_merge_executor;
create policy atomic_merge_executor on public."wallets" for select to rout_merge_executor using (true);
grant select on public."wallet_transactions" to rout_merge_executor;
create policy atomic_merge_executor on public."wallet_transactions" for select to rout_merge_executor using (true);
grant select on public."psp_credentials" to rout_merge_executor;
create policy atomic_merge_executor on public."psp_credentials" for select to rout_merge_executor using (true);
grant select on public."verification_payments" to rout_merge_executor;
create policy atomic_merge_executor on public."verification_payments" for select to rout_merge_executor using (true);
grant select on public."business_verifications" to rout_merge_executor;
create policy atomic_merge_executor on public."business_verifications" for select to rout_merge_executor using (true);
grant select on public."account_deletions" to rout_merge_executor;
create policy atomic_merge_executor on public."account_deletions" for select to rout_merge_executor using (true);
grant select on public."sepa_review_queue" to rout_merge_executor;
create policy atomic_merge_executor on public."sepa_review_queue" for select to rout_merge_executor using (true);


grant select on public."user_ledger_keys" to rout_merge_executor;
create policy atomic_merge_executor on public."user_ledger_keys" for select to rout_merge_executor using (true);
grant select on public."user_encrypted_audit_logs" to rout_merge_executor;
create policy atomic_merge_executor on public."user_encrypted_audit_logs" for select to rout_merge_executor using (true);
grant select on public."account_email_changes" to rout_merge_executor;
create policy atomic_merge_executor on public."account_email_changes" for select to rout_merge_executor using (true);
grant select, delete on public."user_sessions" to rout_merge_executor;
create policy atomic_merge_executor on public."user_sessions" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."security_codes" to rout_merge_executor;
create policy atomic_merge_executor on public."security_codes" to rout_merge_executor using (true) with check (true);
grant select, delete on public."oauth_auth_codes" to rout_merge_executor;
create policy atomic_merge_executor on public."oauth_auth_codes" to rout_merge_executor using (true) with check (true);
grant select, delete on public."oauth_step_up_codes" to rout_merge_executor;
create policy atomic_merge_executor on public."oauth_step_up_codes" to rout_merge_executor using (true) with check (true);
grant select, delete on public."oauth_step_up_challenges" to rout_merge_executor;
create policy atomic_merge_executor on public."oauth_step_up_challenges" to rout_merge_executor using (true) with check (true);
grant select, delete on public."oauth_access_tokens" to rout_merge_executor;
create policy atomic_merge_executor on public."oauth_access_tokens" to rout_merge_executor using (true) with check (true);
grant select, delete on public."oauth_refresh_tokens" to rout_merge_executor;
create policy atomic_merge_executor on public."oauth_refresh_tokens" to rout_merge_executor using (true) with check (true);
grant select, delete on public."phone_otp_codes" to rout_merge_executor;
create policy atomic_merge_executor on public."phone_otp_codes" to rout_merge_executor using (true) with check (true);
grant select, delete on public."auth_tokens" to rout_merge_executor;
create policy atomic_merge_executor on public."auth_tokens" to rout_merge_executor using (true) with check (true);
grant select, delete on public."profile_drafts" to rout_merge_executor;
create policy atomic_merge_executor on public."profile_drafts" to rout_merge_executor using (true) with check (true);
grant select, delete on public."identity_verification_sessions" to rout_merge_executor;
create policy atomic_merge_executor on public."identity_verification_sessions" to rout_merge_executor using (true) with check (true);
grant select, delete on public."forwarding_confirmation_sends" to rout_merge_executor;
create policy atomic_merge_executor on public."forwarding_confirmation_sends" to rout_merge_executor using (true) with check (true);
grant select, delete on public."availability_cache" to rout_merge_executor;
create policy atomic_merge_executor on public."availability_cache" to rout_merge_executor using (true) with check (true);
grant select, delete on public."availability_jobs" to rout_merge_executor;
create policy atomic_merge_executor on public."availability_jobs" to rout_merge_executor using (true) with check (true);
grant select, delete on public."alias_sync_jobs" to rout_merge_executor;
create policy atomic_merge_executor on public."alias_sync_jobs" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."alias_profiles" to rout_merge_executor;
create policy atomic_merge_executor on public."alias_profiles" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."ambient_weather_locations" to rout_merge_executor;
create policy atomic_merge_executor on public."ambient_weather_locations" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."nfc_waitlist" to rout_merge_executor;
create policy atomic_merge_executor on public."nfc_waitlist" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."pro_waitlist" to rout_merge_executor;
create policy atomic_merge_executor on public."pro_waitlist" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."profile_ingest_tokens" to rout_merge_executor;
create policy atomic_merge_executor on public."profile_ingest_tokens" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."tip_settings" to rout_merge_executor;
create policy atomic_merge_executor on public."tip_settings" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."user_birthdates" to rout_merge_executor;
create policy atomic_merge_executor on public."user_birthdates" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."user_calendar_feeds" to rout_merge_executor;
create policy atomic_merge_executor on public."user_calendar_feeds" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."user_custom_presence" to rout_merge_executor;
create policy atomic_merge_executor on public."user_custom_presence" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."user_music_status" to rout_merge_executor;
create policy atomic_merge_executor on public."user_music_status" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."user_phone_numbers" to rout_merge_executor;
create policy atomic_merge_executor on public."user_phone_numbers" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."user_snapchat" to rout_merge_executor;
create policy atomic_merge_executor on public."user_snapchat" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."admin_permissions" to rout_merge_executor;
create policy atomic_merge_executor on public."admin_permissions" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."app_email_assignments" to rout_merge_executor;
create policy atomic_merge_executor on public."app_email_assignments" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."approved_handles" to rout_merge_executor;
create policy atomic_merge_executor on public."approved_handles" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."badge_claim_redemptions" to rout_merge_executor;
create policy atomic_merge_executor on public."badge_claim_redemptions" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."booking_event_type_hosts" to rout_merge_executor;
create policy atomic_merge_executor on public."booking_event_type_hosts" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."booking_event_types" to rout_merge_executor;
create policy atomic_merge_executor on public."booking_event_types" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."bunq_oauth_tokens" to rout_merge_executor;
create policy atomic_merge_executor on public."bunq_oauth_tokens" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."oauth_consents" to rout_merge_executor;
create policy atomic_merge_executor on public."oauth_consents" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."oauth_email_forwarding_rules" to rout_merge_executor;
create policy atomic_merge_executor on public."oauth_email_forwarding_rules" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."reserved_brand_releases" to rout_merge_executor;
create policy atomic_merge_executor on public."reserved_brand_releases" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."social_follow_links" to rout_merge_executor;
create policy atomic_merge_executor on public."social_follow_links" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."user_badges" to rout_merge_executor;
create policy atomic_merge_executor on public."user_badges" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."user_custom_badges" to rout_merge_executor;
create policy atomic_merge_executor on public."user_custom_badges" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."user_feature_blocks" to rout_merge_executor;
create policy atomic_merge_executor on public."user_feature_blocks" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."user_integration_links" to rout_merge_executor;
create policy atomic_merge_executor on public."user_integration_links" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."user_integrations" to rout_merge_executor;
create policy atomic_merge_executor on public."user_integrations" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."user_presence_connections" to rout_merge_executor;
create policy atomic_merge_executor on public."user_presence_connections" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."user_roles" to rout_merge_executor;
create policy atomic_merge_executor on public."user_roles" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."workspace_members" to rout_merge_executor;
create policy atomic_merge_executor on public."workspace_members" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."social_links" to rout_merge_executor;
create policy atomic_merge_executor on public."social_links" to rout_merge_executor using (true) with check (true);
grant select, update, delete on public."social_block_settings" to rout_merge_executor;
create policy atomic_merge_executor on public."social_block_settings" to rout_merge_executor using (true) with check (true);
grant select, update on public."analytics_events" to rout_merge_executor;
create policy atomic_merge_executor on public."analytics_events" to rout_merge_executor using (true) with check (true);
grant select, update on public."booking_requests" to rout_merge_executor;
create policy atomic_merge_executor on public."booking_requests" to rout_merge_executor using (true) with check (true);
grant select, update on public."links" to rout_merge_executor;
create policy atomic_merge_executor on public."links" to rout_merge_executor using (true) with check (true);
grant select, update on public."api_keys" to rout_merge_executor;
create policy atomic_merge_executor on public."api_keys" to rout_merge_executor using (true) with check (true);
grant select, update on public."avatar_objects" to rout_merge_executor;
create policy atomic_merge_executor on public."avatar_objects" to rout_merge_executor using (true) with check (true);
grant select, update on public."badge_events" to rout_merge_executor;
create policy atomic_merge_executor on public."badge_events" to rout_merge_executor using (true) with check (true);
grant select, update on public."community_reviews" to rout_merge_executor;
create policy atomic_merge_executor on public."community_reviews" to rout_merge_executor using (true) with check (true);
grant select, update on public."connected_calendars" to rout_merge_executor;
create policy atomic_merge_executor on public."connected_calendars" to rout_merge_executor using (true) with check (true);
grant select, update on public."custom_domains" to rout_merge_executor;
create policy atomic_merge_executor on public."custom_domains" to rout_merge_executor using (true) with check (true);
grant select, update on public."domain_claims" to rout_merge_executor;
create policy atomic_merge_executor on public."domain_claims" to rout_merge_executor using (true) with check (true);
grant select, update on public."email_aliases" to rout_merge_executor;
create policy atomic_merge_executor on public."email_aliases" to rout_merge_executor using (true) with check (true);
grant select, update on public."feedback_forms" to rout_merge_executor;
create policy atomic_merge_executor on public."feedback_forms" to rout_merge_executor using (true) with check (true);
grant select, update on public."gallery_objects" to rout_merge_executor;
create policy atomic_merge_executor on public."gallery_objects" to rout_merge_executor using (true) with check (true);
grant select on public."identity_disclosure_logs" to rout_merge_executor;
create policy atomic_merge_executor on public."identity_disclosure_logs" for select to rout_merge_executor using (true);
grant select, update on public."influencer_requests" to rout_merge_executor;
create policy atomic_merge_executor on public."influencer_requests" to rout_merge_executor using (true) with check (true);
grant select, update on public."invoice_deliveries" to rout_merge_executor;
create policy atomic_merge_executor on public."invoice_deliveries" to rout_merge_executor using (true) with check (true);
grant select, update on public."notifications" to rout_merge_executor;
create policy atomic_merge_executor on public."notifications" to rout_merge_executor using (true) with check (true);
grant select, update on public."oauth_email_deliveries" to rout_merge_executor;
create policy atomic_merge_executor on public."oauth_email_deliveries" to rout_merge_executor using (true) with check (true);
grant select, insert, update on public."profile_design_templates" to rout_merge_executor;
create policy atomic_merge_executor on public."profile_design_templates" to rout_merge_executor using (true) with check (true);
grant select, update on public."profile_events" to rout_merge_executor;
create policy atomic_merge_executor on public."profile_events" to rout_merge_executor using (true) with check (true);
grant select, update on public."public_activity" to rout_merge_executor;
create policy atomic_merge_executor on public."public_activity" to rout_merge_executor using (true) with check (true);
grant select, update on public."saved_qrs" to rout_merge_executor;
create policy atomic_merge_executor on public."saved_qrs" to rout_merge_executor using (true) with check (true);
grant select, insert, update on public."security_events" to rout_merge_executor;
create policy atomic_merge_executor on public."security_events" to rout_merge_executor using (true) with check (true);
grant select, update on public."shared_files" to rout_merge_executor;
create policy atomic_merge_executor on public."shared_files" to rout_merge_executor using (true) with check (true);
grant select, update on public."subdomain_root_claims" to rout_merge_executor;
create policy atomic_merge_executor on public."subdomain_root_claims" to rout_merge_executor using (true) with check (true);
grant select, update on public."tracked_qrs" to rout_merge_executor;
create policy atomic_merge_executor on public."tracked_qrs" to rout_merge_executor using (true) with check (true);
grant select, update on public."user_assets" to rout_merge_executor;
create policy atomic_merge_executor on public."user_assets" to rout_merge_executor using (true) with check (true);
grant select, update on public."user_identities" to rout_merge_executor;
create policy atomic_merge_executor on public."user_identities" to rout_merge_executor using (true) with check (true);
grant select, update on public."user_linked_accounts" to rout_merge_executor;
create policy atomic_merge_executor on public."user_linked_accounts" to rout_merge_executor using (true) with check (true);
grant select, update on public."availability_overrides" to rout_merge_executor;
create policy atomic_merge_executor on public."availability_overrides" to rout_merge_executor using (true) with check (true);
grant select, update on public."availability_rules" to rout_merge_executor;
create policy atomic_merge_executor on public."availability_rules" to rout_merge_executor using (true) with check (true);
grant select, insert, update, delete on public."users" to rout_merge_executor;
create policy atomic_merge_executor on public."users" to rout_merge_executor using (true) with check (true);
grant select, insert, update, delete on public."profiles" to rout_merge_executor;
create policy atomic_merge_executor on public."profiles" to rout_merge_executor using (true) with check (true);
grant select, insert, update, delete on public."account_merge_tickets" to rout_merge_executor;
create policy atomic_merge_executor on public."account_merge_tickets" to rout_merge_executor using (true) with check (true);
grant insert on public."merged_auth_account_archive" to rout_merge_executor;
create policy atomic_merge_executor on public."merged_auth_account_archive" to rout_merge_executor using (true) with check (true);
grant select, insert, update, delete on neon_auth."user" to rout_merge_executor;
grant select, insert, update, delete on neon_auth."account" to rout_merge_executor;
grant select, insert, update, delete on neon_auth."passkey" to rout_merge_executor;
grant select, insert, update, delete on neon_auth."session" to rout_merge_executor;
grant select, insert, update, delete on neon_auth."twoFactor" to rout_merge_executor;
grant execute on function public.rout_current_user_id() to rout_merge_executor;
grant execute on function public.rout_merge_assert(boolean,text) to rout_merge_executor;
create or replace function public.execute_account_merge(p_ticket_digest text, p_code_digest text, p_keep_handle text, p_keep_design text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $merge$
declare
 v_secondary uuid := public.rout_current_user_id();
 v_primary uuid;
 v_ticket public.account_merge_tickets%rowtype;
 v_code public.security_codes%rowtype;
 v_p public.profiles%rowtype;
 v_s public.profiles%rowtype;
 v_p_auth uuid;
 v_s_auth uuid;
 v_p_design jsonb;
 v_s_design jsonb;
 v_relays_archived integer := 0;
begin
 if (session_user <> 'rout_app' and current_setting('role',true) <> 'rout_app') or v_secondary is null then
   raise exception 'merge_caller_forbidden' using errcode='42501';
 end if;
 if p_keep_handle is null or p_keep_design is null or p_keep_handle not in ('primary','secondary') or p_keep_design not in ('primary','secondary') then
   raise exception 'invalid_merge_choice';
 end if;
 select * into v_ticket from public.account_merge_tickets
 where (pin_hash=p_ticket_digest or token_hash=p_ticket_digest) and used_at is null and expires_at>clock_timestamp()
 order by created_at desc limit 1;
 if not found or v_ticket.preview_user_id is distinct from v_secondary or v_ticket.primary_user_id=v_secondary then
   raise exception 'merge_ticket_not_claimable';
 end if;
 v_primary:=v_ticket.primary_user_id;
 -- Deterministic locking serializes overlapping/reversed merges.
 perform 1 from public.users where id in (v_primary,v_secondary) order by id for update;
 if (select count(*) from public.users where id in (v_primary,v_secondary) and not is_disabled and account_status='active')<>2 then
   raise exception 'merge_ticket_not_claimable';
 end if;
 perform 1 from public.profiles where id in (v_primary,v_secondary) order by id for update;
 select * into v_ticket from public.account_merge_tickets where id=v_ticket.id for update;
 if not found or v_ticket.used_at is not null or v_ticket.expires_at<=clock_timestamp() or v_ticket.preview_user_id is distinct from v_secondary then
   raise exception 'merge_ticket_not_claimable';
 end if;
 select * into v_code from public.security_codes where user_id=v_secondary and purpose='merge' and consumed_at is null
 order by created_at desc limit 1 for update;
 if not found or v_code.attempts>=5 or v_code.expires_at<=clock_timestamp() then
   return jsonb_build_object('ok',false,'reason','bad_code');
 end if;
 if v_code.code_hash is distinct from p_code_digest then
   update public.security_codes set attempts=attempts+1 where id=v_code.id;
   return jsonb_build_object('ok',false,'reason','bad_code');
 end if;
 select * into v_p from public.profiles where id=v_primary;
 if not found then raise exception 'merge_profile_missing'; end if;
 select * into v_s from public.profiles where id=v_secondary;
 if not found then raise exception 'merge_profile_missing'; end if;
 v_p_design:=jsonb_build_object('theme',v_p.theme,'card_style',v_p.card_style,'blocks',v_p.blocks,'display_prefs',v_p.display_prefs,'url_style',v_p.url_style,'bio',v_p.bio,'tagline',v_p.tagline,'avatar_url',v_p.avatar_url);
 v_s_design:=jsonb_build_object('theme',v_s.theme,'card_style',v_s.card_style,'blocks',v_s.blocks,'display_prefs',v_s.display_prefs,'url_style',v_s.url_style,'bio',v_s.bio,'tagline',v_s.tagline,'avatar_url',v_s.avatar_url);
 update public.account_merge_tickets set used_at=transaction_timestamp(),secondary_user_id=v_secondary where id=v_ticket.id;
 update public.security_codes set consumed_at=transaction_timestamp() where id=v_code.id;
 perform public.rout_merge_assert((not exists (select 1 from public."account_deletions" where "user_id" = v_secondary)), 'merge_blocked:account_deletions');
 perform public.rout_merge_assert((not exists (select 1 from public."account_email_changes" where "user_id" = v_secondary)), 'merge_blocked:account_email_changes');
 perform public.rout_merge_assert((not exists (select 1 from public."business_verifications" where "user_id" = v_secondary)), 'merge_blocked:business_verifications');
 perform public.rout_merge_assert((not exists (select 1 from public."identity_disclosure_logs" where "user_id" = v_secondary)), 'merge_blocked:identity_disclosure_logs');
 perform public.rout_merge_assert((not exists (select 1 from public."identity_links" where "user_id" = v_secondary)), 'merge_blocked:identity_links');
 perform public.rout_merge_assert((not exists (select 1 from public."identity_verifications" where "user_id" = v_secondary)), 'merge_blocked:identity_verifications');
 perform public.rout_merge_assert((not exists (select 1 from public."psp_credentials" where "user_id" = v_secondary)), 'merge_blocked:psp_credentials');
 perform public.rout_merge_assert((not exists (select 1 from public."sepa_review_queue" where "user_id" = v_secondary)), 'merge_blocked:sepa_review_queue');
 perform public.rout_merge_assert((not exists (select 1 from public."user_encrypted_audit_logs" where "user_id" = v_secondary)), 'merge_blocked:user_encrypted_audit_logs');
 perform public.rout_merge_assert((not exists (select 1 from public."user_ledger_keys" where "user_id" = v_secondary)), 'merge_blocked:user_ledger_keys');
 perform public.rout_merge_assert((not exists (select 1 from public."verification_payments" where "user_id" = v_secondary)), 'merge_blocked:verification_payments');
 perform public.rout_merge_assert((not exists (select 1 from public."verified_identities" where "user_id" = v_secondary)), 'merge_blocked:verified_identities');
 perform public.rout_merge_assert((not exists (select 1 from public."wallet_transactions" where "user_id" = v_secondary)), 'merge_blocked:wallet_transactions');
 perform public.rout_merge_assert((not exists (select 1 from public."wallets" where "user_id" = v_secondary)), 'merge_blocked:wallets');
 delete from public."alias_sync_jobs" where "user_id" = v_secondary;
 delete from public."auth_tokens" where "user_id" = v_secondary;
 delete from public."availability_cache" where "user_id" = v_secondary;
 delete from public."availability_jobs" where "user_id" = v_secondary;
 delete from public."forwarding_confirmation_sends" where "user_id" = v_secondary;
 delete from public."identity_verification_sessions" where "user_id" = v_secondary;
 delete from public."oauth_access_tokens" where "user_id" = v_secondary;
 delete from public."oauth_auth_codes" where "user_id" = v_secondary;
 delete from public."oauth_refresh_tokens" where "user_id" = v_secondary;
 delete from public."oauth_step_up_challenges" where "user_id" = v_secondary;
 delete from public."oauth_step_up_codes" where "user_id" = v_secondary;
 delete from public."phone_otp_codes" where "user_id" = v_secondary;
 delete from public."profile_drafts" where "user_id" = v_secondary;
 delete from public."security_codes" where "user_id" = v_secondary;
 delete from public."user_sessions" where "user_id" = v_secondary;
 delete from public."admin_permissions" s where s."user_id" = v_secondary and exists (select 1 from public."admin_permissions" p where p."user_id" = v_primary and p.permission = s.permission);
 update public."admin_permissions" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."alias_profiles" s where s."user_id" = v_secondary and exists (select 1 from public."alias_profiles" p where p."user_id" = v_primary);
 update public."alias_profiles" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."ambient_weather_locations" s where s."user_id" = v_secondary and exists (select 1 from public."ambient_weather_locations" p where p."user_id" = v_primary);
 update public."ambient_weather_locations" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."app_email_assignments" s where s."user_id" = v_secondary and exists (select 1 from public."app_email_assignments" p where p."user_id" = v_primary and p.client_id = s.client_id);
 update public."app_email_assignments" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."approved_handles" s where s."user_id" = v_secondary and exists (select 1 from public."approved_handles" p where p."user_id" = v_primary and lower(p.handle) = lower(s.handle));
 update public."approved_handles" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."badge_claim_redemptions" s where s."user_id" = v_secondary and exists (select 1 from public."badge_claim_redemptions" p where p."user_id" = v_primary and p.link_id = s.link_id);
 update public."badge_claim_redemptions" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."booking_event_type_hosts" s where s."user_id" = v_secondary and exists (select 1 from public."booking_event_type_hosts" p where p."user_id" = v_primary and p.event_type_id = s.event_type_id);
 update public."booking_event_type_hosts" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."booking_event_types" s where s."user_id" = v_secondary and exists (select 1 from public."booking_event_types" p where p."user_id" = v_primary and p.slug = s.slug);
 update public."booking_event_types" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."bunq_oauth_tokens" s where s."user_id" = v_secondary and exists (select 1 from public."bunq_oauth_tokens" p where p."user_id" = v_primary and p.environment = s.environment);
 update public."bunq_oauth_tokens" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."nfc_waitlist" s where s."user_id" = v_secondary and exists (select 1 from public."nfc_waitlist" p where p."user_id" = v_primary);
 update public."nfc_waitlist" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."oauth_consents" s where s."user_id" = v_secondary and exists (select 1 from public."oauth_consents" p where p."user_id" = v_primary and p.client_id = s.client_id);
 update public."oauth_consents" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."oauth_email_forwarding_rules" s where s."user_id" = v_secondary and exists (select 1 from public."oauth_email_forwarding_rules" p where p."user_id" = v_primary and p.client_id = s.client_id);
 update public."oauth_email_forwarding_rules" set "user_id" = v_primary where "user_id" = v_secondary;
 -- Identity relays (0157/0158): the primary's relay wins per connected app. A secondary
 -- duplicate is archived for the primary, then removed; its forwarding rule was
 -- deduplicated above, so the archived proxy no longer forwards. Moved relays follow
 -- the primary address. Late-bound: tables come from 0157/0158.
 insert into public.identity_relay_merge_archive(user_id,merged_from_user_id,connected_app_id,proxy_email,target_email,status,relay_created_at)
 select v_primary,s.user_id,s.connected_app_id,s.proxy_email,s.target_email,s.status,s.created_at
 from public.identity_relays s where s.user_id = v_secondary and exists (select 1 from public.identity_relays p where p.user_id = v_primary and p.connected_app_id = s.connected_app_id);
 get diagnostics v_relays_archived = row_count;
 delete from public.identity_relays s where s.user_id = v_secondary and exists (select 1 from public.identity_relays p where p.user_id = v_primary and p.connected_app_id = s.connected_app_id);
 update public.identity_relays set user_id = v_primary,
   target_email = coalesce((select lower(u.email) from public.users u where u.id = v_primary and position('@' in coalesce(u.email,'')) > 1), target_email),
   updated_at = now()
 where user_id = v_secondary;
 update public.identity_relay_merge_archive set user_id = v_primary where user_id = v_secondary;
 if v_relays_archived > 0 then
   insert into public.notifications(user_id,kind,title,body,severity,details)
   values(v_primary,'account.merge.relays_archived','Dubbele relays gearchiveerd',
     format('%s privé-relay(s) van je samengevoegde account bestonden al voor dezelfde app. Je bestaande relay blijft actief; de dubbele is gearchiveerd en stuurt geen mail meer door.', v_relays_archived),
     'warning',jsonb_build_object('count',v_relays_archived));
 end if;
 delete from public."pro_waitlist" s where s."user_id" = v_secondary and exists (select 1 from public."pro_waitlist" p where p."user_id" = v_primary);
 update public."pro_waitlist" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."profile_ingest_tokens" s where s."user_id" = v_secondary and exists (select 1 from public."profile_ingest_tokens" p where p."user_id" = v_primary);
 update public."profile_ingest_tokens" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."reserved_brand_releases" s where s."user_id" = v_secondary and exists (select 1 from public."reserved_brand_releases" p where p."user_id" = v_primary and p.term = s.term);
 update public."reserved_brand_releases" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."social_block_settings" s where s."profile_id" = v_secondary and exists (select 1 from public."social_block_settings" p where p."profile_id" = v_primary and p.platform = s.platform and lower(p.handle) = lower(s.handle));
 update public."social_block_settings" set "profile_id" = v_primary where "profile_id" = v_secondary;
 delete from public."social_follow_links" s where s."user_id" = v_secondary and exists (select 1 from public."social_follow_links" p where p."user_id" = v_primary and p.network = s.network and p.remote_actor = s.remote_actor and p.direction = s.direction);
 update public."social_follow_links" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."social_links" s where s."profile_id" = v_secondary and exists (select 1 from public."social_links" p where p."profile_id" = v_primary and p.platform = s.platform);
 update public."social_links" set "profile_id" = v_primary where "profile_id" = v_secondary;
 delete from public."tip_settings" s where s."user_id" = v_secondary and exists (select 1 from public."tip_settings" p where p."user_id" = v_primary);
 update public."tip_settings" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."user_badges" s where s."user_id" = v_secondary and exists (select 1 from public."user_badges" p where p."user_id" = v_primary and p.badge_id = s.badge_id);
 update public."user_badges" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."user_birthdates" s where s."user_id" = v_secondary and exists (select 1 from public."user_birthdates" p where p."user_id" = v_primary);
 update public."user_birthdates" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."user_calendar_feeds" s where s."user_id" = v_secondary and exists (select 1 from public."user_calendar_feeds" p where p."user_id" = v_primary);
 update public."user_calendar_feeds" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."user_custom_badges" s where s."user_id" = v_secondary and exists (select 1 from public."user_custom_badges" p where p."user_id" = v_primary and p.badge_id = s.badge_id);
 update public."user_custom_badges" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."user_custom_presence" s where s."user_id" = v_secondary and exists (select 1 from public."user_custom_presence" p where p."user_id" = v_primary);
 update public."user_custom_presence" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."user_feature_blocks" s where s."user_id" = v_secondary and exists (select 1 from public."user_feature_blocks" p where p."user_id" = v_primary and p.feature = s.feature);
 update public."user_feature_blocks" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."user_integration_links" s where s."user_id" = v_secondary and exists (select 1 from public."user_integration_links" p where p."user_id" = v_primary and p.provider = s.provider);
 update public."user_integration_links" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."user_integrations" s where s."user_id" = v_secondary and exists (select 1 from public."user_integrations" p where p."user_id" = v_primary and p.provider = s.provider);
 update public."user_integrations" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."user_music_status" s where s."user_id" = v_secondary and exists (select 1 from public."user_music_status" p where p."user_id" = v_primary);
 update public."user_music_status" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."user_phone_numbers" s where s."user_id" = v_secondary and exists (select 1 from public."user_phone_numbers" p where p."user_id" = v_primary);
 update public."user_phone_numbers" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."user_presence_connections" s where s."user_id" = v_secondary and exists (select 1 from public."user_presence_connections" p where p."user_id" = v_primary and p.provider = s.provider);
 update public."user_presence_connections" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."user_roles" s where s."user_id" = v_secondary and exists (select 1 from public."user_roles" p where p."user_id" = v_primary and p.role = s.role);
 update public."user_roles" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."user_snapchat" s where s."user_id" = v_secondary and exists (select 1 from public."user_snapchat" p where p."user_id" = v_primary);
 update public."user_snapchat" set "user_id" = v_primary where "user_id" = v_secondary;
 delete from public."workspace_members" s where s."user_id" = v_secondary and exists (select 1 from public."workspace_members" p where p."user_id" = v_primary and p.workspace_id = s.workspace_id);
 update public."workspace_members" set "user_id" = v_primary where "user_id" = v_secondary;
 update public."analytics_events" set "profile_id" = v_primary where "profile_id" = v_secondary;
 update public."api_keys" set "user_id" = v_primary where "user_id" = v_secondary;
 update public."availability_overrides" set "user_id" = v_primary where "user_id" = v_secondary;
 update public."availability_rules" set "user_id" = v_primary where "user_id" = v_secondary;
 update public."avatar_objects" set "user_id" = v_primary where "user_id" = v_secondary;
 update public."badge_events" set "user_id" = v_primary where "user_id" = v_secondary;
 update public."booking_requests" set "profile_id" = v_primary where "profile_id" = v_secondary;
 update public."community_reviews" set "user_id" = v_primary where "user_id" = v_secondary;
 update public."connected_calendars" set "user_id" = v_primary where "user_id" = v_secondary;
 update public."custom_domains" set "user_id" = v_primary where "user_id" = v_secondary;
 update public."domain_claims" set "user_id" = v_primary where "user_id" = v_secondary;
 update public."email_aliases" set "user_id" = v_primary where "user_id" = v_secondary;
 update public."feedback_forms" set "user_id" = v_primary where "user_id" = v_secondary;
 update public."gallery_objects" set "user_id" = v_primary where "user_id" = v_secondary;
 update public."influencer_requests" set "user_id" = v_primary where "user_id" = v_secondary;
 update public."invoice_deliveries" set "user_id" = v_primary where "user_id" = v_secondary;
 update public."links" set "profile_id" = v_primary where "profile_id" = v_secondary;
 update public."notifications" set "user_id" = v_primary where "user_id" = v_secondary;
 update public."oauth_email_deliveries" set "user_id" = v_primary where "user_id" = v_secondary;
 update public."profile_design_templates" set "user_id" = v_primary where "user_id" = v_secondary;
 update public."profile_events" set "user_id" = v_primary where "user_id" = v_secondary;
 update public."public_activity" set "user_id" = v_primary where "user_id" = v_secondary;
 update public."saved_qrs" set "user_id" = v_primary where "user_id" = v_secondary;
 update public."security_events" set "user_id" = v_primary where "user_id" = v_secondary;
 update public."shared_files" set "user_id" = v_primary where "user_id" = v_secondary;
 update public."subdomain_root_claims" set "user_id" = v_primary where "user_id" = v_secondary;
 update public."tracked_qrs" set "user_id" = v_primary where "user_id" = v_secondary;
 update public."user_assets" set "user_id" = v_primary where "user_id" = v_secondary;
 update public."user_identities" set "user_id" = v_primary where "user_id" = v_secondary;
 update public."user_linked_accounts" set "user_id" = v_primary where "user_id" = v_secondary;

 select coalesce(auth_user_id,nullif(user_metadata->>'neon_auth_id','')::uuid) into v_p_auth from public.users where id=v_primary;
 select coalesce(auth_user_id,nullif(user_metadata->>'neon_auth_id','')::uuid) into v_s_auth from public.users where id=v_secondary;
 -- Release canonical FK before native deletion/adoption (ON DELETE CASCADE).
 update public.users set auth_user_id=null,user_metadata=user_metadata-'neon_auth_id' where id=v_secondary;
 if v_s_auth is not null and v_s_auth is distinct from v_p_auth then
   delete from neon_auth.session where "userId"=v_s_auth;
   if v_p_auth is null then
     update public.users set auth_user_id=v_s_auth,user_metadata=coalesce(user_metadata,'{}'::jsonb)||jsonb_build_object('neon_auth_id',v_s_auth::text) where id=v_primary;
   else
     insert into public.merged_auth_account_archive(primary_user_id,secondary_auth_user_id,provider_id,provider_account_id,original_created_at)
     select v_primary,v_s_auth::text,s."providerId",s."accountId",s."createdAt" from neon_auth.account s where s."userId"=v_s_auth and exists(select 1 from neon_auth.account p where p."userId"=v_p_auth and p."providerId"=s."providerId");
     delete from neon_auth.account s where s."userId"=v_s_auth and exists(select 1 from neon_auth.account p where p."userId"=v_p_auth and p."providerId"=s."providerId");
     update neon_auth.account set "userId"=v_p_auth,"updatedAt"=now() where "userId"=v_s_auth;
     update neon_auth.passkey set "userId"=v_p_auth::text where "userId"=v_s_auth::text;
     delete from neon_auth."twoFactor" where "userId"=v_s_auth::text;
     delete from neon_auth."user" where id=v_s_auth;
   end if;
 end if;
 update public.profiles p set verified=p.verified or v_s.verified, verified_at=coalesce(p.verified_at,v_s.verified_at),verified_legal_name=coalesce(p.verified_legal_name,v_s.verified_legal_name),tier=case when v_s.tier='verified' or p.tier='verified' then 'verified' else p.tier end,is_paid=p.is_paid or v_s.is_paid,is_early_believer=p.is_early_believer or v_s.is_early_believer,is_business=p.is_business or v_s.is_business,is_influencer=p.is_influencer or v_s.is_influencer,updated_at=now() where p.id=v_primary;
 if p_keep_design='secondary' then
   insert into public.profile_design_templates(user_id,name,payload)
   select v_primary,left('Ontwerp van @'||coalesce(v_p.username,'hoofdaccount'),60),v_p_design
   where (select count(*) from public.profile_design_templates where user_id=v_primary)<30 and not exists(select 1 from public.profile_design_templates where user_id=v_primary and payload=v_p_design);
   update public.profiles set theme=v_s.theme,card_style=v_s.card_style,blocks=v_s.blocks,display_prefs=v_s.display_prefs,url_style=v_s.url_style,bio=v_s.bio,tagline=v_s.tagline,avatar_url=v_s.avatar_url,updated_at=now() where id=v_primary;
   delete from public.profile_drafts where user_id=v_primary and space='verified';
 end if;
 insert into public.profile_design_templates(user_id,name,payload)
 select v_primary,left('Ontwerp van @'||coalesce(v_s.username,'tweede account'),60),v_s_design
 where (select count(*) from public.profile_design_templates where user_id=v_primary)<30 and not exists(select 1 from public.profile_design_templates where user_id=v_primary and payload=v_s_design);
 delete from public.profiles where id=v_secondary;
 delete from public.users where id=v_secondary;
 if p_keep_handle='secondary' and v_s.username is not null then
   update public.profiles set username=v_s.username,updated_at=now() where id=v_primary;
 end if;
 insert into public.security_events(user_id,kind,message,severity,details)
 values(v_primary,'account.merged','Account merged','info',jsonb_build_object('ticket_id',v_ticket.id));
 return jsonb_build_object('ok',true,'primaryUserId',v_primary);
end $merge$;
-- No runtime membership; privileges are available only inside this fixed function.
grant create on schema public to rout_merge_executor;
-- PostgreSQL 16+: transferring ownership needs SET on the target role. Grant it to
-- the migrating role only for this statement (no inheritance), then withdraw it.
do $own$ begin execute format('grant rout_merge_executor to %I with inherit false, set true', current_user); end $own$;
alter function public.execute_account_merge(text,text,text,text) owner to rout_merge_executor;
do $own$ begin execute format('revoke rout_merge_executor from %I', current_user); end $own$;
revoke create on schema public from rout_merge_executor;
revoke all on function public.execute_account_merge(text,text,text,text) from public;
grant execute on function public.execute_account_merge(text,text,text,text) to rout_app;
