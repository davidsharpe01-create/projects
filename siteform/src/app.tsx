import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Icon } from './icons'
import { blockTypes, blockStoreys, adjustSetback, endDirection, endInset, levels, resizeStoreys, length, footprintSatisfies, footprints, frontage, floors, height, blockStats, development, newBlock, validPolygon, csv, type Block, type BlockType, type Point, type Project } from './model'
import { draw, home, initialLayers, projection, type Camera } from './scene'
import {snapAlong,snapAngle,snapEdges,snapPoint,type SnapGuide} from './snap'
import {blankProject,defaultAddress,isDefaultAddress,restoreProject} from './project'
import './style.css'

type Tool=BlockType|'select'|'boundary'|'move'|'rotate'|'measure'|'vertices'
function isBuildingTool(tool:Tool):tool is BlockType {
  return Object.hasOwn(blockTypes,tool)
}
const tools:{id:Tool;icon:string;name:string}[]=[
  {id:'select',icon:'mouse',name:'Select'},{id:'boundary',icon:'boundary',name:'Boundary'},
  {id:'house',icon:'house',name:'House run'},{id:'apartment',icon:'building',name:'Apartment'},
  {id:'office',icon:'office',name:'Office'},{id:'pbsa',icon:'pbsa',name:'PBSA'},
  {id:'move',icon:'move',name:'Move'},{id:'rotate',icon:'rotate',name:'Rotate'},
  {id:'measure',icon:'ruler',name:'Measure'}
]
const key='siteform.project.v1'
function load():Project {
  try{return restoreProject(localStorage.getItem(key))}
  catch{return blankProject()}
}
const format=(n:number,places=0)=>n.toLocaleString('en-GB',{maximumFractionDigits:places,minimumFractionDigits:places})
const pointDiff=(p:Point,q:Point):Point=>[p[0]-q[0],p[1]-q[1]]
const defaultOption='Base option'
type Drag={screen:Point;point:Point;camera:Camera;project:Project;id:string|null;action:'orbit'|'pan'|'move'|'rotate'|'vertices'|'height'|'setback'|'draw';vertex:number;changed:boolean;last:Point;navigation:boolean;floor:number}

