type Options={base:string;key:string;path:string;body?:unknown;fetcher?:typeof fetch;pause?:()=>Promise<void>};

export async function inspectionApi<T>({base,key,path,body,fetcher=fetch,pause=()=>new Promise(resolve=>setTimeout(resolve,1000))}:Options):Promise<T>{
 // Review only stores a draft; it never submits to the permit portal. Never
 // retry confirmation: a lost response may conceal a successful submission.
 const retryable=path==='/review'||(!body&&(path.startsWith('/live?')||path.startsWith('/operations/')));
 const guidance=path==='/review'?'No inspection was submitted. Your details are still here; try Review request again.':'Try again when the connection is available.';
 for(let attempt=0;;attempt++){
  let response:Response;
  try{
   response=await fetcher(base+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${key}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(180000)});
  }catch(error){
   if(retryable&&attempt===0&&error instanceof TypeError){await pause();continue;}
   throw Error(`Could not connect to inspection management. ${guidance}`);
  }
  let data:T & {error?:string};
  try{data=await response.json();}catch{
   throw Error(`Inspection management returned an unreadable response (HTTP ${response.status}). ${guidance}`);
  }
  if(!response.ok)throw Error(typeof data?.error==='string'?data.error:`Inspection management is unavailable (HTTP ${response.status}). ${guidance}`);
  return data;
 }
}
