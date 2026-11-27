import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Icon } from './icons'
import { blockTypes, blockStoreys, adjustSetback, editGroundFrontage, endDirection, endInset, levels, resizeStoreys, length, footprintSatisfies, footprints, frontage, floors, height, blockStats, development, newBlock, validPolygon, csv, houseFrontage, houseStoreys, defaultHouseHeights, minimumDwellingStoreyHeight, type HouseStoreys, type Block, type BlockType, type Point, type Project } from './model'
import { draw, fitCamera, home, initialLayers, projection, type Camera, type LegendEntry } from './scene'
import {snapAlong,snapAngle,snapEdges,snapPoint,type SnapGuide} from './snap'
import {loadAerial,mapboxToken,type AerialTile} from './aerial'
import {loadContext,emptyContext,type ContextData} from './context'
import {defaultAddress,isDefaultAddress,siteLocation} from './project'
import {SiteWorkspace,saveSite,type Site} from './sites'
import {SchedulePage} from './schedule'
import {apartmentLayout,apartmentSettings,areaTarget,defaultApartmentOptions,type ApartmentOptions} from './apartment'
import {dwellingTypes,ndss,ndssVersion} from './ndss'
import './style.css'

type Tool=BlockType|'select'|'boundary'|'move'|'rotate'|'measure'|'vertices'|'ghost'|'show'
function isBuildingTool(tool:Tool):tool is BlockType {
  return Object.hasOwn(blockTypes,tool)
}
const tools:{id:Tool;icon:string;name:string}[]=[
  {id:'select',icon:'mouse',name:'Select'},{id:'boundary',icon:'boundary',name:'Boundary'},
  {id:'house',icon:'house',name:blockTypes.house.label},{id:'apartment',icon:'building',name:'Apartment'},
  {id:'office',icon:'office',name:'Office'},{id:'pbsa',icon:'pbsa',name:'PBSA'},
  {id:'move',icon:'move',name:'Move'},{id:'rotate',icon:'rotate',name:'Rotate'},
  {id:'measure',icon:'ruler',name:'Measure'}
]
const format=(n:number,places=0)=>n.toLocaleString('en-GB',{maximumFractionDigits:places,minimumFractionDigits:places})
const pointDiff=(p:Point,q:Point):Point=>[p[0]-q[0],p[1]-q[1]]
type Drag={screen:Point;point:Point;camera:Camera;project:Project;id:string|null;action:'orbit'|'pan'|'move'|'rotate'|'vertices'|'height'|'setback'|'draw';vertex:number;changed:boolean;last:Point;navigation:boolean;floor:number}

