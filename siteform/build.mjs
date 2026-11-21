import {build} from 'esbuild'

await build({
  entryPoints:['src/app.tsx'],
  bundle:true,
  minify:true,
  jsx:'automatic',
  define:{
    'process.env.NODE_ENV':JSON.stringify('production'),
    MAPBOX_PUBLIC_TOKEN:JSON.stringify(process.env.MAPBOX_PUBLIC_TOKEN?.trim()??'')
  },
  outfile:'public/app.js'
})
