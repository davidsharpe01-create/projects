import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Icon } from './icons'
import { sample, length, footprintSatisfies, frontage, floors, height, inside, blockStats, development, newBlock, validPolygon, csv, type Block, type Point, type Project } from './model'
import { draw, home, initialLayers, projection, type Camera } from './scene'
import './style.css'

type Tool='select'|'boundary'|'house'|'apartment'|'move'|'rotate'|'measure'|'vertices'
const tools:{id:Tool;icon:string;name:string;key:string}[]=[
  {id:'select',icon:'mouse',name:'Select',key:'V'},{id:'boundary',icon:'boundary',name:'Boundary',key:'B'},
  {id:'house',icon:'house',name:'House run',key:'H'},{id:'apartment',icon:'building',name:'Apartment',key:'A'},
  {id:'move',icon:'move',name:'Move',key:'M'},{id:'rotate',icon:'rotate',name:'Rotate',key:'R'},
  {id:'measure',icon:'ruler',name:'Measure',key:'L'}
]
const key='siteform.project.v1'
function load():Project {
  try {
    const value=JSON.parse(localStorage.getItem(key)||'null')
    if(value && Array.isArray(value.blocks) && Array.isArray(value.boundary) && value.targets && value.colours) return value
  } catch {}
  return sample
}
const format=(n:number,places=0)=>n.toLocaleString('en-GB',{maximumFractionDigits:places,minimumFractionDigits:places})
const pointDiff=(p:Point,q:Point):Point=>[p[0]-q[0],p[1]-q[1]]
const defaultOption='Base option'
type Drag={screen:Point;point:Point;camera:Camera;project:Project;id:string|null;action:'orbit'|'pan'|'move'|'rotate'|'vertices'|'draw';vertex:number;changed:boolean}

