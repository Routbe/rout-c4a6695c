import {expect,it} from "vitest";
import {normalizeOmniBlocks} from "./omni-blocks";
it("upgrades metadata without changing existing identity or content",()=>{
 expect(normalizeOmniBlocks([{id:"same",kind:"custom",value:"https://example.com",contentType:"article",kineticTheme:"glass"}])).toEqual([{id:"same",kind:"custom",value:"https://example.com",contentType:"article",kineticTheme:"glass"}]);
});
it("untrusted kinetic metadata does not introduce a media upload",()=>{
 expect(normalizeOmniBlocks([{id:"same",contentType:"video_blob",kineticTheme:"raw-file"}])).toEqual([{id:"same"}]);
});