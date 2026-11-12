import {z} from "zod";
import type {ProfileBlock} from "./profile";
export const omniPresentation=z.object({contentType:z.enum(["link","article","podcast","media"]).optional(),kineticTheme:z.enum(["aurora","glass"]).optional()});
/** Additive schema: retain existing identity, links, content, scheduling and drafts. */
export function normalizeOmniBlocks<T extends Record<string,unknown>>(blocks:T[]):T[]{
 return blocks.map(block=>{
  const parsed=omniPresentation.safeParse(block);
  const copy={...block};delete copy["contentType"];delete copy["kineticTheme"];
  return {...copy,...(parsed.success?parsed.data:{})} as T;
 });
}
export function blockContentType(block:ProfileBlock){
 return omniPresentation.safeParse(block).data?.contentType ?? (block.kind==="audio_player"?"podcast":block.kind==="media_embed"?"media":"link");
}