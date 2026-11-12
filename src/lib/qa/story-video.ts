import { createProceduralCanvas } from "./procedural-canvas";
import { wrapText, STORY_W, STORY_H } from "./story-card";
import { storyFile } from "./native-share";
export const STORY_VIDEO_MS=3000;
export const STORY_VIDEO_FPS=60;
export function recordingMime(): string | null {
  if(typeof MediaRecorder==="undefined") return null;
  return ["video/mp4","video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm"].find(t=>MediaRecorder.isTypeSupported(t)) ?? null;
}
/** Composite procedural GPU graphics and vector text locally. No server media. */
export async function renderPresenceVideo(text:string, signal?:AbortSignal):Promise<File> {
 const mime=recordingMime();if(!mime) throw new Error("video_unavailable");
 await document.fonts.ready;
 if(signal?.aborted) throw new DOMException("Cancelled","AbortError");
 const gpu=document.createElement("canvas");gpu.width=STORY_W;gpu.height=STORY_H;
 const engine=createProceduralCanvas(gpu);if(!engine) throw new Error("webgl_unavailable");
 const out=document.createElement("canvas");out.width=STORY_W;out.height=STORY_H;
 const ctx=out.getContext("2d");if(!ctx || !out.captureStream) {engine.dispose();throw new Error("capture_unavailable");}
 const styles=getComputedStyle(document.documentElement);
 const ink=`hsl(${styles.getPropertyValue("--story-card")})`;
 const family=getComputedStyle(document.body).fontFamily;
 let size=100,lines:string[]=[];
 while(size>=24) {ctx.font=`600 ${size}px ${family}`;lines=wrapText(s=>ctx.measureText(s).width,text,880);if(lines.length*size*1.3<1050) break;size-=4;}
 const maxLines=Math.floor(1050/(size*1.3));if(lines.length>maxLines){lines=lines.slice(0,maxLines);lines[maxLines-1]=`${(lines[maxLines-1]??'').slice(0,-1)}…`;}
 const draw=(seconds:number)=>{engine.draw(seconds);ctx.drawImage(gpu,0,0);ctx.fillStyle=ink;ctx.textAlign="center";ctx.textBaseline="middle";ctx.font=`600 ${size}px ${family}`;
  lines.forEach((line,i)=>ctx.fillText(line,540,960+(i-(lines.length-1)/2)*size*1.3));ctx.font=`500 38px ${family}`;ctx.fillText("ROUT",540,1550);
 };
 draw(0);
 const stream=out.captureStream(STORY_VIDEO_FPS);let frame=0,timer=0;
 try {
  return await new Promise<File>((resolve,reject)=>{
   const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8_000_000});const chunks:Blob[]=[];let aborted=false;
   const abort=()=>{aborted=true;if(recorder.state!=="inactive") recorder.stop();};
   signal?.addEventListener("abort",abort,{once:true});
   recorder.ondataavailable=e=>{if(e.data.size) chunks.push(e.data);};
   recorder.onerror=()=>reject(new Error("recording_failed"));
   recorder.onstop=()=>{signal?.removeEventListener("abort",abort);if(aborted) reject(new DOMException("Cancelled","AbortError"));else {const type=mime.startsWith("video/mp4")?"video/mp4":"video/webm";try {resolve(storyFile(new Blob(chunks,{type}),`rout-story.${type.endsWith("mp4")?"mp4":"webm"}`));}catch(e){reject(e);}}};
   const start=performance.now();const tick=(time:number)=>{draw(Math.min(STORY_VIDEO_MS,time-start)/1000);if(time-start<STORY_VIDEO_MS && !aborted) frame=requestAnimationFrame(tick);};
   recorder.start();if(signal?.aborted){abort();return;}frame=requestAnimationFrame(tick);timer=window.setTimeout(()=>{if(recorder.state!=="inactive") recorder.stop();},STORY_VIDEO_MS);
  });
 } finally {cancelAnimationFrame(frame);clearTimeout(timer);stream.getTracks().forEach(t=>t.stop());engine.dispose();}
}