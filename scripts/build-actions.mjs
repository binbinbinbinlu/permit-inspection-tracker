import {build} from 'vite';
await build({configFile:false,build:{lib:{entry:'backend/worker.ts',formats:['es'],fileName:()=> 'worker.js'},outDir:'.wrangler/actions-build',emptyOutDir:true,minify:false,target:'es2022'}});
