export class PortalReadTimeout extends Error {
 constructor(){super('The permit portal took too long to respond. No inspection was submitted. Please try again.');this.name='PortalReadTimeout';}
}
export async function withDeadline<T>(work:Promise<T>,milliseconds:number,error:Error):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(error),milliseconds);})]);}
 finally{clearTimeout(timer);}
}

export function finishPortalSession(close:()=>Promise<void>,context?:{waitUntil:(work:Promise<unknown>)=>void},milliseconds=5000):Promise<void>{
 // Browser shutdown must not hold an already-completed HTTP response open.
 const cleanup=withDeadline(Promise.resolve().then(close),milliseconds,new Error('Browser cleanup timed out.')).catch(()=>{});
 if(context){context.waitUntil(cleanup);return Promise.resolve();}
 return cleanup;
}
