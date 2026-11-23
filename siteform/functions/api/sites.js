const maxBytes = 2_000_000
const json = (body, status = 200, headers = {}) => Response.json(body, {
  status, headers: {'Cache-Control': 'no-store', ...headers}
})

function parseSite(row) {
  return {id:row.id, name:row.name, project:JSON.parse(row.data), revision:row.revision, updatedAt:row.updated_at}
}

export async function onRequest({request, env}) {
  if (!env.SITES_DB) return json({error:'Cloud storage is unavailable.'}, 503)
  const {method, headers} = request
  if (!['GET', 'POST', 'PUT'].includes(method)) return json({error:'Method not allowed.'}, 405, {Allow:'GET, POST, PUT'})
  const origin = headers.get('Origin')
  if (method !== 'GET' && ((origin && origin !== new URL(request.url).origin) ||
      !headers.get('Content-Type')?.startsWith('application/json'))) {
    return json({error:'Unsupported request.'}, 403)
  }
  const db = env.SITES_DB
  try {
    if (method === 'GET') {
      const {results} = await db.prepare('SELECT * FROM sites ORDER BY updated_at DESC, id').all()
      return json({sites:results.map(parseSite)})
    }
    if (Number(headers.get('Content-Length')) > maxBytes) return json({error:'This site is too large to save.'}, 413)
    const raw = await request.text()
    if (new TextEncoder().encode(raw).length > maxBytes) return json({error:'This site is too large to save.'}, 413)
    let input
    try { input = JSON.parse(raw) } catch { return json({error:'Invalid site data.'}, 400) }
    const project = input?.project
    if (!Array.isArray(project?.blocks) || !Array.isArray(project.boundary) || !project.targets || !project.colours) {
      return json({error:'Invalid project data.'}, 400)
    }
    const data = JSON.stringify(project)
    const now = Date.now()
    if (method === 'POST') {
      const name = typeof input.name === 'string' ? input.name.trim() : ''
      if (!name || name.length > 100) return json({error:'Enter a site name up to 100 characters.'}, 400)
      const id = crypto.randomUUID()
      await db.prepare('INSERT INTO sites (id, workspace, name, data, updated_at) VALUES (?, ?, ?, ?, ?)')
        .bind(id, '', name, data, now).run()
      return json({id, name, revision:0, updatedAt:now, project}, 201)
    }
    const {id, revision} = input
    if (typeof id !== 'string' || !Number.isSafeInteger(revision) || revision < 0) {
      return json({error:'Invalid site or revision.'}, 400)
    }
    const {meta} = await db.prepare('UPDATE sites SET data = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?')
      .bind(data, now, id, revision).run()
    if (!meta.changes) return json({error:'The saved site has changed. Reopen it to load the latest version.'}, 409)
    return json({revision:revision+1, updatedAt:now})
  } catch {
    return json({error:'Cloud storage is temporarily unavailable.'}, 503)
  }
}
