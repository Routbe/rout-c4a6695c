import { createFileRoute } from "@tanstack/react-router";
import { readStatusJson } from "@/lib/presence";
export const Route=createFileRoute("/api_/public/statuses")({server:{handlers:{
 POST:async({request})=>{
  try {
   const data=await readStatusJson(request);
   if(request.headers.get("origin")!==new URL(request.url).origin) return Response.json({error:"same_origin_required"},{status:403});
   const {currentUser}=await import("@/lib/auth/session.server");const user=await currentUser();
   if(!user) return Response.json({error:"unauthorized"},{status:401});
   const {withDbContext}=await import("@/lib/neon");const {createPresence}=await import("@/lib/ephemeral.server");
   const story=await withDbContext({userId:user.id,workspaceId:null},()=>createPresence(user.id,data));
   return Response.json({story},{status:201,headers:{"cache-control":"no-store"}});
  } catch(error) {const status=(error as {statusCode?:number}).statusCode ?? 400;return Response.json({error:status===415?"json_only":"status_rejected"},{status});}
 }
}}});