function NumberField({label,value,update,min,max,step=1,unit='m'}:{label:string;value:number;update:(n:number)=>void|boolean;min:number;max?:number;step?:number;unit?:string}){
  const [draft,change]=useState(String(value))
  useEffect(()=>change(String(value)),[value])
  return <label className="field"><span>{label}</span><div><input type="number" value={draft} min={min} max={max} step={step}
    onChange={e=>change(e.target.value)}
    onBlur={()=>{const n=Number(draft);if(draft.trim()&&Number.isFinite(n)){const v=Math.min(max??Infinity,Math.max(min,step===1?Math.round(n):n));change(String(update(v)===false?value:v))}else change(String(value))}}/>{unit&&<small>{unit}</small>}</div></label>
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
function App({site,close,onSaved}:{site:Site;close:()=>void;onSaved:(site:Site)=>void}){
  const [history,setHistory]=useState(()=>({past:[] as Project[],current:site.project,future:[] as Project[]}))
  const project=history.current
  const [showSchedule,setShowSchedule]=useState(false)
  const [showInspector,setShowInspector]=useState(false)
  const atDefault=isDefaultAddress(project.anchor)
  const location=siteLocation(project)
  const [selection,setSelection]=useState<string|null>(null)
  const selected=project.blocks.find(b=>b.id===selection)
  const [drawHouseStoreys,setDrawHouseStoreys]=useState<HouseStoreys>(3)
  const houseHeights=project.houseHeights??defaultHouseHeights
  const [tool,setTool]=useState<Tool>('select')
  const [plan,setPlan]=useState(false)
  const [floor,setFloor]=useState(0)
  const [revealedBlock,setRevealedBlock]=useState<string|null>(null)
  const showFloorplates=!!selected&&revealedBlock===selected.id
  const [editFloor,setEditFloor]=useState(0)
  const selectedFloor=Math.min(editFloor,Math.max(0,(selected?.floors??1)-1))
  const [camera,setCamera]=useState<Camera>(home)
  const [layers,setLayers]=useState(initialLayers)
  const stackView=!plan&&(showFloorplates||layers.floorplates)
  const [ghosted,setGhosted]=useState<Set<number>>(()=>new Set())
  useEffect(()=>setGhosted(new Set()),[project.anchor])
  const [nearby,setNearby]=useState<{anchor:Project['anchor'];data:ContextData;status:'loading'|'ready'|'unavailable'}>()
  const [contextAttempt,retryContext]=useState(0)
  const {anchor}=project
  const showContext=layers.context||layers.streets
  const contextStatus=nearby&&nearby.anchor?.lat===anchor?.lat&&nearby.anchor?.lon===anchor?.lon?nearby:undefined
  useEffect(()=>{
    if(!showContext||!anchor)return
    const controller=new AbortController()
    setNearby({anchor,data:emptyContext,status:'loading'})
    loadContext(anchor,controller.signal).then(data=>{
      if(!controller.signal.aborted){setNearby({anchor,data,status:'ready'});setGhosted(new Set())}
    }).catch(()=>{
      if(!controller.signal.aborted)setNearby({anchor,data:emptyContext,status:'unavailable'})
    })
    return()=>controller.abort()
  },[showContext,anchor,contextAttempt])
  const [imagery,setImagery]=useState<{anchor:NonNullable<Project['anchor']>;tiles:AerialTile[];status:'loading'|'ready'|'unavailable'}>()
  const aerial=layers.aerial&&imagery?.anchor===anchor?imagery:undefined
  useEffect(()=>{
    if(!layers.aerial||!anchor||!mapboxToken)return
    const controller=new AbortController()
    let tiles:AerialTile[]=[]
    setImagery({anchor,tiles,status:'loading'})
    loadAerial(anchor,controller.signal).then(result=>{
      if(controller.signal.aborted){result.forEach(tile=>tile.image.close());return}
      tiles=result
      setImagery({anchor,tiles,status:tiles.length?'ready':'unavailable'})
    })
    return()=>{
      controller.abort()
      tiles.forEach(tile=>tile.image.close())
    }
  },[layers.aerial,anchor,contextAttempt])
  const [opacity,setOpacity]=useState(1)
  const [draft,setDraft]=useState<Point[]>([])
  const [pointer,setPointer]=useState<Point|null>(null)
  const [preview,setPreview]=useState<Project|null>(null)
  const [menu,setMenu]=useState<'layers'|'export'|'help'|'location'|'draw'|'tools'|null>(null)
  const [latitude,setLatitude]=useState(String(project.anchor?.lat??defaultAddress.anchor.lat))
  const [longitude,setLongitude]=useState(String(project.anchor?.lon??defaultAddress.anchor.lon))
  const [notice,setNotice]=useState('')
  const [stored,setStored]=useState(site.project)
  const [saveError,setSaveError]=useState('')
  const [retry,setRetry]=useState(0)
  const [saving,setSaving]=useState(false)
  const saved=stored===project&&!saving
  const persisted=useRef(site.project)
  const lastSave=useRef(Promise.resolve())
  const revision=useRef(site.revision)
  const [snap,setSnap]=useState(true)
  const [guide,setGuide]=useState<SnapGuide>()
  const edges=useMemo(()=>snapEdges(project,plan?floor:0),[project,plan,floor])
  const setbackEdges=useMemo(()=>selectedFloor?snapEdges(project,selectedFloor):[],[project,selectedFloor])
  const [size,setSize]=useState(0)
  const canvas=useRef<HTMLCanvasElement>(null)
  const [legend,setLegend]=useState<LegendEntry[]>([])
  const scene=useRef<ReturnType<typeof draw>>({legend:[],pick:()=>null,pickContext:()=>undefined,pickGhost:()=>undefined,handles:[],setbackHandles:[],pickFloor:()=>0,heightAt:()=>false})
  const drag=useRef<Drag|null>(null)
  const touches=useRef(new Map<number,Point>())
  const pinch=useRef<{camera:Camera;centre:Point;distance:number;angle:number}|null>(null)
  const drawingClick=useRef<Point|null>(null)
  const totals=useMemo(()=>development(project),[project])
  const settings=apartmentSettings(project)
  const selectedLayout=selected?apartmentLayout(selected,project):undefined
  const selectedUnits=selectedLayout?.ok?selectedLayout.floors.flatMap(f=>f.units):[]
  const summary=useMemo(()=>selected?development({...project,blocks:[selected]}):totals,[selected,project,totals])
  const storyCount=Math.max(1,...project.blocks.map(floors))
  const reportSave=useEffectEvent((savedSite:Site)=>onSaved(savedSite))
  useEffect(()=>{
    let active=true
    setSaving(true)
    setSaveError('')
    lastSave.current=lastSave.current.then(async()=>{
      if(!active)return
      try{
        if(project!==persisted.current){
          const receipt=await saveSite(site.id,revision.current,project)
          revision.current=receipt.revision
          persisted.current=project
          reportSave({...site,...receipt,project})
          setStored(project)
        }
      }catch(error){
        if(active)setSaveError(error instanceof Error?error.message:'Cloud save failed.')
      }finally{
        if(active)setSaving(false)
      }
    })
    return()=>{active=false}
  },[project,site,retry])
  useEffect(()=>{
    if(saved&&!saveError)return
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''}
    window.addEventListener('beforeunload',warn)
    return()=>window.removeEventListener('beforeunload',warn)
  },[saved,saveError])
  useLayoutEffect(()=>{if(canvas.current&&site.project.boundary.length)fitModel()},[])
  useEffect(()=>{if(!notice)return;const id=setTimeout(()=>setNotice(''),4800);return()=>clearTimeout(id)},[notice])
  useLayoutEffect(()=>{
    if(!canvas.current)return
    const ro=new ResizeObserver(()=>setSize(s=>s+1))
    ro.observe(canvas.current)
    return()=>ro.disconnect()
  },[])
  useLayoutEffect(()=>{
    if(!canvas.current)return
    scene.current=draw(canvas.current,{showFloorplates,camera,plan,floor:Math.min(floor,storyCount-1),editFloor:selectedFloor,project:preview??project,selected:selection,draft,pointer,guide,layers,opacity,editFrontage:tool==='select',drawBuilding:isBuildingTool(tool),editBoundary:tool==='vertices',context:contextStatus?.data??emptyContext,aerial:aerial?.tiles??[],ghosted})
    const entries=scene.current.legend
    setLegend(previous=>previous.length===entries.length&&previous.every((item,i)=>
      item.label===entries[i].label&&item.colour===entries[i].colour&&item.outline===entries[i].outline)?previous:entries)
  },[showFloorplates,camera,plan,floor,selectedFloor,project,preview,selection,draft,pointer,guide,size,layers,opacity,tool,contextStatus,aerial,ghosted])
  function commit(next:Project,trimUpper=false){
    for(const block of next.blocks){
      const layout=apartmentLayout(block,next)
      if(!layout||layout.ok)continue
      const truncated=trimUpper&&layout.floor!==undefined&&layout.floor>0?resizeStoreys(block,layout.floor):null
      if(truncated&&apartmentLayout(truncated,next)?.ok){
        next={...next,blocks:next.blocks.map(b=>b===block?truncated:b)}
        setNotice(block.name+' · Floor '+layout.floor+' and above removed. '+layout.reason)
      }else{
        setNotice(block.name+' · '+layout.reason)
        return false
      }
    }
    setHistory(h=>JSON.stringify(next)===JSON.stringify(h.current)?h:{past:[...h.past.slice(-49),h.current],current:next,future:[]})
    return true
  }
  function undo(){setHistory(h=>h.past.length?{past:h.past.slice(0,-1),current:h.past.at(-1)!,future:[h.current,...h.future]}:h)}
  function redo(){setHistory(h=>h.future.length?{past:[...h.past,h.current],current:h.future[0],future:h.future.slice(1)}:h)}
  function choose(next:Tool){
    setDraft([]);setGuide(undefined);setNotice('');setTool(next);setMenu(null)
    if(next!=='select')setEditFloor(0)
    if(next==='boundary'||isBuildingTool(next)||next==='measure'||next==='vertices')setFloor(0)
  }
  function switchView(next:boolean,focusFloor?:number){
    setPlan(next)
    if(focusFloor!==undefined)setFloor(focusFloor)
    else if(!showFloorplates)setFloor(next?selectedFloor:0)
    if(draft.length||tool==='vertices')choose('select')
  }
  function setOption(next:typeof menu){setMenu(m=>m===next?null:next)}
  function updateBlock(block:Block){
    if(!footprintSatisfies(block,project.targets)){setNotice('The frontage and depth must create a valid footprint.');return false}
    return commit({...project,blocks:project.blocks.map(b=>b.id===block.id?block:b)})
  }
  function subdivide(block:Block){
    const mode=block.depth<14?'single':'double'
    if(commit({...project,blocks:project.blocks.map(b=>b===block?{...b,apartmentLayout:{...defaultApartmentOptions,mode,mix:{...settings.mix}}}:b)})){
      if(!plan){setRevealedBlock(block.id);setFloor(0)}
    }
  }
  function updateLayout(block:Block,options:Partial<ApartmentOptions>){
    return updateBlock({...block,apartmentLayout:{...block.apartmentLayout!,...options}})
  }
  function finish(){
    if(tool==='boundary'){
      if(!validPolygon(draft)){setNotice('Draw at least three corners without crossing the boundary.');return}
      commit({...project,boundary:draft});setSelection(null)
    }else if(isBuildingTool(tool)){
      if(draft.length<2){setNotice('Add at least two frontage points.');return}
      const block=newBlock(project,tool,draft)
      if(tool==='house')block.floors=drawHouseStoreys
      if(!footprintSatisfies(block,project.targets)){setNotice(tool==='house'?'Use a frontage of at least '+houseFrontage(drawHouseStoreys)+' m and avoid overlapping house segments.':'The frontage creates an invalid footprint. Try a wider turn.');return}
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
    if(commit({...project,blocks:project.blocks.filter(b=>b.id!==selected.id)}))setSelection(null)
  }
  const deleteFromKeyboard=useEffectEvent((event:KeyboardEvent)=>{
    if(showSchedule)return
    if(event.key!=='Delete'&&event.key!=='Backspace')return
    if(event.defaultPrevented||event.repeat||event.isComposing||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return
    if(!selected||drag.current||menu||(tool!=='select'&&tool!=='move'&&tool!=='rotate'))return
    const target=event.target
    if(target instanceof HTMLElement&&(target.isContentEditable||target.closest('input, textarea, select, [role="textbox"], [role="spinbutton"]')))return
    event.preventDefault()
    remove()
  })
  useEffect(()=>{
    const onKeyDown=(event:KeyboardEvent)=>deleteFromKeyboard(event)
    window.addEventListener('keydown',onKeyDown)
    return()=>window.removeEventListener('keydown',onKeyDown)
  },[])
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
  function navigationAction(buttons:number){
    const pan=(buttons&1)!==0&&(buttons&2)===0
    return plan||pan?'pan':'orbit'
  }
  function touchPair(){
    const [a,b]=touches.current.values()
    if(!b)return
    return {centre:[(a[0]+b[0])/2,(a[1]+b[1])/2] as Point,distance:Math.max(1,length(a,b)),angle:Math.atan2(b[1]-a[1],b[0]-a[0])}
  }
  function releaseTouch(e:PointerEvent<HTMLCanvasElement>){
    if(e.pointerType!=='touch')return false
    touches.current.delete(e.pointerId)
    if(!pinch.current)return false
    if(!touches.current.size)pinch.current=null
    else if(touches.current.size>=2)pinch.current={camera,...touchPair()!}
    return true
  }
  function start(e:PointerEvent<HTMLCanvasElement>){
    drawingClick.current=null
    if(e.pointerType==='touch'){
      touches.current.set(e.pointerId,viewPoint(e))
      if(touches.current.size>1||pinch.current){
        e.currentTarget.setPointerCapture(e.pointerId)
        if(touches.current.size===2)pinch.current={camera,...touchPair()!}
        drag.current=null
        setPreview(null)
        setGuide(undefined)
        setPointer(null)
        return
      }
    }
    if(e.button>2)return
    if(e.button!==0)e.preventDefault()
    setMenu(null)
    const screen=viewPoint(e),point=geometry().invert(screen)
    const clicked=scene.current.pick(screen)
    let action:Drag['action']='draw',id=selection,vertex=-1
    if(e.button!==0){action=navigationAction(e.buttons)}
    else if(tool==='ghost'||tool==='show')action=e.pointerType==='touch'?'draw':navigationAction(e.buttons)
    else if(tool==='move'||tool==='rotate'){id=clicked??selection;action=tool;if(clicked)setSelection(clicked)}
    else if(tool==='select'||tool==='vertices'){
      let distance=12
      const {handles,setbackHandles}=scene.current
      const grips=setbackHandles.length?setbackHandles:handles
      grips.forEach((handle,i)=>{
        const next=length(screen,handle)
        if(next<distance){distance=next;vertex=i}
      })
      action=vertex>=0?(setbackHandles.length?'setback':'vertices'):scene.current.heightAt(screen)?'height':e.pointerType==='touch'?'draw':navigationAction(e.buttons)
      if(tool==='vertices')id=null
    }
    drag.current={screen,point,camera,project,id,action,vertex,changed:false,last:screen,navigation:e.button!==0,floor:selectedFloor}
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function move(e:PointerEvent<HTMLCanvasElement>){
    const screen=viewPoint(e)
    if(e.pointerType==='touch'&&touches.current.has(e.pointerId)){
      touches.current.set(e.pointerId,screen)
      if(pinch.current){
        const pair=touchPair(),initial=pinch.current
        if(pair)setCamera(zoomCamera(initial.camera,pair.distance/initial.distance,initial.centre,pair.centre,plan?0:pair.angle-initial.angle))
        return
      }
    }
    const d=drag.current
    if(drawTool||tool==='measure'){
      if(!(e.buttons&6))setPointer(drawingPoint(screen))
    }
    if(d&&(e.buttons&6)){
      d.navigation=true
      setGuide(undefined)
      const navigation=navigationAction(e.buttons)
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
      const updatedOrigin=d.vertex?updated.line.at(-1)!:updated.line[0]
      const [dx,dy]=pointDiff(updatedOrigin,origin)
      const applied=dx*direction[0]+dy*direction[1]+endInset(updated,d.floor)[d.vertex]-inset
      const heights=levels(block)
      const level=plan?0:block.level+(stackView?heights[d.floor]:(heights[d.floor-1]+heights[d.floor])/2)
      setGuide(match&&Math.abs(applied-delta)<1e-6?{...match.guide,level}:undefined)
      setPreview({...d.project,blocks:d.project.blocks.map(b=>b===block?updated:b)})
      return
    }
    if(d.action==='orbit'){
      const pivot:Point=[canvas.current!.clientWidth/2,canvas.current!.clientHeight/2]
      const anchor=geometry(d.camera).invert(pivot)
      const next={...d.camera,angle:d.camera.angle-offset[0]*.004,tilt:Math.min(.94,Math.max(.24,d.camera.tilt+offset[1]*.0025))}
      const [dx,dy]=pointDiff(pivot,geometry(next).project(anchor))
      setCamera({...next,pan:[next.pan[0]+dx,next.pan[1]+dy]})
    }
    if(d.action==='pan')setCamera({...d.camera,pan:[d.camera.pan[0]+offset[0],d.camera.pan[1]+offset[1]]})
    if(d.action!=='vertices'&&d.action!=='move'&&d.action!=='rotate')return
    const {project:toScreen,invert}=geometry(d.camera)
    const block=d.project.blocks.find(b=>b.id===d.id)
    const references=edges.filter(edge=>!block||edge.block!==block.id)
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
      setPreview(block?{...d.project,blocks:d.project.blocks.map(b=>b===block?editGroundFrontage(b,updated):b)}:{...d.project,boundary:updated})
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
    if(releaseTouch(e))return
    const d=drag.current;drag.current=null
    if(!d)return
    setGuide(undefined)
    if(d.changed){
      if(preview){
        if((!preview.boundary.length||validPolygon(preview.boundary))&&preview.blocks.every(b=>footprintSatisfies(b,preview.targets)))commit(preview,d.action==='setback')
        else setNotice('This edit would create invalid geometry. The previous shape was restored.')
        setPreview(null)
      }
      return
    }
    if(e.button!==0||d.navigation)return
    if(tool==='select'){drawingClick.current=d.screen;return}
    if(d.action==='vertices'||d.action==='setback')return
    if(d.action==='height'&&!scene.current.pick(d.screen))return
    if(tool==='ghost'||tool==='show'){
      const hiding=tool==='ghost'
      const index=hiding?scene.current.pickContext(d.screen):scene.current.pickGhost(d.screen)
      if(index!==undefined)setGhosted(previous=>{
        const next=new Set(previous)
        if(hiding)next.add(index)
        else next.delete(index)
        return next
      })
      return
    }
    if(tool==='vertices'){choose('select');setSelection(null);return}
    if(drawTool)drawingClick.current=d.screen
    else if(tool==='measure')placePoint(d.screen)
  }
  function placePoint(screen:Point){
    const point=drawingPoint(screen)
    setGuide(undefined)
    if(tool==='measure'&&draft.length===2){setDraft([point]);return}
    if(draft.length&&length(draft.at(-1)!,point)<.05)return
    setDraft([...draft,point])
    setPointer(null)
  }
  function chooseFloor(next:number){
    setEditFloor(next)
    if(plan||stackView)setFloor(next)
  }
  function revealBlock(id:string|null){
    setSelection(id)
    setRevealedBlock(id)
  }
  function clickCanvas(e:MouseEvent<HTMLCanvasElement>){
    const screen=drawingClick.current
    drawingClick.current=null
    if(!screen)return
    if(tool==='select'){
      const handle=scene.current.handles.some(p=>length(p,screen)<12)||scene.current.setbackHandles.some(p=>length(p,screen)<12)
      if(handle)return
      const hit=scene.current.pick(screen)
      const block=project.blocks.find(b=>b.id===hit)
      const hitFloor=block&&block.type!=='house'?(plan?shownFloor:scene.current.pickFloor(screen)):0
      revealBlock(hit)
      setEditFloor(hitFloor)
      if(hit&&!plan)setFloor(hit===selection&&stackView?hitFloor:0)
      return
    }
    if(!drawTool)return
    // The first click already placed the final vertex.
    if(e.detail===2)finish()
    else if(e.detail<2)placePoint(screen)
  }
  function zoomCamera(c:Camera,delta:number,anchor?:Point,destination=anchor,twist=0):Camera{
    const zoom=Math.min(4,Math.max(Math.min(.38,c.zoom),c.zoom*delta))
    const next={...c,zoom,angle:c.angle+twist}
    if(!anchor||!destination)return next
    const {clientWidth:w,clientHeight:h}=canvas.current!
    // Plan uses the same anchor transform when there is no twist.
    const world=projection(w,h,c,false).invert(anchor)
    const screen=projection(w,h,next,false).project(world)
    return {...next,pan:[c.pan[0]+destination[0]-screen[0],c.pan[1]+destination[1]-screen[1]]}
  }
  function zoom(delta:number,anchor?:Point){
    setCamera(c=>zoomCamera(c,delta,anchor))
  }
  function fitModel(){
    const {clientWidth,clientHeight}=canvas.current!
    setCamera(fitCamera(clientWidth,clientHeight,camera,plan,project))
  }
  useEffect(()=>{
    const node=canvas.current
    const wheel=(e:WheelEvent)=>{
      e.preventDefault()
      if(!e.deltaY)return
      const rect=node!.getBoundingClientRect()
      const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?node!.clientHeight:1)
      const factor=Math.exp(-Math.max(-180,Math.min(180,pixels))*.002)
      zoom(factor,[e.clientX-rect.left,e.clientY-rect.top])
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
  const frontageHint='Click along the frontage. Double-click the last point to finish. The block extends to the right.'
  const actions:Partial<Record<Tool,string>>={boundary:'Click each boundary corner. Double-click the last corner to finish.',house:'Click along the frontage. Double-click the last point to finish. Houses extend to the right.',apartment:frontageHint,office:frontageHint,pbsa:frontageHint,move:'Drag a block to move it across the site.',rotate:'Drag a block left or right to rotate it about its first frontage point.',measure:'Click two points to measure the distance.',vertices:'Drag a vertex to edit the geometry.',ghost:'Click an existing building to ghost it.',show:'Click a dotted building to show it.'}
  const s=selected?blockStats(selected,project):null
  const scale=canvas.current?geometry().s:4
  const scaleMetres=scale*20<65?50:scale*20>150?10:20
  const shownFloor=Math.min(floor,storyCount-1)
  return <>
  <div className={showSchedule?"app schedule-hidden-model":"app"} inert={showSchedule}>
    <header className="topbar">
        <div className="editor-site">
        <Button icon="right" kind="back-to-sites" onClick={()=>{
          if(saved&&!saveError||saveError&&window.confirm('Return to Sites and leave unsaved changes behind?'))close()
        }} disabled={!saved&&!saveError}>Sites</Button>
        <div className="site-location">
          <button className="site-title" type="button" aria-expanded={menu==='location'} onClick={()=>setOption('location')}>
            <span><strong>{site.name}</strong><small>{location?location.lat.toFixed(5)+'°, '+location.lon.toFixed(5)+'°':'Set map origin and draw redline'}</small></span>
            <Icon name="chevron" size={13}/>
          </button>
          {menu==='location'&&<form className="popover location-menu" onSubmit={e=>{e.preventDefault();locate()}}>
            <strong>Map origin</strong>
            <label>Latitude <input aria-label="Latitude" inputMode="decimal" value={latitude} onChange={e=>setLatitude(e.target.value)}/></label>
            <label>Longitude <input aria-label="Longitude" inputMode="decimal" value={longitude} onChange={e=>setLongitude(e.target.value)}/></label>
            <p>The redline determines the site location. Changing the map origin moves the drawing to new coordinates.</p>
            <button type="submit">Go to coordinates</button>
            {!atDefault&&<button type="button" onClick={()=>{
              const anchor={...defaultAddress.anchor}
              setLatitude(String(anchor.lat));setLongitude(String(anchor.lon))
              commit({...project,anchor});setCamera(home);setMenu(null)
            }}>Use Bradford Street coordinates</button>}
          </form>}
        </div></div>
      <div className="top-actions">
        {saveError?<button className="save" title={saveError} onClick={()=>setRetry(count=>count+1)}><Icon name="warning" size={15}/>Retry save</button>:
          <span className="save" role="status"><Icon name={saved?'check':'download'} size={15}/>{saved?'Saved to cloud':'Saving…'}</span>}
        <Button icon="chart" kind="open-schedule" title="Schedule" onClick={()=>{setMenu(null);setShowSchedule(true)}}>Schedule</Button>
        <div className="menu-anchor"><Button icon="download" kind="export" title="Export" onClick={()=>setOption('export')}>Export<Icon name="chevron" size={13}/></Button>
          {menu==='export'&&<div className="popover export-menu"><button onClick={()=>download('csv')}>Development schedule <small>CSV</small></button><button onClick={()=>download('json')}>Project data <small>JSON</small></button></div>}
        </div>
      </div>
    </header>
    <section className="toolbar" aria-label="Design tools">
      <div className="toolset">
        {tools.slice(0,2).map(t=><Button key={t.id} icon={t.icon} kind={t.id==="boundary"||t.id==="measure"?"tool":"tool building-tool"} title={t.name} active={tool===t.id||(t.id==='boundary'&&tool==='vertices')} onClick={()=>choose(t.id)}><span>{t.name}</span></Button>)}
        <div className="menu-anchor compact-tools">
          <Button icon="building" kind="tool building-tool" title="Draw building" active={isBuildingTool(tool)} onClick={()=>setOption('draw')}>
            <span>{isBuildingTool(tool)?tools.find(t=>t.id===tool)?.name:'Draw building'}</span><Icon name="chevron" size={13}/>
          </Button>
          {menu==='draw'&&<div className="popover tool-menu">
            {tools.filter(t=>isBuildingTool(t.id)).map(t=><Button key={t.id} icon={t.icon} kind="menu-tool" onClick={()=>choose(t.id)}>{t.name}</Button>)}
          </div>}
        </div>
        <div className="menu-anchor compact-tools">
          <Button icon="settings" kind="tool building-tool" title="Edit tools" active={['move','rotate','measure'].includes(tool)} onClick={()=>setOption('tools')}><span>Tools</span><Icon name="chevron" size={13}/></Button>
          {menu==='tools'&&<div className="popover tool-menu">
            {tools.filter(t=>['move','rotate','measure'].includes(t.id)).map(t=><Button key={t.id} icon={t.icon} kind="menu-tool" onClick={()=>choose(t.id)}>{t.name}</Button>)}
          </div>}
        </div>
        <div className="desktop-tools">
          {tools.slice(2).map(t=><div key={t.id} className={t.id==='move'?'tool-divider':undefined}>
            <Button icon={t.icon} kind={t.id==="boundary"||t.id==="measure"?"tool":"tool building-tool"} title={t.name} active={tool===t.id} onClick={()=>choose(t.id)}><span>{t.name}</span></Button>
          </div>)}
        </div>
        <Button icon="ghost" kind="tool ghost-tool" title="Ghost existing buildings" active={tool==='ghost'}
          disabled={!layers.context||!contextStatus?.data.buildings.length} onClick={()=>choose(tool==='ghost'?'select':'ghost')}>
          <span>Ghost</span>
        </Button>
        <div className="tool-divider history"><Button icon="undo" kind="square" title="Undo" disabled={!history.past.length} onClick={undo}/><Button icon="redo" kind="square" title="Redo" disabled={!history.future.length} onClick={redo}/></div>
      </div>
      <div className="view-actions">
        <div className="segmented"><Button icon="cube" active={!plan} onClick={()=>switchView(false)}>3D</Button><Button icon="plan" active={plan} onClick={()=>switchView(true)}>Plan</Button></div>
        <div className="menu-anchor">
          <Button icon="layers" title="Layers" kind="layer-button" active={menu==='layers'} onClick={()=>setOption('layers')}/>
          {menu==='layers'&&<div className="popover layers-menu">
            <strong>Display layers</strong>
            {([['context','Existing buildings'],['aerial','Aerial imagery'],['streets','Street names'],['travel','Travel distances'],['floorplates','All floorplates'],['grid','10 m grid']] as const).filter(([id])=>id==='aerial'?!!(anchor&&mapboxToken):id!=='context'&&id!=='streets'||!!anchor).map(([id,label])=><label key={id}><input type="checkbox" checked={layers[id]} onChange={e=>{
              if(id==='aerial'&&!e.target.checked)setImagery(undefined)
              setLayers({...layers,[id]:e.target.checked})
              if(id==='context'&&!e.target.checked&&(tool==='ghost'||tool==='show'))choose('select')
            }}/>{label}</label>)}
            {ghosted.size>0&&<button type="button" onClick={()=>setGhosted(new Set())}>Restore all existing buildings</button>}
            <label className="range">Massing opacity<input aria-label="Massing opacity" type="range" min=".25" max="1" step=".05" value={opacity} onChange={e=>setOpacity(Number(e.target.value))}/></label>
          </div>}
        </div>
      </div>
    </section>
    <main className="model-layout">
      <section className="workspace" aria-label="Site workspace">
        <canvas ref={canvas} aria-label="Interactive site model" className={tool==='select'?'':tool==='move'?'moving':'drawing'}
          onPointerDown={start} onPointerMove={move} onPointerUp={end} onClick={clickCanvas} onPointerCancel={e=>{if(releaseTouch(e))return;drag.current=null;setPreview(null);setGuide(undefined)}} onPointerLeave={()=>{if(!drag.current)setGuide(undefined)}}
          onAuxClick={e=>{if(e.button===1)e.preventDefault()}} onContextMenu={e=>e.preventDefault()}/>
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
        {plan&&<label className="floor-picker">Floor
          <select value={shownFloor} onChange={e=>{
            const next=Number(e.target.value)
            setFloor(next)
            setEditFloor(selected&&selected.type!=='house'&&next<floors(selected)?next:0)
          }}>
            {Array.from({length:storyCount},(_,i)=><option key={i} value={i}>{i===0?'Ground':i}</option>)}
          </select>
        </label>}
        {actions[tool]&&<div className="draw-message">
          <span>{tool==='measure'&&draft.length===2?format(length(...draft as [Point,Point]),2)+' m':actions[tool]}</span>
          {tool==='house'&&<label className="house-storeys">Storeys <select value={drawHouseStoreys} onChange={e=>setDrawHouseStoreys(Number(e.target.value) as HouseStoreys)}><option value={2}>2 · 5.5 m</option><option value={3}>3 · 4.5 m</option></select></label>}
          {drawTool&&<button className="primary" onClick={finish}>Finish</button>}
          {tool==='ghost'&&ghosted.size>0&&<button className="primary" onClick={()=>choose('show')}>Show</button>}
          {tool==='show'&&<button className="primary" onClick={()=>choose('ghost')}>Ghost</button>}
          {tool==='boundary'&&!draft.length&&project.boundary.length>0&&<button className="primary" onClick={()=>{setSelection(null);choose('vertices')}}>Edit boundary</button>}
          <Button icon="close" kind="square" title="Exit tool" onClick={()=>choose('select')}/>
        </div>}
        {notice&&<div className="notice" role="status">{notice}<Button icon="close" kind="square" title="Dismiss" onClick={()=>setNotice('')}/></div>}
        {legend.length>0&&<div className="map-legend" aria-label="Map key">
          {legend.map(({label,colour,outline})=><span key={label}>
            <i style={outline?{borderColor:colour,borderStyle:'solid',borderWidth:1}:{background:colour}}/>{label}
          </span>)}
        </div>}
        {anchor&&(showContext||aerial)&&<>
          {showContext&&(contextStatus?.status!=='ready'||!(layers.context&&contextStatus.data.buildings.length||layers.streets&&contextStatus.data.streetNames.length))
            ?<div className="context-status" role="status">
              {contextStatus?.status==='unavailable'?<>Map context unavailable <button type="button" onClick={()=>retryContext(n=>n+1)}>Retry</button></>:
                contextStatus?.status==='ready'?'No map context found':'Loading map context…'}
            </div>:null}
          {aerial?.status==='unavailable'&&<div className="aerial-status" role="status">Aerial imagery unavailable <button type="button" onClick={()=>retryContext(n=>n+1)}>Retry</button></div>}
          {(aerial?.tiles.length||layers.context&&contextStatus?.data.provider==='mapbox')?<a className="mapbox-logo" href="https://www.mapbox.com/" target="_blank" rel="noreferrer"><img src="./mapbox-logo.svg" alt="Mapbox"/></a>:null}
          <div className="attribution" title="Indicative building heights">
            {showContext&&<><a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a>
            {' · '}<a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">© OpenMapTiles</a>{' · '}</>}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
            {(aerial?.tiles.length||layers.context&&contextStatus?.data.provider==='mapbox')?<>
              {' · '}<a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noreferrer">© Mapbox</a>
              {!!aerial?.tiles.length&&<>{' · '}<a href="https://www.maxar.com/" target="_blank" rel="noreferrer">© Maxar</a></>}
              {' · '}<a href={`https://apps.mapbox.com/feedback/#/${anchor.lon}/${anchor.lat}/17`} target="_blank" rel="noreferrer">Improve this map</a>
            </>:null}
          </div>
        </>}
        <div className="map-scale"><span>{scaleMetres} m</span><i style={{width:scaleMetres*scale}}/></div>
      </section>
      <aside className={'sidebar'+(showInspector?' inspector-expanded':'')} aria-label="Project inspector">
        <div className="overview">
          <div className="heading"><div className="overview-title"><h1>{selected?.name??'Overview'}</h1>{selected&&<p className="block-typology">{blockTypes[selected.type].label}{selectedLayout?.ok&&selectedLayout.hrb?' (HRB)':''}</p>}</div>{selected&&<button type="button" className="secondary" onClick={()=>{choose('select');revealBlock(null);setEditFloor(0)}}>Clear selection</button>}
            <button type="button" className="inspector-toggle" aria-expanded={showInspector} aria-controls="inspector-details" aria-label={showInspector?'Collapse overview':'Expand overview'} onClick={()=>setShowInspector(!showInspector)}><Icon name="chevron" size={16}/></button>
          </div>
          <div className="summary-grid" aria-live="polite">
            <div><span>Homes</span><strong>{summary.homes===null?'—':format(summary.homes)}</strong></div>
            {selected?<div><span>GIA</span><strong>{summary.gia===null?'—':format(summary.gia)} <small>m²</small></strong></div>:
              <div><span title="Dwellings per hectare">Density</span><strong>{totals.site&&totals.density!==null?format(totals.density,1):'—'} <small>dph</small></strong></div>}
            <div title="Level 1 and above: net dwelling area ÷ gross internal area of modelled houses and subdivided apartment blocks">
              <span>Efficiency (L1+)</span><strong>{summary.efficiency===null?'—':format(summary.efficiency,1)+'%'}</strong><small>NIA / GIA</small>
            </div>
          </div>
        </div>
        <div className="inspector-details" id="inspector-details">
          <div className="overview-details">
          {(!selected||selected.type==='house'||selected.type==='apartment')&&<p className="summary-note">{format(summary.houses)} houses · {summary.estimatedApartments===null?'Apartment estimate unavailable':format(summary.estimatedApartments??0)+' estimated apartments'}{summary.generatedApartments>0?' · '+format(summary.generatedApartments)+' subdivided apartments':''}</p>}
          {(!selected||selected.type==='apartment'&&!selectedLayout?.ok)&&<div className="yield-setting">
            <NumberField label="Apartment GIA per home" value={totals.apartmentAreaPerHome} min={1} step={.1} unit="m²"
              update={apartmentAreaPerHome=>{
                if(apartmentAreaPerHome!==totals.apartmentAreaPerHome)commit({...project,apartmentAreaPerHome})
              }}/>
          </div>}
          {!selected&&<><h2 className="gia-heading">GIA by use</h2>
          <dl className="gia-breakdown" aria-live="polite">
            {(['house','apartment','office','pbsa'] as const).map(type=><div key={type}>
              <dt>{blockTypes[type].legend}</dt>
              <dd>{totals.giaByUse[type]===null?'—':format(totals.giaByUse[type])+' m²'}</dd>
            </div>)}
          </dl></>}
        </div>
        {selected&&s&&<Panel title={selected.name+' properties'} icon="settings">
          <div className="properties" key={selected.id}>
            <div className="property-grid">
              {selected.type!=='house'?<>
                <NumberField label="Building depth" value={selected.depth} min={3} max={80} step={.1} update={depth=>updateBlock({...selected,depth})}/>
                <NumberField label="Storeys" value={selected.floors} min={blockStoreys.min} max={blockStoreys.max} unit="" update={floors=>{if(!updateBlock(resizeStoreys(selected,floors)))return false;setFloor(f=>Math.min(f,floors-1));setEditFloor(f=>Math.min(f,floors-1))}}/>
                <NumberField label="Ground floor height" value={selected.ground} min={selected.type==='apartment'?minimumDwellingStoreyHeight:2.5} max={12} step={.1} update={ground=>updateBlock({...selected,ground})}/>
                <NumberField label="Upper floor height" value={selected.upper} min={selected.type==='apartment'?minimumDwellingStoreyHeight:2.5} max={12} step={.1} update={upper=>updateBlock({...selected,upper})}/>
              </>:<>
                <label className="field"><span>House storeys</span><select value={houseStoreys(selected)} onChange={e=>{
                  const storeys=Number(e.target.value) as HouseStoreys
                  const block={...selected,floors:storeys}
                  if(!footprintSatisfies(block,project.targets)){
                    setNotice('A '+storeys+'-storey house needs at least '+houseFrontage(storeys)+' m frontage and a footprint without overlaps.')
                    return
                  }
                  updateBlock(block)
                }}><option value={2}>2 · 5.5 m frontage</option><option value={3}>3 · 4.5 m frontage</option></select></label>
                <label className="field"><span>House type</span><select value={selected.houseType} onChange={e=>updateBlock({...selected,houseType:e.target.value as Block['houseType']})}><option>3B5P</option><option>3B6P</option></select></label>
                <div className="readout"><span>Complete houses</span><strong>{s.houses}</strong></div>
              </>}
              <NumberField label="Ground level" value={selected.level} min={-30} max={60} step={.1} update={level=>updateBlock({...selected,level})}/>
              <div className="readout"><span>Frontage length</span><strong>{format(frontage(selected.line),1)} m</strong></div>
            </div>
            {tool==='select'&&selected.type!=='house'&&selected.floors>1&&
              <label className={'field setback-picker'+(selectedFloor?' editing':'')}><span>Setback floor</span>
                <select value={selectedFloor} onChange={e=>chooseFloor(Number(e.target.value))}>
                  {Array.from({length:selected.floors},(_,i)=><option key={i} value={i}>{i===0?'Ground':`Floor ${i}`}</option>)}
                </select>
              </label>}
            {selected.type==='apartment'&&<div className="subdivision">
              {selected.apartmentLayout?<>
                <div className="subdivision-actions">
                  <button type="button" className="secondary" onClick={()=>switchView(true,stackView?Math.min(floor,floors(selected)-1):selectedFloor)}>View apartment plan</button>
                  <button type="button" className="secondary" onClick={()=>updateBlock({...selected,apartmentLayout:undefined})}>Remove subdivision</button>
                </div>
                <p className="summary-note">{selectedUnits.length} apartments · {selectedUnits.filter(u=>u.area+1e-7>=u.target).length} meet target area</p>
                <div className="property-grid">
                  <label className="field"><span>Corridor layout</span><select value={selected.apartmentLayout.mode} onChange={e=>updateLayout(selected,{mode:e.target.value as ApartmentOptions['mode']})}><option value="single">Single-loaded</option><option value="double">Double-loaded</option></select></label>
                  {selectedLayout?.ok&&selectedLayout.cornerCores?<p className="summary-note">Cores are placed automatically at inside corners.</p>:<>
                  <label className="field"><span>Core side</span><select value={selected.apartmentLayout.coreSide} onChange={e=>updateLayout(selected,{coreSide:e.target.value as ApartmentOptions['coreSide']})}><option value="front">Front</option><option value="rear">Rear</option></select></label>
                  <NumberField label="Core position" value={selected.apartmentLayout.corePosition??50} min={0} max={100} unit="%" update={corePosition=>updateLayout(selected,{corePosition})}/>
                  </>}
                  {selectedLayout?.ok&&selectedLayout.hrb&&<label className="field"><span>Higher-risk core</span><select value={selected.apartmentLayout.hrbCores} onChange={e=>updateLayout(selected,{hrbCores:Number(e.target.value) as 1|2})}><option value={1}>1 × 70 m²</option><option value={2}>2 × 50 m²</option></select></label>}
                  <NumberField label="Ground floor commercial" value={selected.apartmentLayout.commercial??0} min={0} max={100-(selected.apartmentLayout.communal??0)} unit="%" update={commercial=>updateLayout(selected,{commercial})}/>
                  <NumberField label="Ground floor communal" value={selected.apartmentLayout.communal??0} min={0} max={100-(selected.apartmentLayout.commercial??0)} unit="%" update={communal=>updateLayout(selected,{communal})}/>
                </div>
                <p className="summary-note">Ground floor uses are shares of the bays after core and corridor space. Homes count complete units.</p>
                <button type="button" className="secondary" onClick={()=>updateLayout(selected,{mix:{...settings.mix}})}>Apply target mix to this block</button>
              </>:<button type="button" className="primary" onClick={()=>subdivide(selected)}>Subdivide into apartments</button>}
            </div>}
            <div className="property-actions">
              {tool==='select'&&<span className="vertex-hint">{selectedFloor?'Drag either end to adjust this floor':selected.type!=='house'&&selected.floors>1?'Drag ground handles or click an upper floor for setbacks':'Drag frontage handles to edit'}</span>}
              <Button icon="copy" kind="square" title="Duplicate block" onClick={()=>duplicate(selected)}/>
              <Button icon="trash" kind="square" title="Delete block" onClick={remove}/>
            </div>
          </div>
        </Panel>}
        <Panel title="Dwelling types" icon="settings" initial={false}>
          <section className="properties dwelling-settings" aria-labelledby="apartment-types">
            <h3 id="apartment-types">Apartment types</h3>
            <div className="property-grid">
              <NumberField label="Clear corridor width" value={settings.corridor} min={1} step={.1} update={corridor=>commit({...project,apartmentSettings:{...settings,corridor}})}/>
              <NumberField label="Non-HRB travel limit" value={settings.nonHrbTravel} min={1} step={.1} update={nonHrbTravel=>commit({...project,apartmentSettings:{...settings,nonHrbTravel}})}/>
              <NumberField label="HRB travel limit" value={settings.hrbTravel} min={1} step={.1} update={hrbTravel=>commit({...project,apartmentSettings:{...settings,hrbTravel}})}/>
              <NumberField label="Between cores limit" value={settings.betweenCoreTravel} min={1} step={.1} update={betweenCoreTravel=>commit({...project,apartmentSettings:{...settings,betweenCoreTravel}})}/>
              {settings.frontages.map((value,i)=><NumberField key={i} label={`Min frontage · ${i+1} bed`} value={value} min={1} step={.1} update={next=>{
                const frontages=[...settings.frontages] as typeof settings.frontages
                frontages[i]=next
                commit({...project,apartmentSettings:{...settings,frontages}})
              }}/>)}
            </div>
            <table className="mix-table"><thead><tr><th>Type</th><th>Target mix</th><th>Target area</th><th>Actual</th></tr></thead>
              <tbody>{dwellingTypes.map(type=><tr key={type}><th scope="row"><label className="dwelling-colour">
                <input type="color" aria-label={type+' apartment colour'} value={settings.colours?.[type]??ndss[type].colour}
                  onChange={e=>commit({...project,apartmentSettings:{...settings,colours:{...settings.colours,[type]:e.target.value}}})}/>{type}
              </label></th>
                <td><NumberField label={type+' mix'} value={settings.mix[type]} min={0} max={100} unit="%" update={value=>commit({...project,apartmentSettings:{...settings,mix:{...settings.mix,[type]:value}}})}/></td>
                <td>{type==='3B5P'||type==='3B6P'?<span>{format(areaTarget(type,project),1)} m²</span>:
                  <NumberField label={type+' apartment target area'} value={areaTarget(type,project)} min={ndss[type].areas[0]} step={.1} unit="m²" update={value=>
                    commit({...project,apartmentSettings:{...settings,targets:{...settings.targets,[type]:value}}})}/>}
                </td><td>{totals.apartmentMix[type]}{totals.generatedApartments>0&&<small> {format(100*(totals.apartmentMix[type])/totals.generatedApartments,0)}%</small>}</td></tr>)}</tbody>
            </table>
            <p className="summary-note">Actual mix counts subdivided apartments. Mix edits apply to new subdivisions. Apply them to existing blocks when ready.</p>
            <button type="button" className="secondary" disabled={!totals.generatedApartments} onClick={()=>commit({...project,blocks:project.blocks.map(b=>b.apartmentLayout?{...b,apartmentLayout:{...b.apartmentLayout,mix:{...settings.mix}}}:b)})}>Apply target mix to all subdivisions</button>
            <p className="summary-note">{ndssVersion}. Area and route checks are indicative. Room dimensions and storage are pending.</p>
          </section>
          <section className="properties dwelling-settings" aria-labelledby="house-types">
            <h3 id="house-types">House types</h3>
            <div className="property-grid">
              <NumberField label="Ground floor height" value={houseHeights.ground} min={minimumDwellingStoreyHeight} max={12} step={.1} update={ground=>commit({...project,houseHeights:{...houseHeights,ground}})}/>
              <NumberField label="Upper floor height" value={houseHeights.upper} min={minimumDwellingStoreyHeight} max={12} step={.1} update={upper=>commit({...project,houseHeights:{...houseHeights,upper}})}/>
            </div>
            <p className="summary-note">Heights apply to all houses. Houses and apartments allow 0.3 m for floor and ceiling construction, giving 2.3 m estimated clear height at a 2.6 m storey height.</p>
            <table className="mix-table"><thead><tr><th>Type</th><th>2-storey area</th><th>3-storey target</th><th>Actual</th></tr></thead>
              <tbody>{(['3B5P','3B6P'] as const).map(type=><tr key={type}><th scope="row">{type}</th>
                <td>{ndss[type].areas[1]} m²</td><td><NumberField label={type+' three-storey house target area'} value={project.targets[type]} min={ndss[type].areas[2]} max={220} step={.1} unit="m²" update={value=>{
                  const targets={...project.targets,[type]:value}
                  if(project.blocks.every(b=>footprintSatisfies(b,targets)))return commit({...project,targets})
                  setNotice('That target creates overlapping house footprints.')
                  return false
                }}/></td><td>{totals.houseMix[type]}</td></tr>)}</tbody>
            </table>
            <p className="summary-note">Three-storey area targets are shared with apartments. Two-storey terraces use their own NDSS area minimums.</p>
          </section>
        </Panel>
        </div>
      </aside>
    </main>
    <footer>
      <div>Local coordinates · metres</div>
      <div><label className="snap"><input type="checkbox" checked={snap} onChange={e=>{setSnap(e.target.checked);setGuide(undefined)}}/>Snapping</label>
      <span className="foot-divider"/><div className="menu-anchor help"><Button icon="help" title="Workspace help" kind="square" onClick={()=>setOption('help')}/>
        {menu==='help'&&<div className="popover help-menu"><strong>Workspace controls</strong><p>Left-drag away from editing handles in Select to pan. Right-drag or middle-drag to orbit in 3D. Hold left and middle together to pan. In Plan, navigation drags pan. Roll the mouse wheel to zoom around the cursor. On touch screens, use one finger to edit. Pinch to zoom, slide two fingers to pan, and twist two fingers to rotate in 3D. Snapping follows building faces and angles, with a 0.5 m grid elsewhere.</p><p>Click the ground floor to edit the building frontage. Click an upper floor once and drag either end for a setback. Drag the height handle to change storeys. Click empty space to finish. Press Delete or Backspace to delete the selected block.</p><p>Use Boundary → Edit boundary to adjust the redline. Use the toolbar to undo or redo and the block properties to duplicate or delete.</p><a href="https://www.openstreetmap.org/#map=19/52.4749/-1.889077" target="_blank" rel="noreferrer">Open UK map reference ↗</a></div>}
      </div></div>
    </footer>
  </div>
  {showSchedule&&<SchedulePage name={site.name} project={project} totals={totals} onBack={()=>setShowSchedule(false)}/>}
  </>
}
createRoot(document.getElementById('root')!).render(<SiteWorkspace editor={(site,close,saved)=><App key={site.id} site={site} close={close} onSaved={saved}/>}/>)
