

function allowed(r: Request) { return r.headers.get('x-plan-key') === 'public-planner'; }
const headers = {'Cache-Control':'no-store'};
export const onRequestGet: PagesFunction<{DB:D1Database}> = async ({request:r,env}) => {
 if(!allowed(r)) return Response.json({error:'Open your shared planner link to continue.'},{status:403,headers});
 const row = await env.DB!.prepare('SELECT data, revision FROM plans WHERE id = ?').bind('main').first<any>();
 return Response.json(row ? {data:JSON.parse(row.data),revision:row.revision} : {data:null,revision:0},{headers});
}
export const onRequestPut: PagesFunction<{DB:D1Database}> = async ({request:r,env}) => {
 if(r.headers.get("origin")!==new URL(r.url).origin)return Response.json({error:"Invalid origin"},{status:403});
 if(!allowed(r)) return Response.json({error:'Invalid planner link.'},{status:403,headers});
 const body = await r.json() as any;
 if(!Array.isArray(body.data) || body.data.length>200 || !Number.isInteger(body.revision) || JSON.stringify(body.data).length>100000) return Response.json({error:'Invalid plan'},{status:400});
 for(const p of body.data) if(typeof p.id!=='string'||typeof p.name!=='string'||p.name.length>200||typeof p.org!=='string'||p.org.length>200||!['orange','yellow','pink','blue','green','peach','grey'].includes(p.color)||!Number.isInteger(p.table)||p.table<0||p.table>8) return Response.json({error:'Invalid guest'},{status:400});
 await env.DB!.prepare('INSERT OR IGNORE INTO plans (id,data,revision) VALUES (?,?,0)').bind('main','[]').run();
 const out = await env.DB!.prepare('UPDATE plans SET data = ?, revision = revision + 1 WHERE id = ? AND revision = ?').bind(JSON.stringify(body.data),'main',body.revision).run();
 if(!out.meta.changes) return Response.json({error:'Another organiser updated the plan. Latest changes have been loaded; please try again.'},{status:409});
 return Response.json({revision:body.revision+1},{headers});
}
