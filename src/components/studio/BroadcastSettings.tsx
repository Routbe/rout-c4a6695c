import {useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {Radio,Unplug} from "lucide-react";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Checkbox} from "@/components/ui/checkbox";
import {getMyBroadcasts,saveMyBroadcast,removeMyBroadcast,retryMyBroadcasts} from "@/lib/broadcast.functions";
import {BROADCAST_PROVIDERS,type BroadcastConfig} from "@/lib/broadcast-rules";
import {useI18n} from "@/lib/i18n";
export function BroadcastSettings(){
 const {t}=useI18n();const qc=useQueryClient();const save=useServerFn(saveMyBroadcast),remove=useServerFn(removeMyBroadcast);
 const mine=useQuery({queryKey:["my-broadcasts"],queryFn:()=>getMyBroadcasts(),staleTime:60000});
 const [provider,setProvider]=useState<BroadcastConfig["provider"]>("mastodon"),[url,setUrl]=useState(""),[token,setToken]=useState(""),[handle,setHandle]=useState(""),[chatId,setChatId]=useState(""),[busy,setBusy]=useState(false);
 const [spaces,setSpaces]=useState<('root'|'alias')[]>(['root']);
 const submit=async()=>{setBusy(true);try{await save({data:{provider,spaces,token,...(url?{url}:{}),...(handle?{handle}:{}),...(chatId?{chatId}:{})}});setToken("");await qc.invalidateQueries({queryKey:["my-broadcasts"]});toast.success(t("presence.connected"));}catch{toast.error(t("presence.connectFailed"));}finally{setBusy(false);}};
 return <details className="border-t border-border pt-4"><summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><Radio className="h-4 w-4"/>Omnicast</summary><div className="mt-3 space-y-3">
 {(mine.data?.failed??0)>0&&<div className="flex items-center justify-between gap-2 text-sm"><span>{t('presence.broadcastFailed',{count:mine.data?.failed})}</span><Button variant="outline" onClick={()=>void retryMyBroadcasts().then(()=>qc.invalidateQueries({queryKey:['my-broadcasts']})).catch(()=>toast.error(t('presence.connectFailed')))}>{t('presence.retry')}</Button></div>}
 {mine.data?.providers.map(p=><div key={p.provider} className="flex items-center justify-between text-sm"><span>{p.provider}</span><Button variant="ghost" size="icon" aria-label={t("presence.disconnect")} onClick={()=>void remove({data:{provider:p.provider as BroadcastConfig["provider"]}}).then(()=>qc.invalidateQueries({queryKey:["my-broadcasts"]}))}><Unplug className="h-4 w-4"/></Button></div>)}
 {!mine.data?.ready?<p className="text-sm text-muted-foreground">{t("presence.encryptionMissing")}</p>:<>
 <div className="grid grid-cols-2 gap-1">{BROADCAST_PROVIDERS.map(p=><Button key={p} variant={provider===p?"default":"outline"} onClick={()=>{setProvider(p);setToken("");setUrl("");setHandle("");setChatId("");}}>{p}</Button>)}</div>
 {(provider==="mastodon"||provider==="webhook")&&<Input aria-label={t("presence.endpoint")} placeholder="https://…" value={url} onChange={e=>setUrl(e.target.value)}/>}
 {provider==="bluesky"&&<Input aria-label="Bluesky handle" placeholder="name.bsky.social" value={handle} onChange={e=>setHandle(e.target.value)}/>}
 {provider==="telegram"&&<Input aria-label="Telegram chat ID" placeholder="Chat ID" value={chatId} onChange={e=>setChatId(e.target.value)}/>}
 <Input type="password" autoComplete="off" aria-label={t("presence.credential")} placeholder={t("presence.credential")} value={token} onChange={e=>setToken(e.target.value)}/>
 {(['root','alias'] as const).map(s=><label key={s} className="flex items-center gap-2 text-sm"><Checkbox checked={spaces.includes(s)} onCheckedChange={yes=>setSpaces(current=>yes?[...current.filter(x=>x!==s),s]:current.filter(x=>x!==s))}/>{t(s==='root'?'presence.broadcastRoot':'presence.broadcastAlias')}</label>)}
 <Button disabled={busy||!token||!spaces.length} onClick={()=>void submit()}>{t("presence.connect")}</Button>
 </>}
 </div></details>;
}