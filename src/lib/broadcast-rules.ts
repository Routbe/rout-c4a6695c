import {z} from "zod";
export const broadcastInput=z.object({provider:z.enum(["mastodon","bluesky","telegram","webhook"]),spaces:z.array(z.enum(["root","alias"])).min(1).max(2).default(["root"]),url:z.string().url().max(1000).optional(),token:z.string().min(8).max(2000),handle:z.string().max(200).optional(),chatId:z.string().max(100).optional()}).strict().superRefine((v,ctx)=>{
 if((v.provider==="mastodon"||v.provider==="webhook")&&(!v.url||!v.url.startsWith("https://")))ctx.addIssue({code:"custom",message:"https_required"});
 if(v.provider==="bluesky"&&!v.handle)ctx.addIssue({code:"custom",message:"handle_required"});
 if(v.provider==="telegram"&&!v.chatId)ctx.addIssue({code:"custom",message:"chat_required"});
});
export type BroadcastConfig=z.infer<typeof broadcastInput>;
export const broadcastProvider=(p:string)=>`omnicast_${p}`;
export const BROADCAST_PROVIDERS=["mastodon","bluesky","telegram","webhook"] as const;