function NumberField({label,value,update,min,max,step=1,unit='m'}:{label:string;value:number;update:(n:number)=>void;min:number;max:number;step?:number;unit?:string}){
  const [draft,change]=useState(String(value))
  useEffect(()=>change(String(value)),[value])
  return <label className="field"><span>{label}</span><div><input type="number" value={draft} min={min} max={max} step={step}
    onChange={e=>change(e.target.value)}
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
  const atDefault=isDefaultAddress(project.anchor)
  const locationTitle=atDefault?defaultAddress.street:project.anchor?'Site location':'Unplaced project'
  const [selection,setSelection]=useState<string|null>(()=>project.blocks[0]?.id??null)
  const selected=project.blocks.find(b=>b.id===selection)
  const [tool,setTool]=useState<Tool>('select')
  const [plan,setPlan]=useState(false)
  const [floor,setFloor]=useState(0)
  const [editFloor,setEditFloor]=useState(0)
  const selectedFloor=Math.min(editFloor,Math.max(0,(selected?.floors??1)-1))
  const [camera,setCamera]=useState<Camera>(home)
  const [layers,setLayers]=useState(initialLayers)
  const [opacity,setOpacity]=useState(1)
  const [draft,setDraft]=useState<Point[]>([])
  const [pointer,setPointer]=useState<Point|null>(null)
  const [preview,setPreview]=useState<Project|null>(null)
  const [menu,setMenu]=useState<'layers'|'settings'|'export'|'help'|'location'|null>(null)
  const [latitude,setLatitude]=useState(String(project.anchor?.lat??defaultAddress.anchor.lat))
  const [longitude,setLongitude]=useState(String(project.anchor?.lon??defaultAddress.anchor.lon))
  const [notice,setNotice]=useState('')
  const [saved,setSaved]=useState(true)
  const [snap,setSnap]=useState(true)
  const [guide,setGuide]=useState<SnapGuide>()
  const edges=useMemo(()=>snapEdges(project,plan?floor:0),[project,plan,floor])
  const setbackEdges=useMemo(()=>selectedFloor?snapEdges(project,selectedFloor):[],[project,selectedFloor])
  const [size,setSize]=useState(0)
  const canvas=useRef<HTMLCanvasElement>(null)
  const scene=useRef<ReturnType<typeof draw>>({pick:()=>null,handles:[],setbackHandles:[],pickFloor:()=>0,heightAt:()=>false})
  const drag=useRef<Drag|null>(null)
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
    if(canvas.current)scene.current=draw(canvas.current,{camera,plan,floor:Math.min(floor,storyCount-1),editFloor:selectedFloor,project:preview??project,selected:selection,draft,pointer,guide,layers,opacity,editFrontage:tool==='select',editBoundary:tool==='vertices',refresh:()=>setSize(n=>n+1)})
  },[camera,plan,floor,selectedFloor,project,preview,selection,draft,pointer,guide,size,layers,opacity,tool])
  function commit(next:Project){
    setHistory(h=>JSON.stringify(next)===JSON.stringify(h.current)?h:{past:[...h.past.slice(-49),h.current],current:next,future:[]})
  }
  function undo(){setHistory(h=>h.past.length?{past:h.past.slice(0,-1),current:h.past.at(-1)!,future:[h.current,...h.future]}:h)}
  function redo(){setHistory(h=>h.future.length?{past:[...h.past,h.current],current:h.future[0],future:h.future.slice(1)}:h)}
  function choose(next:Tool){
    setDraft([]);setGuide(undefined);setNotice('');setTool(next);setMenu(null)
    if(next==='boundary'||isBuildingTool(next)||next==='measure'||next==='vertices'){setPlan(true);setFloor(0)}
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
    }else if(isBuildingTool(tool)){
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
  function viewPoint(event:PointerEvent):Point{
    const rect=canvas.current!.getBoundingClientRect()
    return [event.clientX-rect.left,event.clientY-rect.top]
  }
  function geometry(c:Camera=camera){
    return projection(canvas.current!.clientWidth,canvas.current!.clientHeight,c,plan)
  }
  function drawingPoint(screen:Point){
    const {project:toScreen,invert}=geometry()
    const point=invert(screen)
    const anchor=draft.at(-1)
    const result=snap?snapPoint(point,edges,toScreen,anchor?[anchor]:[]):{point,guide:undefined}
    setGuide(result.guide)
    return result.point
  }
  function start(e:PointerEvent<HTMLCanvasElement>){
    if(e.button!==0&&e.button!==1)return
    if(e.button===1)e.preventDefault()
    setMenu(null)
    const screen=viewPoint(e),point=geometry().invert(screen)
    const clicked=scene.current.pick(screen)
    let action:Drag['action']='draw',id=selection,vertex=-1
    if(e.button===1){action=plan?'pan':'orbit'}
    else if(tool==='move'||tool==='rotate'){id=clicked??selection;action=tool;if(clicked)setSelection(clicked)}
    else if(tool==='select'||tool==='vertices'){
      let distance=12
      const {handles,setbackHandles}=scene.current
      const grips=setbackHandles.length?setbackHandles:handles
      grips.forEach((handle,i)=>{
        const next=length(screen,handle)
        if(next<distance){distance=next;vertex=i}
      })
      action=vertex>=0?(setbackHandles.length?'setback':'vertices'):scene.current.heightAt(screen)?'height':'pan'
      if(tool==='vertices')id=null
    }
    drag.current={screen,point,camera,project,id,action,vertex,changed:false,last:screen,navigation:e.button===1,floor:selectedFloor}
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function move(e:PointerEvent<HTMLCanvasElement>){
    const screen=viewPoint(e),d=drag.current
    if(drawTool||tool==='measure'){
      if(!(e.buttons&4))setPointer(drawingPoint(screen))
    }
    if(d&&(e.buttons&4)){
      d.navigation=true
      setGuide(undefined)
      const navigation=plan||(e.buttons&1)?'pan':'orbit'
      if(d.action!==navigation){
        d.screen=d.last
        d.camera=camera
        d.action=navigation
        d.changed=true
        setPreview(null)
      }
    }else if(d&&(d.action==='orbit'||d.action==='pan')&&d.navigation){
      d.last=screen
      return
    }
    if(d)d.last=screen
    e.currentTarget.style.cursor=(d?d.action==='height':scene.current.heightAt(screen))?'ns-resize':''
    if(!d||length(screen,d.screen)<3&&!d.changed)return
    d.changed=true
    const offset=pointDiff(screen,d.screen)
    if(d.action==='height'){
      const pixelsPerMetre=geometry(d.camera).s*Math.sqrt(1-d.camera.tilt**2)
      setPreview({...d.project,blocks:d.project.blocks.map(b=>{
        if(b.id!==d.id)return b
        const delta=Math.round(-offset[1]/(pixelsPerMetre*b.upper))
        const floors=Math.min(blockStoreys.max,Math.max(blockStoreys.min,b.floors+delta))
        return resizeStoreys(b,floors)
      })})
      return
    }
    if(d.action==='setback'){
      const block=d.project.blocks.find(b=>b.id===d.id)
      if(!block)return
      const {project:toScreen}=geometry(d.camera)
      const direction=endDirection(block,d.vertex)
      const [x,y]=pointDiff(toScreen(direction),toScreen([0,0]))
      const squared=x*x+y*y
      if(squared<.0625)return
      const movement=(offset[0]*x+offset[1]*y)/squared
      const step=snap?.5:0
      const origin=d.vertex?block.line.at(-1)!:block.line[0]
      const inset=endInset(block,d.floor)[d.vertex]
      const start:Point=[origin[0]+direction[0]*inset,origin[1]+direction[1]*inset]
      const match=snap?snapAlong(start,direction,movement,setbackEdges.filter(edge=>edge.block!==block.id),toScreen):undefined
      const delta=match?.movement??(step?Math.round(movement/step)*step:movement)
      const updated=adjustSetback(block,d.project.targets,d.floor,d.vertex,delta,match?0:step)
      const applied=endInset(updated,d.floor)[d.vertex]-inset
      const heights=levels(block)
      const level=block.level+(heights[d.floor-1]+heights[d.floor])/2
      setGuide(match&&Math.abs(applied-delta)<1e-6?{...match.guide,level}:undefined)
      setPreview({...d.project,blocks:d.project.blocks.map(b=>b===block?updated:b)})
      return
    }
    if(d.action==='orbit'){
      const pivot:Point=[canvas.current!.clientWidth/2,canvas.current!.clientHeight/2]
      const anchor=geometry(d.camera).invert(pivot)
      const next={...d.camera,angle:d.camera.angle+offset[0]*.008,tilt:Math.min(.94,Math.max(.24,d.camera.tilt+offset[1]*.005))}
      const [dx,dy]=pointDiff(pivot,geometry(next).project(anchor))
      setCamera({...next,pan:[next.pan[0]+dx,next.pan[1]+dy]})
    }
    if(d.action==='pan')setCamera({...d.camera,pan:[d.camera.pan[0]+offset[0],d.camera.pan[1]+offset[1]]})
    if(d.action!=='vertices'&&d.action!=='move'&&d.action!=='rotate')return
    const {project:toScreen,invert}=geometry(d.camera)
    const block=d.project.blocks.find(b=>b.id===d.id)
    const references=edges.filter(edge=>block?edge.block!==block.id:edge.source!=='boundary')
    const level=plan?0:block?.level??0
    if(d.action==='vertices'){
      const line=block?.line??d.project.boundary
      const origin=line[d.vertex]
      const [x,y]=toScreen(origin)
      const raw=invert([x+offset[0],y+offset[1]])
      const anchors=[line[d.vertex-1]??(!block?line.at(-1):undefined),line[d.vertex+1]??(!block?line[0]:undefined)].filter((p):p is Point=>!!p)
      const result=snap?snapPoint(raw,references,toScreen,anchors):{point:raw,guide:undefined}
      setGuide(result.guide&&{...result.guide,level})
      const updated=line.map((p,i)=>i===d.vertex?result.point:p)
      setPreview(block?{...d.project,blocks:d.project.blocks.map(b=>b===block?{...b,line:updated}:b)}:{...d.project,boundary:updated})
      return
    }
    if(!block)return
    let line:Point[]
    if(d.action==='move'){
      let delta=pointDiff(invert(screen),d.point)
      let guide:SnapGuide|undefined
      if(snap){
        let best=Infinity,anchor:Point|undefined
        for(const [x,y] of footprints(block,d.project.targets).flat()){
          const raw:Point=[x+delta[0],y+delta[1]]
          const target=snapPoint(raw,references,toScreen).guide
          if(!target)continue
          const dist=length(toScreen(raw),toScreen(target.point))
          if(dist<best){best=dist;guide=target;anchor=[x,y]}
        }
        if(guide&&anchor)delta=pointDiff(guide.point,anchor)
        else delta=delta.map(n=>Math.round(n*2)/2) as Point
      }
      setGuide(guide&&{...guide,level})
      line=block.line.map(([x,y])=>[x+delta[0],y+delta[1]])
    }else{
      const [x,y]=block.line[0],other=block.line[1]
      const heading=Math.atan2(other[1]-y,other[0]-x)
      const raw=offset[0]*.012
      const match=snap?snapAngle(heading+raw,references):undefined
      const angle=match?match.angle-heading:raw
      line=block.line.map(([px,py])=>[x+(px-x)*Math.cos(angle)-(py-y)*Math.sin(angle),y+(px-x)*Math.sin(angle)+(py-y)*Math.cos(angle)])
      setGuide(match&&{...match,point:line[1],anchor:line[0],level})
    }
    setPreview({...d.project,blocks:d.project.blocks.map(b=>b===block?{...b,line}:b)})
  }
  function end(e:PointerEvent<HTMLCanvasElement>){
    const d=drag.current;drag.current=null
    if(!d)return
    setGuide(undefined)
    if(d.changed){
      if(preview){
        if((!preview.boundary.length||validPolygon(preview.boundary))&&preview.blocks.every(b=>footprintSatisfies(b,preview.targets)))commit(preview)
        else setNotice('This edit would create invalid geometry. The previous shape was restored.')
        setPreview(null)
      }
      return
    }
    if(e.button!==0||d.navigation)return
    if(d.action==='vertices'||d.action==='setback')return
    if(d.action==='height'&&!scene.current.pick(d.screen))return
    if(tool==='vertices'){choose('select');setSelection(null);return}
    if(tool==='select'){
      setSelection(scene.current.pick(d.screen))
      setEditFloor(plan?0:scene.current.pickFloor(d.screen))
      return
    }
    if(drawTool||tool==='measure'){
      const point=drawingPoint(d.screen)
      setGuide(undefined)
      if(tool==='measure'&&draft.length===2){setDraft([point]);return}
      if(draft.length&&length(draft.at(-1)!,point)<.05)return
      setDraft([...draft,point])
      setPointer(null)
    }
  }
  function zoom(delta:number,anchor?:Point){
    setCamera(c=>{
      const zoom=Math.min(4,Math.max(Math.min(.38,c.zoom),c.zoom*delta))
      if(!anchor)return {...c,zoom}
      const ratio=zoom/c.zoom
      const origin=projection(canvas.current!.clientWidth,canvas.current!.clientHeight,c,false).project([0,0])
      return {...c,zoom,pan:[c.pan[0]+(anchor[0]-origin[0])*(1-ratio),c.pan[1]+(anchor[1]-origin[1])*(1-ratio)]}
    })
  }
  function fitModel(){
    const node=canvas.current!
    const {clientWidth:w,clientHeight:h}=node
    const base:Camera={...camera,zoom:1,pan:[0,0]}
    const model=projection(w,h,base,plan)
    const points=project.boundary.map(p=>model.project(p))
    project.blocks.forEach(b=>footprints(b,project.targets).forEach(poly=>poly.forEach(p=>{
      points.push(model.project(p,plan?0:b.level),model.project(p,plan?0:b.level+height(b)))
    })))
    if(!points.length){setCamera(home);return}
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1])
    const l=Math.min(...xs),r=Math.max(...xs),t=Math.min(...ys),b=Math.max(...ys)
    const zoom=Math.min(4,(w*.81)/Math.max(1,r-l),(h*.76)/Math.max(1,b-t))
    const [x,y]=model.project([0,0])
    setCamera({...base,zoom,pan:[w/2-x-((l+r)/2-x)*zoom,h/2-y-((t+b)/2-y)*zoom]})
  }
  useEffect(()=>{
    const node=canvas.current
    const wheel=(e:WheelEvent)=>{
      e.preventDefault()
      if(!e.deltaY)return
      const rect=node!.getBoundingClientRect()
      zoom(e.deltaY<0?1.12:1/1.12,[e.clientX-rect.left,e.clientY-rect.top])
    }
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
    a.href=url;a.download='masterplan.'+kind;a.click()
    setTimeout(()=>URL.revokeObjectURL(url),1000)
    setMenu(null)
  }
  const drawTool=tool==='boundary'||isBuildingTool(tool)
  const frontageHint='Click frontage points in order. The block extends to the right of the drawing direction.'
  const actions:Partial<Record<Tool,string>>={boundary:'Click each corner of the redline, then finish to close it.',house:'Click frontage points in order. Houses extend to the right of the drawing direction.',apartment:frontageHint,office:frontageHint,pbsa:frontageHint,move:'Drag a block to move it across the site.',rotate:'Drag a block left or right to rotate it about its first frontage point.',measure:'Click two points to measure the distance.',vertices:'Drag a vertex to edit the geometry.'}
  const s=selected?blockStats(selected,project):null
  const scale=canvas.current?geometry().s:4
  const scaleMetres=scale*20<65?50:scale*20>150?10:20
  const shownFloor=Math.min(floor,storyCount-1)
  return <div className="app">
    <header className="topbar">
      <div className="breadcrumbs"><span>Projects</span><Icon name="right" size={13}/><strong>{locationTitle}</strong></div>
      <div className="top-actions">
        <span className="save"><Icon name={saved?'check':'warning'} size={15}/>{saved?'Saved locally':'Save unavailable'}</span>
        <div className="menu-anchor"><Button icon="download" kind="export" onClick={()=>setOption('export')}>Export<Icon name="chevron" size={13}/></Button>
          {menu==='export'&&<div className="popover export-menu"><button onClick={()=>download('csv')}>Development schedule <small>CSV</small></button><button onClick={()=>download('json')}>Project data <small>JSON</small></button></div>}
        </div>
      </div>
    </header>
    <section className="toolbar" aria-label="Design tools">
      <div className="toolset">
        {tools.map(t=><div key={t.id} className={t.id==='move'?'tool-divider':''}><Button icon={t.icon} kind="tool" title={t.name} active={tool===t.id} onClick={()=>choose(t.id)}>{t.name}</Button></div>)}
        <div className="tool-divider history"><Button icon="undo" kind="square" title="Undo" disabled={!history.past.length} onClick={undo}/><Button icon="redo" kind="square" title="Redo" disabled={!history.future.length} onClick={redo}/></div>
      </div>
      <div className="view-actions">
        <div className="segmented"><Button icon="cube" active={!plan} onClick={()=>switchView(false)}>3D</Button><Button icon="plan" active={plan} onClick={()=>switchView(true)}>Plan</Button></div>
        <div className="menu-anchor">
          <Button icon="layers" title="Layers" kind="layer-button" active={menu==='layers'} onClick={()=>setOption('layers')}/>
          {menu==='layers'&&<div className="popover layers-menu">
            <strong>Display layers</strong>
            {([['map','Street map'],['grid','10 m grid'],['labels','Plan labels']] as const).filter(([id])=>id!=='map'||project.anchor).map(([id,label])=><label key={id}><input type="checkbox" checked={layers[id]} onChange={e=>setLayers({...layers,[id]:e.target.checked})}/>{label}</label>)}
            <label className="range">Massing opacity<input aria-label="Massing opacity" type="range" min=".25" max="1" step=".05" value={opacity} onChange={e=>setOpacity(Number(e.target.value))}/></label>
          </div>}
        </div>
      </div>
    </section>
    <main>
      <section className="workspace" aria-label="Site workspace">
        <canvas ref={canvas} aria-label="Interactive site model" className={tool==='select'?'':tool==='move'?'moving':'drawing'}
          onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={()=>{drag.current=null;setPreview(null);setGuide(undefined)}} onPointerLeave={()=>{if(!drag.current)setGuide(undefined)}}
          onAuxClick={e=>{if(e.button===1)e.preventDefault()}}/>
        <div className="site-location">
          <button className="site-title" type="button" aria-expanded={menu==='location'} onClick={()=>setOption('location')}>
            <span className="map-pin"><Icon name="location" size={16}/></span>
            <span><strong>{locationTitle}</strong><small>{atDefault?defaultAddress.locality:project.anchor?project.anchor.lat.toFixed(5)+'°, '+project.anchor.lon.toFixed(5)+'°':'Set a map location'}</small></span>
            <Icon name="chevron" size={13}/>
          </button>
          {menu==='location'&&<form className="popover location-menu" onSubmit={e=>{e.preventDefault();locate()}}>
            <strong>Map location</strong>
            <label>Latitude <input aria-label="Latitude" inputMode="decimal" value={latitude} onChange={e=>setLatitude(e.target.value)}/></label>
            <label>Longitude <input aria-label="Longitude" inputMode="decimal" value={longitude} onChange={e=>setLongitude(e.target.value)}/></label>
            <p>Changing the map origin retains your drawing in local metres.</p>
            <button type="submit">Go to coordinates</button>
            {!atDefault&&<button type="button" onClick={()=>{
              const anchor={...defaultAddress.anchor}
              setLatitude(String(anchor.lat));setLongitude(String(anchor.lon))
              commit({...project,anchor});setCamera(home);setMenu(null)
            }}>Use Bradford Street coordinates</button>}
          </form>}
        </div>
        <div className="map-right">
          <button className="compass" type="button" title="Reset view to north" onClick={()=>setCamera({...home,angle:0})}>
            <span>N</span><i style={{transform:'rotate('+(plan?0:camera.angle)+'rad)'}}/>
          </button>
          <div className="map-controls">
            <Button icon="plus" title="Zoom in" onClick={()=>zoom(1.22)}/>
            <Button icon="minus" title="Zoom out" onClick={()=>zoom(1/1.22)}/>
            <Button icon="target" title="Fit model" onClick={fitModel}/>
          </div>
        </div>
        {plan&&<label className="floor-picker">Floor <select value={shownFloor} onChange={e=>setFloor(Number(e.target.value))}>
          {Array.from({length:storyCount},(_,i)=><option value={i} key={i}>{i===0?'Ground':i}</option>)}</select></label>}
        {actions[tool]&&<div className="draw-message">
          <span>{tool==='measure'&&draft.length===2?format(length(...draft as [Point,Point]),2)+' m':actions[tool]}</span>
          {drawTool&&<button className="primary" onClick={finish}>Finish</button>}
          {tool==='boundary'&&!draft.length&&project.boundary.length>0&&<button className="primary" onClick={()=>{setSelection(null);choose('vertices')}}>Edit boundary</button>}
          <Button icon="close" kind="square" title="Exit tool" onClick={()=>choose('select')}/>
        </div>}
        {notice&&<div className="notice" role="status">{notice}<Button icon="close" kind="square" title="Dismiss" onClick={()=>setNotice('')}/></div>}
        <div className="map-legend"><span><i className="redline"/>Site boundary</span>{(['apartment','house','office','pbsa'] as const).filter(type=>project.blocks.some(b=>b.type===type)).map(type=>
          <span key={type}><i className={type} style={type==='house'?{background:project.colours['3B5P']}:undefined}/>{blockTypes[type].legend}</span>)}</div>
        {project.anchor&&layers.map&&<a className="attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>}
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
          <p>Site masterplan</p>
          <div className="summary-grid" aria-live="polite">
            <div><span>Homes</span><strong>{format(totals.houses)}</strong></div>
            <div><span>Dwellings per hectare</span><strong>{totals.site ? format(totals.density,1) : '—'} <small>dph</small></strong></div>
            <div><span title="Indicative gross internal area">GIA</span><strong>{totals.gia===null?'—':format(totals.gia)} <small>m²</small></strong></div>
          </div>
          <p className="summary-note">Homes and density count house runs. GIA includes all blocks.</p>
        </div>
        <div className="block-list">
          <div className="section-label">BUILDINGS <span>{project.blocks.length}</span></div>
          {project.blocks.map(b=><button key={b.id} className={'block-row '+(b.id===selection?'selected':'')} onClick={()=>{choose('select');setSelection(b.id);setFloor(0);setEditFloor(0)}}>
            <span className={'block-icon '+b.type}><Icon name={b.type==='apartment'?'building':b.type} size={16}/></span>
            <span className="block-name"><strong>{b.name}</strong><small>{blockTypes[b.type].label}</small></span>
            <span className="storeys">{floors(b)}F</span><Icon name="right" size={13}/>
          </button>)}
          {!project.blocks.length&&<p className="empty">Draw a frontage to add a building.</p>}
        </div>
        {selected&&s&&<Panel title={selected.name+' properties'} icon="settings">
          <div className="properties" key={selected.id}>
            <div className="property-grid">
              {selected.type!=='house'?<>
                <NumberField label="Building depth" value={selected.depth} min={3} max={80} step={.1} update={depth=>updateBlock({...selected,depth})}/>
                <NumberField label="Storeys" value={selected.floors} min={blockStoreys.min} max={blockStoreys.max} unit="" update={floors=>{setFloor(f=>Math.min(f,floors-1));setEditFloor(f=>Math.min(f,floors-1));updateBlock(resizeStoreys(selected,floors))}}/>
                <NumberField label="Ground floor" value={selected.ground} min={2.5} max={12} step={.1} update={ground=>updateBlock({...selected,ground})}/>
                <NumberField label="Upper floors" value={selected.upper} min={2.5} max={12} step={.1} update={upper=>updateBlock({...selected,upper})}/>
              </>:<>
                <label className="field"><span>House type</span><select value={selected.houseType} onChange={e=>updateBlock({...selected,houseType:e.target.value as Block['houseType']})}><option>3B5P</option><option>3B6P</option></select></label>
                <div className="readout"><span>Complete houses</span><strong>{s.houses}</strong></div>
              </>}
              <NumberField label="Ground level" value={selected.level} min={-30} max={60} step={.1} update={level=>updateBlock({...selected,level})}/>
              <div className="readout"><span>Frontage length</span><strong>{format(frontage(selected.line),1)} m</strong></div>
            </div>
            {!plan&&tool==='select'&&selected.type!=='house'&&selected.floors>1&&
              <label className="field setback-picker"><span>Setback floor</span>
                <select value={selectedFloor} onChange={e=>setEditFloor(Number(e.target.value))}>
                  {Array.from({length:selected.floors},(_,i)=><option key={i} value={i}>{i===0?'Ground':`Floor ${i}`}</option>)}
                </select>
              </label>}
            <div className="property-actions">
              {tool==='select'&&<span className="vertex-hint">{!plan&&selected.type!=='house'?(selectedFloor?'Drag either blue end handle':'Select an upper floor for setbacks'):'Drag frontage handles to edit'}</span>}
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
      <div><label className="snap"><input type="checkbox" checked={snap} onChange={e=>{setSnap(e.target.checked);setGuide(undefined)}}/>Snapping</label>
      <span className="foot-divider"/><div className="menu-anchor help"><Button icon="help" title="Workspace help" kind="square" onClick={()=>setOption('help')}/>
        {menu==='help'&&<div className="popover help-menu"><strong>Workspace controls</strong><p>Middle-drag to orbit in 3D. Left-drag away from editing handles to pan in Select. Hold both the middle and left buttons to pan while using another tool. In Plan, middle-drag also pans. Scroll to zoom around the cursor. Snapping follows building and boundary edges, aligns angles, and uses a 0.5 m grid elsewhere.</p><p>Left-click a building to select it. Drag its frontage handles or drag a selected apartment roof to change its storeys. Click empty space to finish.</p><p>Use Boundary → Edit boundary to adjust the redline. Use the toolbar to undo or redo and the block properties to duplicate or delete.</p><a href="https://www.openstreetmap.org/#map=19/52.4749/-1.889077" target="_blank" rel="noreferrer">Open UK map reference ↗</a></div>}
      </div></div>
    </footer>
  </div>
}
createRoot(document.getElementById('root')!).render(<App/>)
