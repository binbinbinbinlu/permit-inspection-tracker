import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
export default defineConfig({
 base:'./',
 plugins:[react()],
 resolve:{alias:{'@':fileURLToPath(new URL('.',import.meta.url))}},
 css:{postcss:{plugins:[tailwind()]}},
 define:{'process.env.NEXT_PUBLIC_ACTIONS_URL':JSON.stringify(process.env.NEXT_PUBLIC_ACTIONS_URL||''),'process.env.NEXT_PUBLIC_PAGES_MODE':JSON.stringify('true'),'process.env.NEXT_PUBLIC_GITHUB_REPOSITORY':JSON.stringify(process.env.GITHUB_REPOSITORY||'binbinbinbinlu/permit-inspection-tracker')},
 build:{outDir:'dist-pages'},
});
