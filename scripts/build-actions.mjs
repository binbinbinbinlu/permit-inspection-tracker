import {build} from 'vite';
// Workerd has a virtual /bundle filesystem but no import.meta.url. Give
// Rolldown's Node builtin require shim a valid absolute virtual filename.
await build({configFile:false,plugins:[{name:'workerd-require-base',renderChunk(code){return code.replaceAll('createRequire(import.meta.url)','createRequire("/bundle/worker.js")');}}],ssr:{noExternal:true},build:{ssr:true,rollupOptions:{external:[/^node:/,/^cloudflare:/]},lib:{entry:'backend/worker.ts',formats:['es'],fileName:()=> 'worker.js'},outDir:'.wrangler/actions-build',emptyOutDir:true,minify:false,target:'es2022'}});