function NumberField({label,value,update,min,max,step=1,unit='m'}:{label:string;value:number;update:(n:number)=>void;min:number;max:number;step?:number;unit?:string}){
  const [draft,change]=useState(String(value))
  useEffect(()=>change(String(value)),[value])
  return <label className="field"><span>{label}</span><div><input type="number" value={draft} min={min} max={max} step={step}
    onChange={e=>change(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}
    onBlur={()=>{const n=Number(draft);if(draft.trim()&&Number.isFinite(n)){const v=Math.min(max,Math.max(min,step===1?Math.round(n):n));change(String(v));update(v)}else change(String(value))}}/>{unit&&<small>{unit}</small>}</div></label>
}
function Button({icon,children,onClick,disabled=false,active=false,kind='',title}:{icon:string;children?:ReactNode;onClick:()=>void;disabled?:boolean;active?:boolean;kind?:string;title?:string}){
  return <button type="button" title={title} aria-label={title} disabled={disabled} aria-pressed={active||undefined} className={kind+' '+(active?'active':'')} onClick={onClick}><Icon name={icon}/>{children}</button>
}
function Panel({title,icon,children,count,initial=true}:{title:string;icon:string;children:ReactNode;count?:number;initial?:boolean}){
  const [open,setOpen]=useState(initial)
  return <section className="panel"><button type="button" className="panel-toggle" aria-expanded={open} onClick={()=>setOpen(!open)}>
    <Icon name={icon}/><span>{title}</span>{count!==undefined&&<em>{count}</em>}<Icon size={14} name={open?'chevron':'right'}/>
  </button>{open&&children}</section>
}
function App(){
  const [history,setHistory]=useState(()=>({past:[] as Project[],current:load(),future:[] as Project[]}))
  const project=history.current
  const [selection,setSelection]=useState<string|null>(()=>project.blocks[0]?.id??null)
  const selected=project.blocks.find(b=>b.id===selection)
  const [tool,setTool]=useState<Tool>('select')
  const [plan,setPlan]=useState(false)
  const [floor,setFloor]=useState(0)
  const [camera,setCamera]=useState<Camera>(home)
  const [layers,setLayers]=useState(initialLayers)
  const [opacity,setOpacity]=useState(1)
  const [draft,setDraft]=useState<Point[]>([])
  const [pointer,setPointer]=useState<Point|null>(null)
  const [preview,setPreview]=useState<Project|null>(null)
  const [menu,setMenu]=useState<'layers'|'settings'|'export'|'help'|'location'|null>(null)
  const [latitude,setLatitude]=useState(String(project.anchor?.lat??52.48))
  const [longitude,setLongitude]=useState(String(project.anchor?.lon??-1.90))
  const [notice,setNotice]=useState('')
  const [saved,setSaved]=useState(true)
  const [snap,setSnap]=useState(true)
  const [size,setSize]=useState(0)
  const canvas=useRef<HTMLCanvasElement>(null)
  const scene=useRef<ReturnType<typeof draw>>({hits:[],handles:[]})
  const drag=useRef<Drag|null>(null)
  const clipboard=useRef<Block|null>(null)
  const totals=development(project)
  const warnings=project.blocks.flatMap(b=>blockStats(b,project).outside?[b.name+' extends beyond the site boundary.']:[])
  if(totals.gia===null)warnings.push('GIA is unavailable where an internal footprint cannot be calculated.')
  if(project.boundary.length<3)warnings.unshift('Draw a site boundary to check containment.')
  const storyCount=Math.max(1,...project.blocks.map(floors))
  useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(project));setSaved(true)}catch{setSaved(false)}},[project])
  useEffect(()=>{if(!notice)return;const id=setTimeout(()=>setNotice(''),4800);return()=>clearTimeout(id)},[notice])
  useLayoutEffect(()=>{
    if(!canvas.current)return
    const ro=new ResizeObserver(()=>setSize(s=>s+1))
    ro.observe(canvas.current)
    return()=>ro.disconnect()
  },[])
  useLayoutEffect(()=>{
    if(canvas.current)scene.current=draw(canvas.current,{camera,plan,floor:Math.min(floor,storyCount-1),project:preview??project,selected:selection,draft,pointer,layers,opacity,editFrontage:tool==='select',editBoundary:tool==='vertices',refresh:()=>setSize(n=>n+1)})
  },[camera,plan,floor,project,preview,selection,draft,pointer,size,layers,opacity,tool])
  function commit(next:Project){
    setHistory(h=>JSON.stringify(next)===JSON.stringify(h.current)?h:{past:[...h.past.slice(-49),h.current],current:next,future:[]})
  }
  function undo(){setHistory(h=>h.past.length?{past:h.past.slice(0,-1),current:h.past.at(-1)!,future:[h.current,...h.future]}:h)}
  function redo(){setHistory(h=>h.future.length?{past:[...h.past,h.current],current:h.future[0],future:h.future.slice(1)}:h)}
  function choose(next:Tool){
    setDraft([]);setNotice('');setTool(next);setMenu(null)
    if(next==='boundary'||next==='house'||next==='apartment'||next==='measure'||next==='vertices'){setPlan(true);setFloor(0)}
  }
  function switchView(next:boolean){setPlan(next);if(!next)setFloor(0);if(draft.length||tool==='vertices')choose('select')}
  function setOption(next:typeof menu){setMenu(m=>m===next?null:next)}
  function updateBlock(block:Block){
    if(!footprintSatisfies(block,project.targets)){setNotice('The frontage and depth must create a valid footprint.');return}
    commit({...project,blocks:project.blocks.map(b=>b.id===block.id?block:b)})
  }
  function finish(){
    if(tool==='boundary'){
      if(!validPolygon(draft)){setNotice('Draw at least three corners without crossing the boundary.');return}
      commit({...project,boundary:draft});setSelection(null)
    }else if(tool==='house'||tool==='apartment'){
      if(draft.length<2){setNotice('Add at least two frontage points.');return}
      const block=newBlock(project,tool,draft)
      if(!footprintSatisfies(block,project.targets)){setNotice(tool==='house'?'Use a frontage of at least 4.5 m and avoid overlapping house segments.':'The frontage creates an invalid footprint. Try a wider turn.');return}
      commit({...project,blocks:[...project.blocks,block]});setSelection(block.id)
    }else return
    choose('select')
  }
  function duplicate(source:Block){
    const {id,name}=newBlock(project,source.type,source.line)
    const next={...source,id,name,line:source.line.map(([x,y]):Point=>[x+8,y+8])}
    commit({...project,blocks:[...project.blocks,next]});setSelection(next.id)
    setNotice(next.name+' created 8 m east and 8 m south.')
  }
  function remove(){
    if(!selected)return
    commit({...project,blocks:project.blocks.filter(b=>b.id!==selected.id)})
    setSelection(null)
  }
  useEffect(()=>{
    const listener=(e:KeyboardEvent)=>{
      const target=e.target as HTMLElement
      if(['INPUT','SELECT','TEXTAREA'].includes(target.tagName))return
      if(e.ctrlKey||e.metaKey){
        if(e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo()}
        if(e.key.toLowerCase()==='y'){e.preventDefault();redo()}
        if(e.key.toLowerCase()==='c'&&selected){clipboard.current=selected;setNotice(selected.name+' copied.')}
        if(e.key.toLowerCase()==='v'&&clipboard.current){e.preventDefault();duplicate(clipboard.current)}
        return
      }
      if(e.key==='Escape'){choose('select');setSelection(null)}
      if(e.key==='Enter'&&target.tagName!=='BUTTON')finish()
      if(e.key.toLowerCase()==='e')choose(selected?'select':'vertices')
      const match=tools.find(t=>t.key.toLowerCase()===e.key.toLowerCase())
      if(match)choose(match.id)
    }
    window.addEventListener('keydown',listener)
    return()=>window.removeEventListener('keydown',listener)
  })
  function viewPoint(event:PointerEvent):Point{
    const rect=canvas.current!.getBoundingClientRect()
    return [event.clientX-rect.left,event.clientY-rect.top]
  }
  function geometry(c:Camera=camera){
    return projection(canvas.current!.clientWidth,canvas.current!.clientHeight,c,plan)
  }
  function worldPoint(screen:Point,c:Camera=camera):Point{
    const p=geometry(c).invert(screen)
    return snap?p.map(n=>Math.round(n*2)/2) as Point:p
  }
  function start(e:PointerEvent<HTMLCanvasElement>){
    if(e.button>2)return
    setMenu(null)
    const screen=viewPoint(e),point=worldPoint(screen)
    const clicked=scene.current.hits.findLast(h=>inside(screen,h.shape))?.id??null
    let action:Drag['action']='draw',id=selection,vertex=-1
    if(e.button!==0||e.shiftKey){action=e.button===2&&!e.shiftKey&&!plan?'orbit':'pan'}
    else if(tool==='move'||tool==='rotate'){id=clicked??selection;action=tool;if(clicked)setSelection(clicked)}
    else if(tool==='select'||tool==='vertices'){
      let distance=12
      scene.current.handles.forEach((handle,i)=>{
        const next=length(screen,handle)
        if(next<distance){distance=next;vertex=i}
      })
      action=vertex>=0?'vertices':'pan'
      if(tool==='vertices')id=null
    }
    drag.current={screen,point,camera,project,id,action,vertex,changed:false}
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function move(e:PointerEvent<HTMLCanvasElement>){
    const screen=viewPoint(e),d=drag.current
    if(draft.length)setPointer(worldPoint(screen))
    if(!d||length(screen,d.screen)<3&&!d.changed)return
    d.changed=true
    const offset=pointDiff(screen,d.screen)
    if(d.action==='orbit')setCamera({...d.camera,angle:d.camera.angle+offset[0]*.008,tilt:Math.min(.94,Math.max(.24,d.camera.tilt+offset[1]*.005))})
    if(d.action==='pan')setCamera({...d.camera,pan:[d.camera.pan[0]+offset[0],d.camera.pan[1]+offset[1]]})
    let point=worldPoint(screen,d.camera)
    if(d.action==='vertices'){
      const origin=d.id?d.project.blocks.find(b=>b.id===d.id)!.line[d.vertex]:d.project.boundary[d.vertex]
      const {invert,project:toScreen}=geometry(d.camera)
      const [x,y]=toScreen(origin)
      point=invert([x+offset[0],y+offset[1]])
      if(snap)point=point.map(n=>Math.round(n*2)/2) as Point
    }
    if(d.action==='vertices'&&d.vertex>=0&&!d.id)setPreview({...d.project,boundary:d.project.boundary.map((p,i)=>i===d.vertex?point:p)})
    if(d.id&&['move','rotate','vertices'].includes(d.action)){
      const delta=pointDiff(point,d.point)
      setPreview({...d.project,blocks:d.project.blocks.map(b=>{
        if(b.id!==d.id)return b
        const [x,y]=b.line[0],angle=offset[0]*.012
        const line=b.line.map(([px,py],i):Point=>{
          if(d.action==='vertices')return i===d.vertex?point:[px,py]
          if(d.action==='move')return [px+delta[0],py+delta[1]]
          return [x+(px-x)*Math.cos(angle)-(py-y)*Math.sin(angle),y+(px-x)*Math.sin(angle)+(py-y)*Math.cos(angle)]
        })
        return {...b,line}
      })})
    }
  }
  function end(e:PointerEvent<HTMLCanvasElement>){
    const d=drag.current;drag.current=null
    if(!d)return
    if(d.changed){
      if(preview){
        if((!preview.boundary.length||validPolygon(preview.boundary))&&preview.blocks.every(b=>footprintSatisfies(b,preview.targets)))commit(preview)
        else setNotice('This edit would create invalid geometry. The previous shape was restored.')
        setPreview(null)
      }
      return
    }
    if(e.button!==0||e.shiftKey)return
    if(d.action==='vertices')return
    if(tool==='vertices'){choose('select');setSelection(null);return}
    if(tool==='select'){setSelection(scene.current.hits.findLast(h=>inside(d.screen,h.shape))?.id??null);return}
    if(['boundary','house','apartment','measure'].includes(tool)){
      if(tool==='measure'&&draft.length===2){setDraft([d.point]);return}
      if(draft.length&&length(draft.at(-1)!,d.point)<.05)return
      setDraft([...draft,d.point])
      setPointer(null)
    }
  }
  function zoom(delta:number){
    setCamera(c=>({...c,zoom:Math.min(4,Math.max(.38,c.zoom*delta))}))
  }
  useEffect(()=>{
    const node=canvas.current
    const wheel=(e:WheelEvent)=>{e.preventDefault();zoom(e.deltaY<0?1.12:1/1.12)}
    node?.addEventListener('wheel',wheel,{passive:false})
    return()=>node?.removeEventListener('wheel',wheel)
  },[])
  function locate(){
    const lat=Number(latitude),lon=Number(longitude)
    if(!latitude.trim()||!longitude.trim()||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>80||Math.abs(lon)>180){
      setNotice('Use a latitude between −80° and 80° and longitude between −180° and 180°.')
      return
    }
    commit({...project,anchor:{lat,lon}});setCamera(home);setMenu(null)
  }
  function download(kind:'csv'|'json'){
    const blob=new Blob([kind==='csv'?csv(project):JSON.stringify(project,null,2)],{type:kind==='csv'?'text/csv;charset=utf-8':'application/json'})
    const url=URL.createObjectURL(blob),a=document.createElement('a')
    a.href=url;a.download='riverside-quarter.'+kind;a.click()
    setTimeout(()=>URL.revokeObjectURL(url),1000)
    setMenu(null)
  }
  const drawTool=['boundary','house','apartment'].includes(tool)
  const actions:Partial<Record<Tool,string>>={boundary:'Click each corner of the redline, then finish to close it.',house:'Click frontage points in order. Houses extend to the right of the drawing direction.',apartment:'Click frontage points in order. The block extends to the right of the drawing direction.',move:'Drag a block to move it across the site.',rotate:'Drag a block left or right to rotate it about its first frontage point.',measure:'Click two points to measure the distance.',vertices:'Drag a vertex to edit the geometry.'}
  const s=selected?blockStats(selected,project):null
  const scale=canvas.current?geometry().s:4
  const scaleMetres=scale*20<65?50:scale*20>150?10:20
  const shownFloor=Math.min(floor,storyCount-1)
  return <div className="app">
    <header className="topbar">
      <div className="breadcrumbs"><span>Projects</span><Icon name="right" size={13}/><strong>Riverside Quarter</strong></div>
      <div className="top-actions">
        <span className="save"><Icon name={saved?'check':'warning'} size={15}/>{saved?'Saved locally':'Save unavailable'}</span>
        <div className="menu-anchor"><Button icon="download" kind="export" onClick={()=>setOption('export')}>Export<Icon name="chevron" size={13}/></Button>
          {menu==='export'&&<div className="popover export-menu"><button onClick={()=>download('csv')}>Development schedule <small>CSV</small></button><button onClick={()=>download('json')}>Project data <small>JSON</small></button></div>}
        </div>
      </div>
    </header>
    <section className="toolbar" aria-label="Design tools">
      <div className="toolset">
        {tools.map((t,i)=><div key={t.id} className={i===4?'tool-divider':''}><Button icon={t.icon} kind="tool" title={t.name+' ('+t.key+')'} active={tool===t.id} onClick={()=>choose(t.id)}>{t.name}</Button></div>)}
        <div className="tool-divider history"><Button icon="undo" kind="square" title="Undo" disabled={!history.past.length} onClick={undo}/><Button icon="redo" kind="square" title="Redo" disabled={!history.future.length} onClick={redo}/></div>
      </div>
      <div className="view-actions">
        <div className="segmented"><Button icon="cube" active={!plan} onClick={()=>switchView(false)}>3D</Button><Button icon="plan" active={plan} onClick={()=>switchView(true)}>Plan</Button></div>
        <div className="menu-anchor">
          <Button icon="layers" title="Layers" kind="layer-button" active={menu==='layers'} onClick={()=>setOption('layers')}/>
          {menu==='layers'&&<div className="popover layers-menu">
            <strong>Display layers</strong>
            {([['context','Sample context'],['trees','Context trees'],['grid','10 m grid'],['labels','Plan labels']] as const).map(([id,label])=><label key={id}><input type="checkbox" checked={layers[id]} onChange={e=>setLayers({...layers,[id]:e.target.checked})}/>{label}</label>)}
            <label className="range">Massing opacity<input aria-label="Massing opacity" type="range" min=".25" max="1" step=".05" value={opacity} onChange={e=>setOpacity(Number(e.target.value))}/></label>
          </div>}
        </div>
      </div>
    </section>
    <main>
      <section className="workspace" aria-label="Site workspace">
        <canvas ref={canvas} aria-label="Interactive site model" className={tool==='select'?'':tool==='move'?'moving':'drawing'}
          onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={()=>{drag.current=null;setPreview(null)}}
          onContextMenu={e=>e.preventDefault()}/>
        <div className="site-location">
          <button className="site-title" type="button" aria-expanded={menu==='location'} onClick={()=>setOption('location')}>
            <span className="map-pin"><Icon name="location" size={16}/></span>
            <span><strong>{project.anchor?'Site location':'Riverside Quarter'}</strong><small>{project.anchor?project.anchor.lat.toFixed(5)+'°, '+project.anchor.lon.toFixed(5)+'°':'Sample site · UK'}</small></span>
            <Icon name="chevron" size={13}/>
          </button>
          {menu==='location'&&<form className="popover location-menu" onSubmit={e=>{e.preventDefault();locate()}}>
            <strong>Map location</strong>
            <label>Latitude <input aria-label="Latitude" inputMode="decimal" value={latitude} onChange={e=>setLatitude(e.target.value)}/></label>
            <label>Longitude <input aria-label="Longitude" inputMode="decimal" value={longitude} onChange={e=>setLongitude(e.target.value)}/></label>
            <p>Changing the map origin retains your drawing in local metres.</p>
            <button type="submit">Go to coordinates</button>
            {project.anchor&&<button type="button" onClick={()=>{const next={...project};delete next.anchor;commit(next);setCamera(home);setMenu(null)}}>Return to sample context</button>}
          </form>}
        </div>
        <div className="map-right">
          <button className="compass" type="button" title="Reset view to north" onClick={()=>setCamera({...home,angle:0})}>
            <span>N</span><i style={{transform:'rotate('+(plan?0:camera.angle)+'rad)'}}/>
          </button>
          <div className="map-controls">
            <Button icon="plus" title="Zoom in" onClick={()=>zoom(1.22)}/>
            <Button icon="minus" title="Zoom out" onClick={()=>zoom(1/1.22)}/>
            <Button icon="target" title="Reset camera" onClick={()=>setCamera(home)}/>
          </div>
        </div>
        {plan&&<label className="floor-picker">Floor <select value={shownFloor} onChange={e=>setFloor(Number(e.target.value))}>
          {Array.from({length:storyCount},(_,i)=><option value={i} key={i}>{i===0?'Ground':i}</option>)}</select></label>}
        {actions[tool]&&<div className="draw-message">
          <span>{tool==='measure'&&draft.length===2?format(length(...draft as [Point,Point]),2)+' m':actions[tool]}</span>
          {drawTool&&<button className="primary" onClick={finish}>Finish</button>}
          <Button icon="close" kind="square" title="Exit tool" onClick={()=>choose('select')}/>
        </div>}
        {notice&&<div className="notice" role="status">{notice}<Button icon="close" kind="square" title="Dismiss" onClick={()=>setNotice('')}/></div>}
        <div className="map-legend"><span><i className="redline"/>Site boundary</span><span><i className="apartment"/>Apartments</span><span><i style={{background:project.colours['3B5P']}}/>Houses</span></div>
        {project.anchor&&<a className="attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>}
        <div className="map-scale"><span>{scaleMetres} m</span><i style={{width:scaleMetres*scale}}/></div>
      </section>
      <aside className="sidebar" aria-label="Project inspector">
        <div className="overview">
          <div className="overline"><span/> DESIGN OPTION</div>
          <div className="heading"><h1>{defaultOption}</h1><div className="menu-anchor"><Button icon="settings" title="Project settings" kind="square settings" active={menu==='settings'} onClick={()=>setOption('settings')}/>
            {menu==='settings'&&<div className="popover settings-menu">
              <strong>House defaults</strong>
              {(['3B5P','3B6P'] as const).map(t=><div className="settings-row" key={t}>
                <NumberField label={t+' target area'} value={project.targets[t]} min={60} max={220} step={.1} unit="m²" update={v=>{
                  const targets={...project.targets,[t]:v}
                  if(project.blocks.every(b=>footprintSatisfies(b,targets)))commit({...project,targets})
                  else setNotice('That target creates overlapping house footprints.')
                }}/>
                <input type="color" aria-label={t+' colour'} value={project.colours[t]} onChange={e=>commit({...project,colours:{...project.colours,[t]:e.target.value}})}/>
              </div>)}
            </div>}</div></div>
          <p>Residential masterplan</p>
          <div className="summary-grid" aria-live="polite">
            <div><span>Homes</span><strong>{format(totals.houses)}</strong></div>
            <div><span>Dwellings per hectare</span><strong>{totals.site ? format(totals.density,1) : '—'} <small>dph</small></strong></div>
            <div><span title="Indicative gross internal area">GIA</span><strong>{totals.gia===null?'—':format(totals.gia)} <small>m²</small></strong></div>
          </div>
          <p className="summary-note">Homes and density count house runs. GIA includes all blocks.</p>
        </div>
        <div className="block-list">
          <div className="section-label">BUILDINGS <span>{project.blocks.length}</span></div>
          {project.blocks.map(b=><button key={b.id} className={'block-row '+(b.id===selection?'selected':'')} onClick={()=>{choose('select');setSelection(b.id);setFloor(0)}}>
            <span className={'block-icon '+b.type}><Icon name={b.type==='house'?'house':'building'} size={16}/></span>
            <span className="block-name"><strong>{b.name}</strong><small>{b.type==='house'?'House run':'Apartment block'}</small></span>
            <span className="storeys">{floors(b)}F</span><Icon name="right" size={13}/>
          </button>)}
          {!project.blocks.length&&<p className="empty">Draw a frontage to add a building.</p>}
        </div>
        {selected&&s&&<Panel title={selected.name+' properties'} icon="settings">
          <div className="properties" key={selected.id}>
            <div className="property-grid">
              {selected.type==='apartment'?<>
                <NumberField label="Building depth" value={selected.depth} min={3} max={80} step={.1} update={depth=>updateBlock({...selected,depth})}/>
                <NumberField label="Storeys" value={selected.floors} min={1} max={30} unit="" update={floors=>{setFloor(f=>Math.min(f,floors-1));updateBlock({...selected,floors})}}/>
                <NumberField label="Ground floor" value={selected.ground} min={2.5} max={12} step={.1} update={ground=>updateBlock({...selected,ground})}/>
                <NumberField label="Upper floors" value={selected.upper} min={2.5} max={12} step={.1} update={upper=>updateBlock({...selected,upper})}/>
              </>:<>
                <label className="field"><span>House type</span><select value={selected.houseType} onChange={e=>updateBlock({...selected,houseType:e.target.value as Block['houseType']})}><option>3B5P</option><option>3B6P</option></select></label>
                <div className="readout"><span>Complete houses</span><strong>{s.houses}</strong></div>
              </>}
              <NumberField label="Ground level" value={selected.level} min={-30} max={60} step={.1} update={level=>updateBlock({...selected,level})}/>
              <div className="readout"><span>Frontage length</span><strong>{format(frontage(selected.line),1)} m</strong></div>
            </div>
            <div className="property-actions">
              {tool==='select'&&<span className="vertex-hint">Drag frontage handles to edit</span>}
              <Button icon="copy" kind="square" title="Duplicate block" onClick={()=>duplicate(selected)}/>
              <Button icon="trash" kind="square" title="Delete block" onClick={remove}/>
            </div>
          </div>
        </Panel>}
        <Panel title="Development statistics" icon="chart">
          <dl className="statistics">
            <div><dt>Site area</dt><dd>{format(totals.site)} m² · {format(totals.site/10000,2)} ha</dd></div>
            <div><dt>External floor area</dt><dd>{format(totals.gross)} m²</dd></div>
            <div><dt>Building footprint</dt><dd>{format(totals.footprint)} m²</dd></div>
            <div><dt>Site coverage</dt><dd>{format(totals.coverage,1)}%</dd></div>
            <div><dt>Usable house area</dt><dd>{format(totals.usable)} m²</dd></div>
          </dl>
          <p className="method">Indicative GIA measures inside external walls and includes internal partitions. External floor area uses the outside footprint.</p>
        </Panel>
        <Panel title="Warnings" icon="warning" count={warnings.length}>
          <div className="warnings">{warnings.length?warnings.map(w=><p key={w}><Icon name="warning" size={14}/>{w}</p>):<p><Icon name="check" size={14}/>All blocks within the site boundary.</p>}</div>
        </Panel>
      </aside>
    </main>
    <footer>
      <div><span className="status-dot"/><strong>{plan?'Plan view':'3D view'}</strong><span className="foot-divider"/><span>Local coordinates · metres</span></div>
      <div><label className="snap"><input type="checkbox" checked={snap} onChange={e=>setSnap(e.target.checked)}/>Snap to 0.5 m</label>
      <span className="foot-divider"/><div className="menu-anchor help"><Button icon="help" title="Workspace help" kind="square" onClick={()=>setOption('help')}/>
        {menu==='help'&&<div className="popover help-menu"><strong>Workspace controls</strong><p>Click a building and drag its frontage handles in either view. Click empty space to finish. Left-drag elsewhere to pan, right-drag to orbit in 3D, and scroll to zoom.</p><p>Use the Boundary tool to redraw the redline. Clear the selection and press <kbd>E</kbd> to edit its vertices.</p><p>Press Enter to finish drawing or Esc to leave a tool. Use Ctrl/Cmd+Z to undo.</p><a href="https://www.openstreetmap.org/#map=15/52.48/-1.90" target="_blank" rel="noreferrer">Open UK map reference ↗</a></div>}
      </div></div>
    </footer>
  </div>
}
createRoot(document.getElementById('root')!).render(<App/>)
