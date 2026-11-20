import type {SnapGuide} from './snap'
import type {ContextBuilding} from './context'
import { depthPlane, foregroundShape, pickSurface, visibleSurface, type Surface } from './depth'
import { footprints, levels, height, floors, floorOutline, endInset, inside, type Point, type Project } from './model'
export type Camera = {angle:number; tilt:number; zoom:number; pan:Point}
export const home:Camera={angle:-.42,tilt:.63,zoom:1,pan:[0,0]}
export type Layers = {context:boolean; grid:boolean; labels:boolean}
export const initialLayers:Layers={context:true,grid:false,labels:true}
const rect=(x:number,y:number,w:number,d:number):Point[]=>[[x,y],[x+w,y],[x+w,y+d],[x,y+d]]
export function projection(w:number,h:number,c:Camera,plan:boolean) {
  const angle=plan?0:c.angle
  const s=Math.min(w/185,h/(plan?133:108))*c.zoom
  const x=w*.49+c.pan[0],y=h*.49+c.pan[1]
  const cs=Math.cos(angle),sn=Math.sin(angle),tilt=plan?1:c.tilt
  const project=(p:Point,z=0):Point=>[x+s*(p[0]*cs-p[1]*sn),y+s*((p[0]*sn+p[1]*cs)*tilt-z*Math.sqrt(1-tilt*tilt))]
  const invert=(p:Point):Point=>{
    const u=(p[0]-x)/s,v=(p[1]-y)/s/tilt
    return [u*cs+v*sn,-u*sn+v*cs]
  }
  const depth=(p:Point,z=0)=>(p[0]*sn+p[1]*cs)*Math.sqrt(1-tilt*tilt)+z*tilt
  return {project,invert,s,depth}
}
type Scene = {camera:Camera;plan:boolean;floor:number;editFloor:number;project:Project;selected:string|null;draft:Point[];pointer:Point|null;guide?:SnapGuide; layers:Layers; opacity:number; editFrontage:boolean; editBoundary:boolean; context:ContextBuilding[]}
export function draw(canvas:HTMLCanvasElement,scene:Scene) {
  const ctx=canvas.getContext('2d')!
  const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(devicePixelRatio,2)
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)
  }
  const {camera,plan,project,selected,draft,pointer,guide,layers,opacity,editFrontage,editBoundary,floor,editFloor}=scene
  const {project:xy,s,depth}=projection(w,h,camera,plan)
  ctx.setTransform(dpr,0,0,dpr,0,0)
  ctx.fillStyle='#eeeae3';ctx.fillRect(0,0,w,h)
  ctx.lineJoin='round';ctx.lineCap='round'
  const path=(points:Point[],fill?:string,stroke?:string,width=1,close=true)=>{
    if(!points.length)return
    ctx.beginPath();ctx.moveTo(...points[0]);points.slice(1).forEach(p=>ctx.lineTo(...p))
    if(close)ctx.closePath()
    if(fill){ctx.fillStyle=fill;ctx.fill()}
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke()}
  }
  const world=(p:Point[],fill?:string,stroke?:string,width=1,close=true,z=0)=>path(p.map(a=>xy(a,z)),fill,stroke,width,close)
  if(layers.grid){
    for(let i=-300;i<=300;i+=10){
      world([[i,-300],[i,300]],undefined,'#64776d44',.8,false)
      world([[-300,i],[300,i]],undefined,'#64776d44',.8,false)
    }
  }
  const boundary=project.boundary
  world(boundary,project.anchor?'#ead7be72':'#e9dbc7','#ad574e',2.1)
  type Drawable=Surface & {paint:()=>void;bounds:[number,number,number,number]}
  const surfaces:Drawable[]=[]
  function addSurface(surface:Surface,paint:()=>void){
    const xs=surface.shape.map(p=>p[0]),ys=surface.shape.map(p=>p[1])
    const bounds:Drawable['bounds']=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]
    if(bounds[2]<-2||bounds[0]>w+2||bounds[3]<-2||bounds[1]>h+2)return
    surfaces.push({...surface,paint,bounds})
  }
  type Material={roof:string; walls:string[]; line:string; floor:string}
  const green={roof:'#a6c6b8',walls:['#7b9f90','#648e7e','#759c8b','#94b3a5'],line:'#476f61',floor:'#e2eee7'}
  const bulk={
    apartment:green,
    office:{roof:'#adbfdb',walls:['#829ab7','#6985a8','#7890b0','#98acc6'],line:'#4e6789',floor:'#e1e9f5'},
    pbsa:{roof:'#c8b8da',walls:['#a291ba','#8b77a6','#9c88b1','#b0a0c5'],line:'#69527e',floor:'#ede6f5'}
  }
  const house={roof:'#d8b284',walls:['#b28b61','#a67d55','#b59069','#c6a27a'],line:'#8f6f50',floor:'#e4c8a8'}
  const face=(poly:Point[],z:number,material:Material,storeys:number[],id?:string,base=0,storey?:number,cap=true,topRoof=true,holes:Point[][]=[],triangles?:Point[][])=>{
    const top=poly.map(p=>xy(p,z))
    if(!plan){
      const winding=poly.reduce((sum,p,i)=>{const q=poly[(i+1)%poly.length];return sum+p[0]*q[1]-p[1]*q[0]},0)
      for(const ring of [poly,...holes])ring.forEach((p,i)=>{
        const q=ring[(i+1)%ring.length],a=xy(p,base),b=xy(q,base)
        if((b[0]-a[0])*Math.sign(winding)>=-1e-7)return
        const high=xy(p,z)
        const shape=[a,b,xy(q,z),high]
        addSurface({id,floor:storey,shape,depth:depthPlane(a,b,high,depth(p,base),depth(q,base),depth(p,z))},()=>{
          path(shape,material.walls[i%4],material.line,.75)
          if(storey!==undefined)path([high,xy(q,z)],undefined,material.floor,.85,false)
          storeys.slice(0,-1).forEach(level=>path([xy(p,base+level),xy(q,base+level)],undefined,material.floor,.85,false))
        })
      })
    }
    if(!cap)return
    // A roof is horizontal, so depth across it depends only on screen height.
    const roofDepth=plan?()=>0:([,y]:Point)=>depth(poly[0],z)+(y-top[0][1])*Math.sqrt(1-camera.tilt**2)/(s*camera.tilt)
    if(triangles){
      for(const triangle of triangles){
        const shape=triangle.map(p=>xy(p,z))
        addSurface({shape,depth:roofDepth},()=>path(shape,material.roof))
      }
    }else{
      addSurface({id,shape:top,depth:roofDepth,roof:topRoof,floor:storey},
        ()=>path(top,material.roof,material.line,id&&id===selected?1.75:.8))
    }
  }
  const contextMaterial={roof:'#dedbd3',walls:['#cdc8be','#bdb8ae','#c8c3b9','#d4cfc5'],line:'#9e988d',floor:'#dedbd3'}
  if(layers.context)for(const building of scene.context){
    const [outline,...holes]=building.rings
    if(plan||building.height===0){
      for(const ring of building.rings)world(ring,undefined,contextMaterial.line,.9)
    }else{
      face(outline,building.height,contextMaterial,[],undefined,building.base,undefined,true,false,holes,building.triangles)
    }
  }
  const labels:{p:Point;name:string;selected:boolean;resize:boolean}[]=[]
  project.blocks.forEach(b=>{
    if(plan && floor>=levels(b).length)return
    const polys=footprints(b,project.targets),z=plan?0:height(b)+b.level
    const roof=project.colours[b.houseType]
    const material=b.type==='house'?{...house,roof,line:b.id===selected?'#286957':house.line}:
      b.id===selected&&b.type==='apartment'?{roof:'#b7d7ca',walls:['#81ab9b','#568675','#6e9b8c','#9bc1b3'],line:'#286957',floor:'#d5e7df'}:
      bulk[b.type]
    let group=polys.flat()
    if(b.type!=='house'&&polys[0]){
      const heights=levels(b)
      if(plan){
        const poly=floorOutline(b,polys[0],floor)
        face(poly,0,material,[],b.id)
        group=poly
      }else{
        heights.forEach((top,i)=>{
          const poly=floorOutline(b,polys[0],i)
          const last=i===heights.length-1
          const here=endInset(b,i),above=endInset(b,i+1)
          const cap=last||here.some((dist,j)=>dist!==above[j])
          const colour=i>0&&i===editFloor&&b.id===selected&&editFrontage
            ?{...material,walls:['#7fa9c0','#5b889f','#6b98ae','#91b4c6'],floor:'#dceaf0'}
            :material
          face(poly,b.level+top,colour,[],b.id,b.level+(heights[i-1]??0),i,cap,last)
          if(last)group=poly
        })
      }
    }else{
      polys.forEach(poly=>face(poly,z,material,levels(b),b.id,plan?0:b.level))
    }
    if(group.length&&(b.id===selected||(plan&&layers.labels))){
      const center=group.reduce(([x,y],p)=>[x+p[0]/group.length,y+p[1]/group.length] as Point,[0,0] as Point)
      const resize=!plan&&editFrontage&&b.id===selected&&b.type!=='house'
      const name=resize?b.name+'  ↕  '+b.floors+'F':b.name
      labels.push({p:xy(center,z),name,selected:b.id===selected,resize})
    }
  })
  surfaces.forEach((surface,index)=>{
    ctx.save()
    if(surface.id)ctx.globalAlpha=opacity
    if(!plan){
      const [left,top,right,bottom]=surface.bounds
      // Clip only where another face projects in front of this one.
      surfaces.forEach((other,i)=>{
        if(i===index||(!surface.id&&other.id&&opacity<1))return
        const [x,y,r,b]=other.bounds
        if(r<=left||x>=right||b<=top||y>=bottom)return
        const mask=foregroundShape(surface,other,i>index)
        if(mask.length<3)return
        ctx.beginPath()
        ctx.rect(-2,-2,w+4,h+4)
        ctx.moveTo(...mask[0])
        mask.slice(1).forEach(p=>ctx.lineTo(...p))
        ctx.closePath()
        ctx.clip('evenodd')
      })
    }
    surface.paint()
    ctx.restore()
  })
  let heightHandle:Point[]=[]
  labels.forEach(({p:[x,y],name,selected:chosen,resize})=>{
    ctx.font='600 11px system-ui'
    const width=ctx.measureText(name).width+21
    if(resize)heightHandle=rect(x-width/2,y-11,width,22)
    ctx.beginPath();ctx.roundRect(x-width/2,y-11,width,22,5)
    ctx.fillStyle=chosen?'#206751':'#fdfcf8';ctx.fill()
    ctx.fillStyle=chosen?'#fff':'#35574c';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(name,x,y+.5)
  })
  const block=editFrontage?project.blocks.find(b=>b.id===selected && (!plan||floor<floors(b))):undefined
  const setbackHandles:Point[]=[]
  if(block&&block.type!=='house'&&!plan&&editFloor>0&&editFloor<block.floors){
    const outline=footprints(block,project.targets)[0]
    if(outline){
      const poly=floorOutline(block,outline,editFloor)
      const heights=levels(block)
      const elevation=block.level+(heights[editFloor-1]+heights[editFloor])/2
      const lastFront=poly.length/2-1
      const front=poly.slice(0,lastFront+1).map(p=>xy(p,elevation))
      path(front,undefined,'#215a7b',2,false)
      setbackHandles.push(front[0],front[lastFront])
      setbackHandles.forEach(p=>dot(p,'#215a7b',6.5))
    }
  }
  const handles=block&&(!(plan?floor:editFloor)||block.type==='house')
    ?block.line.map(p=>xy(p,plan?0:block.level))
    :editBoundary?boundary.map(p=>xy(p)):[]
  if(block)path(handles,undefined,'#176f59',2,false)
  handles.forEach(p=>dot(p,block?'#176f59':'#aa5049',5.5))
  if(draft.length){
    world(draft,undefined,'#a14a42',2,false)
    if(pointer){ctx.setLineDash([5,5]);world([draft.at(-1)!,pointer],undefined,'#a14a42',1.6,false);ctx.setLineDash([])}
    draft.forEach(p=>dot(xy(p),'#aa5049',4.2))
  }
  if(guide){
    const colour='#6953a2'
    const level=guide.level??0
    ctx.setLineDash([4,4])
    world([guide.edge.a,guide.edge.b],undefined,colour,2,false,level)
    if(guide.anchor)world([guide.anchor,guide.point],undefined,colour,1.6,false,level)
    ctx.setLineDash([])
    const point=xy(guide.point,level)
    dot(point,colour,5)
    ctx.font='600 11px system-ui'
    const width=ctx.measureText(guide.label).width+14
    const x=Math.min(w-width-4,Math.max(4,point[0]+10)),y=Math.max(4,point[1]-27)
    ctx.beginPath();ctx.roundRect(x,y,width,19,4)
    ctx.fillStyle=colour;ctx.fill()
    ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle='white'
    ctx.fillText(guide.label,x+7,y+10)
  }
  function dot(p:Point,colour:string,r:number){
    ctx.beginPath();ctx.arc(...p,r,0,2*Math.PI);ctx.fillStyle='#fffdf5';ctx.fill()
    ctx.strokeStyle=colour;ctx.lineWidth=2;ctx.stroke()
  }
  return {pick:(point:Point)=>pickSurface(surfaces,point),handles,
    setbackHandles,pickFloor:(point:Point)=>visibleSurface(surfaces,point)?.floor??0,
    heightAt:(point:Point)=>heightHandle.length>0&&(inside(point,heightHandle)||pickSurface(surfaces,point,true)===selected)}
}
