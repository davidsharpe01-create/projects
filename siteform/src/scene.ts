import { paintMap } from './basemap'
import { footprints, levels, height, inside, type Point, type Project } from './model'
export type Camera = {angle:number; tilt:number; zoom:number; pan:Point}
export const home:Camera={angle:-.42,tilt:.63,zoom:1,pan:[0,0]}
export type Layers = {context:boolean; trees:boolean; grid:boolean; labels:boolean}
export const initialLayers:Layers={context:true,trees:true,grid:false,labels:true}
export type Hit={id:string;shape:Point[]}
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
  return {project,invert,s}
}
type Scene = {camera:Camera;plan:boolean;floor:number;project:Project;selected:string|null;draft:Point[];pointer:Point|null; layers:Layers; opacity:number; showVertices:boolean; refresh:()=>void}
export function draw(canvas:HTMLCanvasElement,scene:Scene) {
  const ctx=canvas.getContext('2d')!
  const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(devicePixelRatio,2)
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)
  }
  const {camera,plan,project,selected,draft,pointer,layers,opacity,showVertices,floor}=scene
  const {project:xy,invert,s}=projection(w,h,camera,plan)
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
  const hits:Hit[]=[]
  const objects:{depth:number;draw:()=>void}[]=[]
  type Material={roof:string; walls:string[]; line:string; floor:string}
  const contextMaterial={roof:'#e9e8df',walls:['#cdd1c6','#b9c1b5','#c9cfc2','#d9dad0'],line:'#a5b1a2',floor:'#c8cec3'}
  const green={roof:'#a6c6b8',walls:['#7b9f90','#648e7e','#759c8b','#94b3a5'],line:'#476f61',floor:'#e2eee7'}
  const active={roof:'#b7d7ca',walls:['#81ab9b','#568675','#6e9b8c','#9bc1b3'],line:'#286957',floor:'#d5e7df'}
  const house={roof:'#d8b284',walls:['#b28b61','#a67d55','#b59069','#c6a27a'],line:'#8f6f50',floor:'#e4c8a8'}
  const face=(poly:Point[],z:number,material:Material,storeys:number[],id?:string,base=0)=>{
    const top=poly.map(p=>xy(p,z))
    if(!plan){
      poly.forEach((p,i)=>{
        const q=poly[(i+1)%poly.length],a=xy(p,base),b=xy(q,base)
        if(b[0]-a[0]>=-1e-7)return
        const side=[a,b,xy(q,z),xy(p,z)]
        path(side,material.walls[i%4],material.line,.75)
        storeys.slice(0,-1).forEach(level=>path([xy(p,base+level),xy(q,base+level)],undefined,material.floor,.85,false))
        if(id)hits.push({id,shape:side})
      })
    }
    path(top,material.roof,material.line,id===selected?1.75:.8)
    if(id)hits.push({id,shape:top})
  }
  const order=(poly:Point[])=>poly.reduce((sum,p)=>sum+xy(p)[1]+xy(p)[0]*.11,0)/poly.length
  if(layers.context&&!project.anchor) buildings.forEach(({poly,z})=>objects.push({depth:order(poly),draw:()=>face(poly,z,contextMaterial,[])}))
  if(layers.trees&&!project.anchor) visibleTrees.filter(({p})=>!inside(p,boundary)).forEach(({p,r,h,c})=>{
    objects.push({depth:order([p]),draw:()=>{
      const [x,y]=xy(p,plan?0:h*.55)
      if(!plan)path([xy(p),[x,y]],undefined,'#879484',Math.max(.6,s*.19),false)
      const drawRadius=r*s
      ctx.beginPath();ctx.ellipse(x,y,drawRadius,drawRadius*(plan?1:.76),0,0,2*Math.PI)
      ctx.fillStyle=['#aabca8','#9eb29e','#b4c2ad','#a5b7a0'][c];ctx.fill()
      ctx.beginPath();ctx.ellipse(x-drawRadius*.13,y-drawRadius*.19,drawRadius*.66,drawRadius*.49,0,0,2*Math.PI)
      ctx.fillStyle='#d8e0ce55';ctx.fill()
    }})
  })
  const labels:{p:Point;name:string;selected:boolean}[]=[]
  project.blocks.forEach(b=>{
    if(plan && floor>=levels(b).length)return
    const polys=footprints(b,project.targets),z=plan?0:height(b)+b.level
    ctx.globalAlpha=1
    const roof=project.colours[b.houseType]
    const material=b.type==='house'?{...house,roof,line:b.id===selected?'#286957':house.line}:b.id===selected?active:green
    const group=polys.flat()
    polys.forEach(poly=>objects.push({depth:order(poly),draw:()=>{
      ctx.globalAlpha=opacity
      face(poly,z,material,levels(b),b.id,plan?0:b.level)
      ctx.globalAlpha=1
    }}))
    if(group.length&&(b.id===selected||(plan&&layers.labels))){
      const center=group.reduce(([x,y],p)=>[x+p[0]/group.length,y+p[1]/group.length] as Point,[0,0] as Point)
      labels.push({p:xy(center,z),name:b.name,selected:b.id===selected})
    }
  })
  objects.sort((a,b)=>a.depth-b.depth).forEach(item=>item.draw())
  const selectedBlock=project.blocks.find(b=>b.id===selected)
  if(selectedBlock && showVertices){
    world(selectedBlock.line,undefined,'#176f59',2,false,.1)
    selectedBlock.line.forEach(p=>dot(xy(p),'#176f59',4.5))
  }
  if(showVertices && !selectedBlock) boundary.forEach(p=>dot(xy(p),'#aa5049',4.5))
  labels.forEach(({p:[x,y],name,selected:chosen})=>{
    ctx.font='600 11px system-ui'
    const width=ctx.measureText(name).width+21
    ctx.beginPath();ctx.roundRect(x-width/2,y-11,width,22,5)
    ctx.fillStyle=chosen?'#206751':'#fdfcf8';ctx.fill()
    ctx.fillStyle=chosen?'#fff':'#35574c';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(name,x,y+.5)
  })
  if(draft.length){
    world(draft,undefined,'#a14a42',2,false)
    if(pointer){ctx.setLineDash([5,5]);world([draft.at(-1)!,pointer],undefined,'#a14a42',1.6,false);ctx.setLineDash([])}
    draft.forEach(p=>dot(xy(p),'#aa5049',4.2))
  }
  function dot(p:Point,colour:string,r:number){
    ctx.beginPath();ctx.arc(...p,r,0,2*Math.PI);ctx.fillStyle='#fffdf5';ctx.fill()
    ctx.strokeStyle=colour;ctx.lineWidth=2;ctx.stroke()
  }
  return hits
}
