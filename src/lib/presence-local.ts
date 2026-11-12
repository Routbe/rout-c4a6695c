import { statusInput, type StatusInput } from "./presence";
type Pending = { key: string; owner: string; handle: string; input: StatusInput; createdAt: string };
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve,reject) => {
    const request = indexedDB.open("rout-presence", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("pending", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
export async function savePending(owner: string, handle: string, input: StatusInput) {
  const db = await database();
  try { await new Promise<void>((resolve,reject) => { const tx = db.transaction("pending", "readwrite");
    tx.objectStore("pending").put({ key: `${owner}:${input.id}`, owner, handle, input: statusInput.parse(input), createdAt: new Date().toISOString() });
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  }); } finally { db.close(); }
}
export async function removePending(owner: string, id: string) {
  const db = await database();
  try { await new Promise<void>((resolve,reject) => { const tx = db.transaction("pending","readwrite"); tx.objectStore("pending").delete(`${owner}:${id}`); tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error); }); } finally { db.close(); }
}
export async function pendingStatuses(owner: string): Promise<Pending[]> {
  const db=await database();
  try { return await new Promise((resolve,reject) => { const request=db.transaction("pending").objectStore("pending").getAll(); request.onsuccess=()=>resolve((request.result as Pending[]).filter(p => p.owner===owner && Date.parse(p.createdAt)+86400000>Date.now() && statusInput.safeParse(p.input).success));request.onerror=()=>reject(request.error); }); } finally { db.close(); }
}