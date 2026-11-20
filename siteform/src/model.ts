export type Point = [number, number]
export type HouseType = '3B5P' | '3B6P'
export type Block = {id:string; name:string; type:'house'|'apartment'; line:Point[]; depth:number; floors:number; ground:number; upper:number; level:number; houseType:HouseType; setbacks?:Point[]}
export type Project = {anchor?:{lat:number;lon:number}; boundary:Point[]; blocks:Block[]; targets:Record<HouseType,number>; colours:Record<HouseType,string>}
export const defaults = { frontage:4.5, external:0.6, party:0.3, houseFloors:3, houseHeight:3, apartmentGround:4.5, apartmentUpper:3, apartmentDepth:18 }
export const sample:Project = {
  boundary:[[-62,-29],[-9,-45],[59,-34],[78,4],[46,37],[-18,44],[-64,20]],
  blocks:[
    {id:'a',name:'Block A',type:'apartment',line:[[-45,-16],[4,-28]],depth:18,floors:5,ground:4.5,upper:3,level:0,houseType:'3B5P'},
    {id:'b',name:'Block B',type:'apartment',line:[[25,-23],[55,-12]],depth:18,floors:4,ground:4.5,upper:3,level:0,houseType:'3B5P'},
    {id:'c',name:'Block C',type:'house',line:[[-34,17],[13,23]],depth:10,floors:3,ground:3,upper:3,level:0,houseType:'3B5P'}
  ],
  targets:{'3B5P':99,'3B6P':108}, colours:{'3B5P':'#d8b284','3B6P':'#cf937f'}
}
export const length = (a:Point,b:Point) => Math.hypot(b[0]-a[0],b[1]-a[1])
const signedArea = (p:Point[]) => p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-a[1]*b[0]},0)/2
export const area = (p:Point[]) => Math.abs(signedArea(p))
export const frontage = (p:Point[]) => p.slice(1).reduce((sum,b,i)=>sum+length(p[i],b),0)
export const depthFor = (target:number,left=defaults.party/2,right=defaults.party/2) =>
  target / defaults.houseFloors / (defaults.frontage-left-right) + 2*defaults.external
