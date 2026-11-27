import {useEffect,useRef,useState,type FormEvent} from 'react'
import {blankProject,restoreProject,siteLocation} from './project'
import type {Project} from './model'
import {draw,fitCamera,home} from './scene'
import {emptyContext} from './context'
import {Icon} from './icons'

export type Site={id:string;name:string;project:Project;revision:number;updatedAt:number}
type SaveReceipt=Pick<Site,'revision'|'updatedAt'>

async function sitesRequest<T>(method='GET',body?:unknown):Promise<T>{
  const response=await fetch('/api/sites',body===undefined?undefined:{
    method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
  })
  const result=await response.json().catch(()=>null)
  if(!response.ok||result===null)throw new Error(result?.error??'Could not reach cloud storage.')
  return result
}

export function saveSite(id:string,revision:number,project:Project){
  return sitesRequest<SaveReceipt>('PUT',{id,revision,project})
}

export function readBrowserSite():Project|undefined{
  try{
    const project=restoreProject(localStorage.getItem('siteform.project.v1'))
    if(project.blocks.length||project.boundary.length)return project
  }catch{}
}

function Preview({project}:{project:Project}){
  const canvas=useRef<HTMLCanvasElement>(null)
  const hasGeometry=project.boundary.length>=3||project.blocks.length>0
  useEffect(()=>{
    const node=canvas.current
    if(!node)return
    const render=()=>{
      const {clientWidth:w,clientHeight:h}=node
      if(!w||!h)return
      draw(node,{
        camera:fitCamera(w,h,home,false,project,Infinity),plan:false,project,selected:null,
        showFloorplates:false,floor:0,editFloor:0,draft:[],pointer:null,
        layers:{context:false,streets:false,aerial:false,travel:false,floorplates:false,grid:false},
        opacity:1,editFrontage:false,drawBuilding:false,editBoundary:false,
        skipLayouts:true,context:emptyContext,aerial:[],ghosted:new Set()
      })
    }
    const observer=new ResizeObserver(render)
    observer.observe(node)
    return()=>observer.disconnect()
  },[project])
  return <div className="site-preview" aria-hidden="true">
    {hasGeometry?<canvas ref={canvas}/>:<span>Boundary to be drawn</span>}
  </div>
}

export function SiteWorkspace({editor}:{editor:(site:Site,close:()=>void,saved:(site:Site)=>void)=>React.ReactNode}){
  const [sites,setSites]=useState<Site[]>()
  const [site,setSite]=useState<Site>()
  const [form,setForm]=useState<'new'|'import'>()
  const [name,setName]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [imported,setImported]=useState(false)
  const [browserSite]=useState(readBrowserSite)
  const [attempt,setAttempt]=useState(0)
  useEffect(()=>{
    let active=true
    sitesRequest<{sites:Site[]}>().then(result=>{if(active)setSites(result.sites)}).catch(failure=>{if(active)setError(failure.message)})
    return()=>{active=false}
  },[attempt])
  function update(saved:Site){
    setSites(list=>[saved,...(list??[]).filter(existing=>existing.id!==saved.id)])
  }
  async function create(event:FormEvent){
    event.preventDefault()
    if(!name.trim()||busy)return
    setBusy(true)
    setError('')
    try{
      const created=await sitesRequest<Site>('POST',{name:name.trim(),project:form==='import'?browserSite:blankProject()})
      if(form==='import')setImported(true)
      update(created)
      setSite(created)
      setForm(undefined)
      setName('')
    }catch(failure){setError(failure instanceof Error?failure.message:'Could not create site.')}
    finally{setBusy(false)}
  }
  if(site)return editor(site,()=>{
    setSite(undefined)
    setSites(undefined)
    setAttempt(value=>value+1)
  },update)
  return <main className="sites-overview">
    <header className="sites-heading"><h1>Projects</h1>
      <div className="sites-actions">
        {browserSite&&!imported&&<button type="button" disabled={!sites||busy} onClick={()=>{setName('');setForm('import')}}>Import browser site</button>}
        <button className="primary" type="button" disabled={!sites||busy} onClick={()=>{setName('');setForm('new')}}><Icon name="plus"/>New site</button>
      </div>
    </header>
    {form&&<form className="site-create" onSubmit={create}>
      <label>Site name <input autoFocus value={name} onChange={event=>setName(event.target.value)} maxLength={100} required/></label>
      <button className="primary" disabled={busy||!name.trim()}>{form==='import'?'Import site':'Create site'}</button>
      <button type="button" disabled={busy} onClick={()=>{setForm(undefined);setError('')}}>Cancel</button>
    </form>}
    {error&&<p role="alert">{error} {!sites&&<button type="button" onClick={()=>{setError('');setAttempt(value=>value+1)}}>Retry</button>}</p>}
    {!sites&&!error&&<p role="status">Loading sites…</p>}
    {sites?.length===0&&!form&&<div className="sites-empty"><Icon name="building" size={26}/><h2>No saved sites yet</h2><p>Create a site to start a model.</p></div>}
    <div className="sites-grid">
      {sites?.map(item=>{
        const location=siteLocation(item.project)
        return <button className="site-card" key={item.id} onClick={()=>setSite(item)}>
          <Preview project={item.project}/>
          <span className="site-card-details"><span><strong>{item.name}</strong><small>{location?
            `${location.lat.toFixed(5)}°, ${location.lon.toFixed(5)}°`:'No mapped boundary yet'}</small></span><Icon name="right" size={16}/></span>
        </button>
      })}
    </div>
  </main>
}
