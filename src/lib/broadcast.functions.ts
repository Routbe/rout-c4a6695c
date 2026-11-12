import {createServerFn} from "@tanstack/react-start";
import {requireAuth} from "./auth/middleware";
import {broadcastInput,BROADCAST_PROVIDERS} from "./broadcast-rules";
import {z} from "zod";
export const getMyBroadcasts=createServerFn({method:"GET"}).middleware([requireAuth]).handler(async({context})=>{const s=await import("./broadcast.server");return s.myBroadcasts(context.userId);});
export const saveMyBroadcast=createServerFn({method:"POST"}).middleware([requireAuth]).inputValidator((i:unknown)=>broadcastInput.parse(i)).handler(async({data,context})=>{const s=await import("./broadcast.server");await s.saveBroadcast(context.userId,data);return {ok:true};});
export const removeMyBroadcast=createServerFn({method:"POST"}).middleware([requireAuth]).inputValidator((i:unknown)=>z.object({provider:z.enum(BROADCAST_PROVIDERS)}).parse(i)).handler(async({data,context})=>{const s=await import("./broadcast.server");await s.disconnectBroadcast(context.userId,data.provider);return {ok:true};});
export const retryMyBroadcasts=createServerFn({method:"POST"}).middleware([requireAuth]).handler(async({context})=>{const s=await import("./broadcast.server");return s.retryBroadcasts(context.userId);});