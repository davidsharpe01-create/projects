const cookieName = '__Host-sites-workspace'
const workspacePattern = /^[a-f0-9]{64}$/
const accessCookie = '__Host-sites-access'
const cookieOptions = '; Path=/; HttpOnly; Secure; SameSite=Strict'
function equalToken(candidate, expected) {
  if (typeof candidate !== 'string' || candidate.length !== expected.length) return false
  let difference = 0
  for (let i = 0; i < expected.length; i++) difference |= candidate.charCodeAt(i) ^ expected.charCodeAt(i)
  return difference === 0
}
const maxBytes = 2_000_000
const json = (body, status = 200, headers = {}) => Response.json(body, {
  status, headers: {'Cache-Control': 'no-store', ...headers}
})

function parseSite(row, canEdit) {
  return {id:row.id, name:row.name, project:JSON.parse(row.data), revision:row.revision, updatedAt:row.updated_at, canEdit}
}

export async function onRequest({request, env}) {
  if (!env.SITES_DB) return json({error:'Cloud storage is unavailable.'}, 503)
  const {method, headers} = request
  if (!['GET', 'POST', 'PUT', 'PATCH'].includes(method)) return json({error:'Method not allowed.'}, 405, {Allow:'GET, POST, PUT, PATCH'})
  const cookies = headers.get('Cookie')?.split(';').map(value => value.trim()) ?? []
  const readCookie = name => cookies.find(value => value.startsWith(name+'='))?.slice(name.length+1)
  const workspace = readCookie(cookieName)
  const authenticated = workspacePattern.test(workspace ?? '')
  const accessKey = env.SITES_ACCESS_KEY
  const session = accessKey ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode('sites-session:'+accessKey))), byte => byte.toString(16).padStart(2,'0')).join('') : ''
  const allSites = !!accessKey && equalToken(readCookie(accessCookie),session)
  const origin = headers.get('Origin')
  if (method !== 'GET' && ((origin && origin !== new URL(request.url).origin) ||
      !headers.get('Content-Type')?.startsWith('application/json'))) {
    return json({error:'Unsupported request.'}, 403)
  }
  if (method === 'PATCH') {
    if (!accessKey) return json({error:'Project access is unavailable.'}, 503)
    if (Number(headers.get('Content-Length')) > 512) return json({error:'Invalid access request.'}, 400)
    const input = await request.json().catch(()=>null)
    if (input?.lock === true) return json({ok:true},200,{'Set-Cookie':accessCookie+'='+cookieOptions+'; Max-Age=0'})
    if (!equalToken(input?.key,accessKey)) return json({error:'Incorrect access key.'},401)
    return json({ok:true},200,{'Set-Cookie':accessCookie+'='+session+cookieOptions+'; Max-Age=2592000'})
  }
  const newWorkspace = authenticated ? undefined : crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '')
  const workspaceCookie = newWorkspace ? {'Set-Cookie':cookieName+'='+newWorkspace+cookieOptions+'; Max-Age=31536000'} : {}
  if (method !== 'GET' && !authenticated && !allSites) {
    return json({error:'Reload the sites overview to start a workspace.'}, 401)
  }
  const db = env.SITES_DB
  try {
    if (method === 'GET') {
      const {results} = await db.prepare('SELECT * FROM sites ORDER BY updated_at DESC, id').all()
      return json({sites:results.map(row=>parseSite(row,allSites||authenticated&&row.workspace===workspace)),allSites},200,workspaceCookie)
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
        .bind(id, authenticated ? workspace : newWorkspace, name, data, now).run()
      return json({id, name, revision:0, updatedAt:now, project, canEdit:true}, 201, workspaceCookie)
    }
    const {id, revision} = input
    if (typeof id !== 'string' || !Number.isSafeInteger(revision) || revision < 0) {
      return json({error:'Invalid site or revision.'}, 400)
    }
    const update = db.prepare('UPDATE sites SET data = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?'+
      (allSites?'':' AND workspace = ?'))
    const params = [data, now, id, revision]
    if (!allSites) params.push(workspace)
    const {meta} = await update.bind(...params).run()
    if (!meta.changes) return json({error:'The saved site has changed. Reopen it to load the latest version.'}, 409)
    return json({revision:revision+1, updatedAt:now})
  } catch {
    return json({error:'Cloud storage is temporarily unavailable.'}, 503)
  }
}
