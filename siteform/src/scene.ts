import { paintMap } from './basemap'
import { depthPlane, foregroundShape, pickSurface, visibleSurface, type Surface } from './depth'
import { footprints, levels, height, floors, floorOutline, endInset, inside, type Point, type Project } from './model'
export type Camera = {angle:number; tilt:number; zoom:number; pan:Point}
export const home:Camera={angle:-.42,tilt:.63,zoom:1,pan:[0,0]}
export type Layers = {context:boolean; trees:boolean; grid:boolean; labels:boolean}
export const initialLayers:Layers={context:true,trees:true,grid:false,labels:true}
const rect=(x:number,y:number,w:number,d:number):Point[]=>[[x,y],[x+w,y],[x+w,y+d],[x,y+d]]
const siteShapes:Point[][]=[
  [[-192,-115],[-99,-118],[-70,-47],[-77,40],[-113,108],[-182,90]],
  [[-70,-130],[75,-140],[125,-60],[85,-28],[-5,-56],[-65,-40]],
  [[84,-35],[150,-64],[220,5],[175,125],[115,104],[73,52],[86,17]],
  [[-95,56],[-29,48],[46,53],[90,108],[68,144],[-141,151]]
]
const river:Point[]=[[-118,-185],[-102,-123],[-117,-85],[-136,-53],[-143,-16],[-132,17],[-105,47],[-109,71],[-145,100],[-171,128],[-161,169]]
const roads:Point[][]=[
  [[-89,-150],[-81,-101],[-72,-60],[-76,-32],[-78,18],[-89,46],[-66,59],[-20,60],[42,51],[74,36],[95,9],[91,-11],[78,-31],[59,-42],[0,-55],[-38,-50],[-76,-44]],
  [[78,-31],[102,-48],[136,-60],[211,-63]],
  [[74,36],[98,60],[120,99],[145,145]],
  [[-89,46],[-105,69],[-123,103],[-129,147]],
  [[-60,-83],[-25,-90],[14,-90],[63,-82],[102,-48]],
  [[-76,-32],[-98,-28],[-111,-13],[-110,11],[-97,28],[-89,46]],
  [[91,-11],[121,-6],[151,10],[180,21],[224,24]]
]
const lane:Point[]=[[-58,11],[-28,3],[6,0],[30,4],[66,12]]
let seed=9841
function rand(){ seed=(seed*1664525+1013904223)>>>0;return seed/4294967296 }
const trees=Array.from({length:430},()=>({p:[rand()*390-188,rand()*295-149] as Point,r:1.15+rand()*2.3,h:2.6+rand()*3.5,c:Math.floor(rand()*4)}))
const buildings:{poly:Point[];z:number}[]=[]
for (const [x,y,cols,rows,dx,dy] of [
  [-60,-110,9,2,14,13],[-54,-76,8,1,14,13],[-101,-72,1,3,13,12],
  [106,-40,7,2,13,12],[106,9,7,2,15,14],[111,45,6,4,15,14],
  [-73,72,9,4,15,14],[-165,31,3,3,13,14],[-171,-73,3,4,13,14]
]){
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
    buildings.push({poly:rect(x+c*dx+rand()*2,y+r*dy+rand()*2,6+rand()*6,5+rand()*4),z:3+rand()*4})
  }
}
function distance(p:Point,a:Point,b:Point) {
  const dx=b[0]-a[0],dy=b[1]-a[1]
  const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)))
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)
}
const visibleTrees=trees.filter(({p})=>![...roads,river].some((line,index)=>
  line.slice(1).some((b,i)=>distance(p,line[i],b)<(index===roads.length?13:6))) &&
  !buildings.some(b=>inside(p,b.poly)))
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
type Scene = {camera:Camera;plan:boolean;floor:number;editFloor:number;project:Project;selected:string|null;draft:Point[];pointer:Point|null; layers:Layers; opacity:number; editFrontage:boolean; editBoundary:boolean; refresh:()=>void}
export function draw(canvas:HTMLCanvasElement,scene:Scene) {
  const ctx=canvas.getContext('2d')!
  const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(devicePixelRatio,2)
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)
  }
  const {camera,plan,project,selected,draft,pointer,layers,opacity,editFrontage,editBoundary,floor,editFloor}=scene
  const {project:xy,invert,s,depth}=projection(w,h,camera,plan)
  ctx.setTransform(dpr,0,0,dpr,0,0)
  ctx.fillStyle='#d7dcd0';ctx.fillRect(0,0,w,h)
  ctx.lineJoin='round';ctx.lineCap='round'
  const path=(points:Point[],fill?:string,stroke?:string,width=1,close=true)=>{
    if(!points.length)return
    ctx.beginPath();ctx.moveTo(...points[0]);points.slice(1).forEach(p=>ctx.lineTo(...p))
    if(close)ctx.closePath()
    if(fill){ctx.fillStyle=fill;ctx.fill()}
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke()}
  }
  const world=(p:Point[],fill?:string,stroke?:string,width=1,close=true,z=0)=>path(p.map(a=>xy(a,z)),fill,stroke,width,close)
  if(project.anchor)paintMap(ctx,project.anchor,s,[w,h],xy,invert,scene.refresh)
  if(layers.context&&!project.anchor){
    siteShapes.forEach((p,i)=>world(p,['#c4cfbe','#dce0d3','#d9ddd3','#daddd1'][i]))
    for(let i=-190;i<210;i+=13) for(let j=-130;j<145;j+=15){
      if(!siteShapes.some(poly=>inside([i,j],poly)))continue
      world(rect(i,j,12,14),undefined,'#b1bdac65',.65)
    }
    world(river,undefined,'#a8b9ad',27*s,false);world(river,undefined,'#a9bec0',19*s,false)
    world(river,undefined,'#a2b8bd',14*s,false)
    roads.forEach((p,i)=>{
      const width=(i===0?8.1:5.5)*s
      world(p,undefined,'#c3c8bd',width+1.6,false)
      world(p,undefined,'#ecece5',width,false)
      if(i===0){ctx.setLineDash([5,6]);world(p,undefined,'#d3d6cd',.8,false);ctx.setLineDash([])}
    })
  }
  if(layers.grid){
    for(let i=-300;i<=300;i+=10){
      world([[i,-300],[i,300]],undefined,'#64776d44',.8,false)
      world([[-300,i],[300,i]],undefined,'#64776d44',.8,false)
    }
  }
  const boundary=project.boundary
  world(boundary,project.anchor?'#ead7be72':'#e9dbc7','#ad574e',2.1)
  if(layers.context && !project.anchor && boundary.length>=3){
    ctx.save();path(boundary.map(p=>xy(p)));ctx.clip()
    world(lane,undefined,'#c8c3b1',6.8*s,false);world(lane,undefined,'#ede8da',6.2*s,false)
    world([[-24,-5],[-22,16]],undefined,'#eee9db',2.4*s,false)
    world([[29,5],[37,-13]],undefined,'#eee9db',2.4*s,false)
    ctx.restore()
  }
  type Drawable=Surface & {paint:()=>void;bounds:[number,number,number,number]}
  const surfaces:Drawable[]=[]
  function addSurface(surface:Surface,paint:()=>void){
    const xs=surface.shape.map(p=>p[0]),ys=surface.shape.map(p=>p[1])
    const bounds:Drawable['bounds']=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]
    if(bounds[2]<-2||bounds[0]>w+2||bounds[3]<-2||bounds[1]>h+2)return
    surfaces.push({...surface,paint,bounds})
  }
  type Material={roof:string; walls:string[]; line:string; floor:string}
  const contextMaterial={roof:'#e9e8df',walls:['#cdd1c6','#b9c1b5','#c9cfc2','#d9dad0'],line:'#a5b1a2',floor:'#c8cec3'}
  const green={roof:'#a6c6b8',walls:['#7b9f90','#648e7e','#759c8b','#94b3a5'],line:'#476f61',floor:'#e2eee7'}
  const active={roof:'#b7d7ca',walls:['#81ab9b','#568675','#6e9b8c','#9bc1b3'],line:'#286957',floor:'#d5e7df'}
  const house={roof:'#d8b284',walls:['#b28b61','#a67d55','#b59069','#c6a27a'],line:'#8f6f50',floor:'#e4c8a8'}
  const face=(poly:Point[],z:number,material:Material,storeys:number[],id?:string,base=0,storey?:number,cap=true,topRoof=true)=>{
    const top=poly.map(p=>xy(p,z))
    if(!plan){
      const winding=poly.reduce((sum,p,i)=>{const q=poly[(i+1)%poly.length];return sum+p[0]*q[1]-p[1]*q[0]},0)
      poly.forEach((p,i)=>{
        const q=poly[(i+1)%poly.length],a=xy(p,base),b=xy(q,base)
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
    addSurface({id,shape:top,depth:roofDepth,roof:topRoof,floor:storey},()=>path(top,material.roof,material.line,id===selected?1.75:.8))
  }
  if(layers.context&&!project.anchor) buildings.forEach(({poly,z})=>face(poly,z,contextMaterial,[]))
  if(layers.trees&&!project.anchor) visibleTrees.filter(({p})=>!inside(p,boundary)).forEach(({p,r,h,c})=>{
    const z=plan?0:h*.55
    const [x,y]=xy(p,z),[groundX,groundY]=xy(p)
    const radius=r*s,ry=radius*(plan?1:.76)
    const canopy=Array.from({length:24},(_,i):Point=>{
      const angle=i*Math.PI/12
      return [x+radius*Math.cos(angle),y+ry*Math.sin(angle)]
    })
    const treeDepth=depth(p,z)
    if(!plan&&groundY>y+ry){
      const halfWidth=Math.max(.6,s*.19)/2
      addSurface({shape:rect(groundX-halfWidth,y,2*halfWidth,groundY-y),depth:([,sy])=>treeDepth+
        (sy-y)/(groundY-y)*(depth(p)-treeDepth)},()=>path([xy(p),[x,y]],undefined,'#879484',2*halfWidth,false))
    }
    addSurface({shape:canopy,depth:()=>treeDepth},()=>{
      path(canopy,['#aabca8','#9eb29e','#b4c2ad','#a5b7a0'][c])
      ctx.beginPath();ctx.ellipse(x-radius*.13,y-radius*.19,radius*.66,radius*.49,0,0,2*Math.PI)
      ctx.fillStyle='#d8e0ce55';ctx.fill()
    })
  })
  const labels:{p:Point;name:string;selected:boolean;resize:boolean}[]=[]
  project.blocks.forEach(b=>{
    if(plan && floor>=levels(b).length)return
    const polys=footprints(b,project.targets),z=plan?0:height(b)+b.level
    const roof=project.colours[b.houseType]
    const material=b.type==='house'?{...house,roof,line:b.id===selected?'#286957':house.line}:b.id===selected?active:green
    let group=polys.flat()
    if(b.type==='apartment'&&polys[0]){
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
      const resize=!plan&&editFrontage&&b.id===selected&&b.type==='apartment'
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
  if(block?.type==='apartment'&&!plan&&editFloor>0&&editFloor<block.floors){
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
  const handles=block&&(!(plan?floor:editFloor)||block.type!=='apartment')
    ?block.line.map(p=>xy(p,plan?0:block.level))
    :editBoundary?boundary.map(p=>xy(p)):[]
  if(block)path(handles,undefined,'#176f59',2,false)
  handles.forEach(p=>dot(p,block?'#176f59':'#aa5049',5.5))
  if(draft.length){
    world(draft,undefined,'#a14a42',2,false)
    if(pointer){ctx.setLineDash([5,5]);world([draft.at(-1)!,pointer],undefined,'#a14a42',1.6,false);ctx.setLineDash([])}
    draft.forEach(p=>dot(xy(p),'#aa5049',4.2))
  }
  function dot(p:Point,colour:string,r:number){
    ctx.beginPath();ctx.arc(...p,r,0,2*Math.PI);ctx.fillStyle='#fffdf5';ctx.fill()
    ctx.strokeStyle=colour;ctx.lineWidth=2;ctx.stroke()
  }
  return {pick:(point:Point)=>pickSurface(surfaces,point),handles,
    setbackHandles,pickFloor:(point:Point)=>visibleSurface(surfaces,point)?.floor??0,
    heightAt:(point:Point)=>heightHandle.length>0&&(inside(point,heightHandle)||pickSurface(surfaces,point,true)===selected)}
}
