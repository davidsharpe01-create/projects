export type Point = [number, number]
export type HouseType = '3B5P' | '3B6P'
export type Block = {id:string; name:string; type:'house'|'apartment'; line:Point[]; depth:number; floors:number; ground:number; upper:number; level:number; houseType:HouseType}
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
export const area = (p:Point[]) => Math.abs(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-a[1]*b[0]},0))/2
export const frontage = (p:Point[]) => p.slice(1).reduce((sum,b,i)=>sum+length(p[i],b),0)
export const depthFor = (target:number,left=defaults.party/2,right=defaults.party/2) =>
  target / defaults.houseFloors / (defaults.frontage-left-right) + 2*defaults.external
export const height = (b:Block) => b.type==='house' ? defaults.houseHeight*defaults.houseFloors : b.ground+(b.floors-1)*b.upper
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
export function footprints(b:Block,targets:Project['targets']):Point[][] {
  const line=b.line.filter((p,i)=>!i||length(p,b.line[i-1])>.01)
  if(line.length<2) return []
  if(b.type==='house') return line.slice(1).flatMap((end,i)=>{
    const start=line[i], count=Math.floor((length(start,end)+1e-7)/defaults.frontage)
    return Array.from({length:count},(_,j)=>rectangle(
      pointAlong(start,end,j*defaults.frontage),pointAlong(start,end,(j+1)*defaults.frontage),
      depthFor(targets[b.houseType],j===0?defaults.external:defaults.party/2,j===count-1?defaults.external:defaults.party/2)
    ))
  })
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
export function blockStats(b:Block,p:Project) {
  const outlines=footprints(b,p.targets)
  const footprint=outlines.reduce((sum,poly)=>sum+area(poly),0)
  const outside=p.boundary.length>=3 && outlines.some(poly=>poly.some((a,i)=>
    !inside(a,p.boundary) || p.boundary.some((c,j)=>intersects(a,poly[(i+1)%poly.length],c,p.boundary[(j+1)%p.boundary.length]))
  ))
  const houses=b.type==='house'?outlines.length:0
  return {footprint, gross:footprint*floors(b), houses, usable:houses*p.targets[b.houseType], outside}
}
export function development(p:Project) {
  const site=area(p.boundary)
  const totals=p.blocks.reduce((total,b)=>{
    const s=blockStats(b,p)
    return {gross:total.gross+s.gross,footprint:total.footprint+s.footprint,houses:total.houses+s.houses,usable:total.usable+s.usable}
  },{gross:0,footprint:0,houses:0,usable:0})
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
  return polygons.length>0 && polygons.every((poly,index)=>
    validPolygon(poly) && !polygons.slice(0,index).some(other=>overlapRectangles(poly,other))
  )
}
