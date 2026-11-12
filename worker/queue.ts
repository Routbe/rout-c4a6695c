/** Atomic queue operations. Row locks last only for claiming, never scraping. */
export const ZOMBIE_AFTER_MINUTES = 5;
export const MAX_ATTEMPTS = 3;
export const CLAIM_JOB = `with candidate as (
 select id from public.omni_jobs where status='queued' and attempts < 3 and next_attempt_at<=now()
 order by created_at for update skip locked limit 1
) update public.omni_jobs j set status='processing', attempts=attempts+1,
 lease_token=$1::uuid, updated_at=now() from candidate where j.id=candidate.id
 returning j.*`;
export const RECOVER_ZOMBIES = `update public.omni_jobs set
 status=case when attempts < 3 then 'queued'::public.omni_job_status else 'failed'::public.omni_job_status end,
 lease_token=null, error=case when attempts < 3 then null else 'worker_interrupted' end,
 next_attempt_at=now(), updated_at=now()
 where status='processing' and updated_at < now() - interval '5 minutes'`;
export const HEARTBEAT_JOB = `update public.omni_jobs set updated_at=now()
 where id=$1::uuid and lease_token=$2::uuid and status='processing' returning id`;
export const FAIL_JOB = `update public.omni_jobs set
 status=case when attempts < 3 then 'queued'::public.omni_job_status else 'failed'::public.omni_job_status end,
 next_attempt_at=now() + make_interval(secs => (power(2,attempts)*10)::int),
 lease_token=null, error=$3, updated_at=now()
 where id=$1::uuid and lease_token=$2::uuid and status='processing'`;
export const COMPLETE_JOB = `update public.omni_jobs set status='ready',content_type=$3::public.omni_content_type,
 title=$4,meta_tag=$5,target_url=source_url,local_media_path=$6,kinetic_preview_path=$7,
 lease_token=null,error=null,updated_at=now()
 where id=$1::uuid and lease_token=$2::uuid and status='processing' returning id`;