export const height = (b:Block) => b.type==='house' ? defaults.houseHeight*defaults.houseFloors : b.ground+(b.floors-1)*b.upper
export const apartmentStoreys={min:1,max:30}
export const floors = (b:Block) => b.type==='house' ? defaults.houseFloors : b.floors
export const levels = (b:Block) => Array.from({length:floors(b)},(_,i)=>b.type==='house'?(i+1)*defaults.houseHeight:b.ground+i*b.upper)
const minus = (a:Point,b:Point):Point => [a[0]-b[0],a[1]-b[1]]
const cross = (a:Point,b:Point) => a[0]*b[1]-a[1]*b[0]
const orientation = (a:Point,b:Point,c:Point) => cross(minus(b,a),minus(c,a))
const onEdge = (p:Point,a:Point,b:Point) => Math.abs(orientation(a,b,p))<1e-7 && p.every((v,i)=>v>=Math.min(a[i],b[i])-1e-7 && v<=Math.max(a[i],b[i])+1e-7)
export const inside = (p:Point,poly:Point[]) => poly.reduce((hit,a,i)=>{
  const b=poly[(i+1)%poly.length]
  return ((a[1]>p[1]) !== (b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) ? !hit : hit
},false) || poly.some((a,i)=>onEdge(p,a,poly[(i+1)%poly.length]))
const opposite = (a:number,b:number) => (a>1e-7&&b< -1e-7)||(b>1e-7&&a< -1e-7)
const intersects = (a:Point,b:Point,c:Point,d:Point) => opposite(orientation(a,b,c),orientation(a,b,d)) && opposite(orientation(c,d,a),orientation(c,d,b))
export function validPolygon(p:Point[]) {
  return p.length>=3 && area(p)>1 && p.every((a,i)=>{
    const b=p[(i+1)%p.length]
    return length(a,b)>.05 && !p.some((c,j)=>{
      const d=p[(j+1)%p.length]
      return i!==j && (i+1)%p.length!==j && (j+1)%p.length!==i &&
        (intersects(a,b,c,d)||onEdge(c,a,b)||onEdge(d,a,b)||onEdge(a,c,d)||onEdge(b,c,d))
    })
  })
}
function pointAlong(a:Point,b:Point,metres:number):Point {
  const t=metres/length(a,b)
  return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]
}
function offset(a:Point,b:Point,depth:number):Point {
  const l=length(a,b)
  return [a[0]-(b[1]-a[1])*depth/l,a[1]+(b[0]-a[0])*depth/l]
}
function rectangle(a:Point,b:Point,depth:number):Point[] {
  const p=offset(a,b,depth)
  return [a,b,[b[0]+p[0]-a[0],b[1]+p[1]-a[1]],p]
}
function houseUnits(line:Point[],target:number) {
  return line.slice(1).flatMap((end,i)=>{
    const start=line[i],count=Math.floor((length(start,end)+1e-7)/defaults.frontage)
    let previousDepth=0
    return Array.from({length:count},(_,j)=>{
      const left=j===0?defaults.external:defaults.party/2
      const right=j===count-1?defaults.external:defaults.party/2
      const depth=depthFor(target,left,right)
      const internalWidth=defaults.frontage-(j===0?left:0)-(j===count-1?right:0)
      // A step between neighbouring rear walls exposes part of the deeper flank.
      const exposedFlank=j?Math.abs(depth-previousDepth)*defaults.external:0
      previousDepth=depth
      return {
        outline:rectangle(pointAlong(start,end,j*defaults.frontage),pointAlong(start,end,(j+1)*defaults.frontage),depth),
        internalArea:internalWidth*(depth-2*defaults.external)-exposedFlank
      }
    })
  })
}
export function footprints(b:Block,targets:Project['targets']):Point[][] {
  const line=b.line.filter((p,i)=>!i||length(p,b.line[i-1])>.01)
  if(line.length<2) return []
  if(b.type==='house') return houseUnits(line,targets[b.houseType]).map(unit=>unit.outline)
  const back=line.map((p,i):Point=>{
    if(i===0) return offset(p,line[1],b.depth)
    if(i===line.length-1) return offset(p,line[i-1],-b.depth)
    const previous=offset(p,line[i-1],-b.depth)
    const next=offset(p,line[i+1],b.depth)
    const u=minus(p,line[i-1]),v=minus(line[i+1],p)
    const det=cross(u,v)
    if(Math.abs(det)<1e-7) return next
    const t=cross(minus(next,previous),v)/det
    return [previous[0]+u[0]*t,previous[1]+u[1]*t]
  })
  return [[...line,...back.reverse()]]
}
export function endInset(block:Block,floor:number):Point {
  return floor>0?(block.setbacks?.[Math.min(floor,block.setbacks.length-1)]??[0,0]):[0,0]
}
export function endDirection(block:Block,end:number):Point {
  const line=end?[...block.line].reverse():block.line
  const origin=line[0]
  const next=line.find(point=>length(point,origin)>.01)
  if(!next)return [0,0]
  const [x,y]=minus(next,origin),size=Math.hypot(x,y)
  return [x/size,y/size]
}
export function floorOutline(block:Block,outline:Point[],floor:number):Point[] {
  const [start,end]=endInset(block,floor)
  if(!start&&!end)return outline
  const result=[...outline]
  for(const [side,dist] of [start,end].entries()){
    if(!dist)continue
    const i=side?outline.length/2-1:0,j=outline.length-1-i
    const [dx,dy]=endDirection(block,side)
    result[i]=[outline[i][0]+dist*dx,outline[i][1]+dist*dy]
    result[j]=[outline[j][0]+dist*dx,outline[j][1]+dist*dy]
  }
  return result
}
function validApartmentFloors(block:Block,outline:Point[]) {
  return levels(block).every((_,floor)=>{
    const inset=endInset(block,floor)
    if(!inset[0]&&!inset[1])return true
    const below=endInset(block,floor-1)
    const polygon=floorOutline(block,outline,floor)
    if(!validPolygon(polygon)||inset.some((dist,i)=>dist<below[i]))return false
    // Each cut must stop before it reaches another corner or the opposite end.
    return inset.every((dist,side)=>{
      if(!dist)return true
      const i=side?outline.length/2-1:0,j=outline.length-1-i
      const [dx,dy]=endDirection(block,side)
      return polygon.every(([x,y],k)=>k===i||k===j||(x-outline[i][0])*dx+(y-outline[i][1])*dy>dist+.05)
    }) && apartmentInternalArea(polygon)!==null
  })
}
export function resizeStoreys(block:Block,floors:number):Block {
  if(block.floors===floors)return block
  return block.setbacks ? {...block,floors,setbacks:block.setbacks.slice(0,floors)} : {...block,floors}
}
export function adjustSetback(block:Block,targets:Project['targets'],floor:number,end:number,delta:number,step:number):Block {
  if(block.type!=='apartment'||floor<=0||floor>=block.floors)return block
  const original=endInset(block,floor)[end],minimum=endInset(block,floor-1)[end]
  const movement=Math.max(minimum-original,delta)
  if(Math.abs(movement)<1e-7)return block
  const outline=footprints(block,targets)[0]
  if(!outline)return block
  const apply=(offset:number):Block=>({...block,setbacks:levels(block).map((_,i)=>{
    const values=[...endInset(block,i)] as Point
    if(i>=floor)values[end]+=offset
    return values
  })})
  const requested=apply(movement)
  if(validApartmentFloors(requested,outline))return requested
  let low=0,high=1
  for(let i=0;i<22;i++){
    const mid=(low+high)/2
    if(validApartmentFloors(apply(movement*mid),outline))low=mid
    else high=mid
  }
  const accepted=movement*low
  const bounded=step?Math.sign(accepted)*Math.floor(Math.abs(accepted)/step)*step:accepted
  return Math.abs(bounded)>1e-6?apply(bounded):block
}
function apartmentInternalArea(poly:Point[]) {
  const winding=Math.sign(signedArea(poly))
  const thickness=winding*defaults.external
  const inner=poly.map((p,i):Point=>{
    const prev=poly[(i+poly.length-1)%poly.length],next=poly[(i+1)%poly.length]
    const a=offset(p,prev,-thickness),b=offset(p,next,thickness)
    const u=minus(p,prev),v=minus(next,p)
    const det=cross(u,v)
    if(Math.abs(det)<1e-7)return b
    const t=cross(minus(b,a),v)/det
    return [a[0]+u[0]*t,a[1]+u[1]*t]
  })
  return validPolygon(inner)&&Math.sign(signedArea(inner))===winding&&inner.every((p,i)=>
    inside(p,poly)&&minus(inner[(i+1)%inner.length],p).reduce((sum,n,j)=>sum+n*(poly[(i+1)%poly.length][j]-poly[i][j]),0)>0
  )?area(inner):null
}
export function blockStats(b:Block,p:Project) {
  const units=b.type==='house'?houseUnits(b.line.filter((p,i)=>!i||length(p,b.line[i-1])>.01),p.targets[b.houseType]):null
  const outlines=units?units.map(unit=>unit.outline):footprints(b,p.targets)
  const footprint=outlines.reduce((sum,poly)=>sum+area(poly),0)
  const floorPolys=b.type==='apartment'&&outlines[0]?levels(b).map((_,i)=>floorOutline(b,outlines[0],i)):[]
  const gross=units?footprint*floors(b):floorPolys.reduce((sum,poly)=>sum+area(poly),0)
  const internalAreas=floorPolys.map(apartmentInternalArea)
  const gia=units?units.reduce((sum,unit)=>sum+unit.internalArea,0)*floors(b):
    internalAreas.some(a=>a===null)?null:internalAreas.reduce<number>((sum,a)=>sum+(a??0),0)
  const outside=p.boundary.length>=3 && outlines.some(poly=>poly.some((a,i)=>
    !inside(a,p.boundary) || p.boundary.some((c,j)=>intersects(a,poly[(i+1)%poly.length],c,p.boundary[(j+1)%p.boundary.length]))
  ))
  const houses=b.type==='house'?outlines.length:0
  return {footprint, gross, gia, houses, usable:houses*p.targets[b.houseType], outside}
}
export function development(p:Project) {
  const site=area(p.boundary)
  const totals=p.blocks.reduce((total,b)=>{
    const s=blockStats(b,p)
    return {gross:total.gross+s.gross,gia:total.gia===null||s.gia===null?null:total.gia+s.gia,footprint:total.footprint+s.footprint,houses:total.houses+s.houses,usable:total.usable+s.usable}
  },{gross:0,gia:0 as number|null,footprint:0,houses:0,usable:0})
  return {...totals,site,density:site?totals.houses*10000/site:0,coverage:site?totals.footprint/site*100:0}
}
export function newBlock(project:Project,type:Block['type'],line:Point[]):Block {
  let index=0
  const label=(n:number):string=>(n>=26?label(Math.floor(n/26)-1):'')+String.fromCharCode(65+n%26)
  while(project.blocks.some(b=>b.name==='Block '+label(index))) index++
  return {id:crypto.randomUUID(),name:'Block '+label(index),type,line,depth:defaults.apartmentDepth,
    floors:type==='house'?3:4,ground:type==='house'?3:defaults.apartmentGround,upper:3,level:0,houseType:'3B5P'}
}
export function csv(p:Project) {
  const headings=['Block','Type','Storeys','Height (m)','Footprint (m²)','External floor area (m²)','Houses','House type','Modelled usable house area (m²)','Site area (m²)']
  const fixed=(n:number)=>n.toFixed(2)
  const rows=p.blocks.map(b=>{const s=blockStats(b,p);return [b.name,b.type,floors(b),fixed(height(b)),fixed(s.footprint),fixed(s.gross),s.houses,b.type==='house'?b.houseType:'',fixed(s.usable),'']})
  const t=development(p)
  return [headings,...rows,['Site total','','','',fixed(t.footprint),fixed(t.gross),t.houses,'',fixed(t.usable),fixed(t.site)]].map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n')
}

function overlapRectangles(a:Point[],b:Point[]) {
  return [...a.slice(0,2).map((p,i)=>minus(a[i+1],p)),...b.slice(0,2).map((p,i)=>minus(b[i+1],p))].every(([dx,dy])=>{
    const values=(p:Point[])=>p.map(([x,y])=>x*(-dy)+y*dx)
    const x=values(a),y=values(b)
    return Math.min(Math.max(...x),Math.max(...y))-Math.max(Math.min(...x),Math.min(...y))>1e-7
  })
}
export function footprintSatisfies(block:Block,targets:Project['targets']) {
  const polygons=footprints(block,targets)
  if(block.type==='apartment')return !!polygons[0]&&validPolygon(polygons[0])&&validApartmentFloors(block,polygons[0])
  return polygons.length>0 && polygons.every((poly,index)=>
    validPolygon(poly) && !polygons.slice(0,index).some(other=>overlapRectangles(poly,other))
  )
}
