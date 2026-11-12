import {sql} from "./neon";
import {broadcastInput,broadcastProvider,type BroadcastConfig} from "./broadcast-rules";
import {seal,open,encryptionConfigured} from "./crypto/secretbox.server";
import {assertPublicHost} from "./safe-fetch.server";
import {signWebhook,SIGNATURE_HEADER} from "./webhooks/signature";
export async function saveBroadcast(owner:string,raw:BroadcastConfig){
 const data=broadcastInput.parse(raw);
 if(data.url){const u=new URL(data.url);if(u.protocol!=="https:"||u.username||u.password||u.port||!await assertPublicHost(u.hostname))throw new Error("unsafe_destination");}
 const provider=broadcastProvider(data.provider);const sealed=await seal(JSON.stringify(data),`omnicast:${owner}:${provider}`);
 await sql`insert into public.user_integrations(user_id,provider,handle,audience,visible,show_on_verified,show_on_alias,include_in_reach,status_json,access_token_enc,access_token_iv,connection_status)
 values(${owner},${provider},${data.handle??data.provider},'both',false,false,false,false,${JSON.stringify({broadcastSpaces:data.spaces})}::jsonb,${sealed.ciphertext},${sealed.iv},'connected')
 on conflict(user_id,provider) do update set status_json=excluded.status_json,access_token_enc=excluded.access_token_enc,access_token_iv=excluded.access_token_iv,connection_status='connected',visible=false,show_on_verified=false,show_on_alias=false,include_in_reach=false`;
}
export async function myBroadcasts(owner:string){
 const rows=await sql`select provider,connection_status from public.user_integrations where user_id=${owner} and provider in ('omnicast_mastodon','omnicast_bluesky','omnicast_telegram','omnicast_webhook')` as Record<string,unknown>[];
 const counts=await sql`select count(*) filter(where attempts>=5)::int as failed,count(*) filter(where attempts<5)::int as pending from public.presence_broadcast_jobs where user_id=${owner} and delivered_at is null` as Record<string,unknown>[];
 return {ready:encryptionConfigured(),failed:Number(counts[0]?.['failed']??0),pending:Number(counts[0]?.['pending']??0),providers:rows.map(r=>({provider:String(r["provider"]).replace("omnicast_",""),connected:r["connection_status"]==="connected"}))};
}
export async function disconnectBroadcast(owner:string,provider:string){await sql`delete from public.user_integrations where user_id=${owner} and provider=${broadcastProvider(provider)}`;await sql`delete from public.presence_broadcast_jobs where user_id=${owner} and provider=${broadcastProvider(provider)} and delivered_at is null`;}
export async function retryBroadcasts(owner:string){
 // Only retry confirmed server failures on the provider with an idempotency key.
 await sql`update public.presence_broadcast_jobs set attempts=0,next_attempt_at=now(),claimed_until=null where user_id=${owner} and provider='omnicast_mastodon' and delivered_at is null and last_status>=500 and (claimed_until is null or claimed_until<now())`;
 return deliverBroadcasts(owner);
}
async function send(config:BroadcastConfig,text:string,id:string):Promise<number>{
 let url="",body:unknown={},headers:Record<string,string>={"content-type":"application/json"};
 if(config.provider==="mastodon") {url=new URL("/api/v1/statuses",config.url).href;body={status:text};headers["authorization"]=`Bearer ${config.token}`;headers["Idempotency-Key"]=id;}
 else if(config.provider==="telegram"){url=`https://api.telegram.org/bot${encodeURIComponent(config.token)}/sendMessage`;body={chat_id:config.chatId,text};}
 else if(config.provider==="webhook"){url=config.url??"";const json=JSON.stringify({id,type:"status.published",data:{text}});headers[SIGNATURE_HEADER]=await signWebhook(config.token,json,Math.floor(Date.now()/1000));body=JSON.parse(json);}
 else {
  const login=await fetch("https://bsky.social/xrpc/com.atproto.server.createSession",{method:"POST",headers,body:JSON.stringify({identifier:config.handle,password:config.token}),redirect:"manual",signal:AbortSignal.timeout(10000)});
  if(!login.ok)return login.status;const session=await login.json() as {accessJwt:string;did:string};
  url="https://bsky.social/xrpc/com.atproto.repo.createRecord";headers["authorization"]=`Bearer ${session.accessJwt}`;body={repo:session.did,collection:"app.bsky.feed.post",record:{$type:"app.bsky.feed.post",text:[...text].slice(0,300).join(""),createdAt:new Date().toISOString()}};
 }
 const parsed=new URL(url);if(parsed.protocol!=="https:"||!await assertPublicHost(parsed.hostname))throw new Error("unsafe_destination");
 const res=await fetch(url,{method:"POST",headers,body:JSON.stringify(body),redirect:"manual",signal:AbortSignal.timeout(10000)});
 return res.status;
}
export async function deliverBroadcasts(owner:string){
 const rows=await sql`update public.presence_broadcast_jobs set claimed_until=now()+interval '2 minutes',attempts=attempts+1
 where id in(select id from public.presence_broadcast_jobs where user_id=${owner} and delivered_at is null
 and attempts<5 and next_attempt_at<=now() and (claimed_until is null or claimed_until<now()) order by created_at limit 10 for update skip locked)
 returning *` as Record<string,unknown>[];
 for(const row of rows){
  const allowed=await sql`select public.rout_broadcast_event_allowed(${owner},${String(row['event_id'])},${String(row['space'])}) as allowed` as Record<string,unknown>[];
  if(allowed[0]?.['allowed']!==true){await sql`update public.presence_broadcast_jobs set attempts=5,claimed_until=null,last_status=410 where id=${String(row['id'])}`;continue;}
  const creds=await sql`select access_token_enc,access_token_iv from public.user_integrations where user_id=${owner} and provider=${String(row["provider"])} and connection_status='connected' limit 1` as Record<string,unknown>[];
  const cred=creds[0];if(!cred){await sql`update public.presence_broadcast_jobs set attempts=5,claimed_until=null,last_status=410 where id=${String(row['id'])}`;continue;}let status=0;
  try{const config=broadcastInput.parse(JSON.parse(await open(String(cred["access_token_enc"]),String(cred["access_token_iv"]),`omnicast:${owner}:${String(row["provider"])}`)));
   if(!config.spaces.includes(String(row['space']) as 'root'|'alias'))throw new Error('space_not_authorized');
   const current=await sql`select content_payload->>'text' as text from public.ephemeral_statuses where id=${String(row['event_id'])} and user_id=${owner} and space=${String(row['space'])}
     union all select body || E'\n\n' || answer as text from public.profile_questions where id=${String(row['event_id'])} and owner_id=${owner} and space=${String(row['space'])} limit 1` as Record<string,unknown>[];
   if(typeof current[0]?.['text']!=='string')throw new Error('missing_source');
   for(let attempt=0;attempt<3;attempt++){
    status=await send(config,String(current[0]['text']),String(row["id"]));
    if(config.provider!=="mastodon"||status<500||attempt===2)break;
    await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));
   }
  }catch{status=0;}
  // Ambiguous timeouts and providers without idempotency are not retried automatically.
  await sql`update public.presence_broadcast_jobs set last_status=${status},delivered_at=case when ${status} between 200 and 299 then now() else null end,
   claimed_until=null,attempts=5 where id=${String(row["id"])}`;
 }
 return {processed:rows.length};
}