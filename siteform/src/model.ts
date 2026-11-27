import {apartmentLayout,type ApartmentOptions,type ApartmentSettings} from './apartment.ts'
import {dwellingTypes,ndss,ndssCeiling,type DwellingType} from './ndss.ts'
export type Point = [number, number]
export type HouseType = '3B5P' | '3B6P'
export type HouseStoreys = 2 | 3
export type StoreyHeights = {ground:number;upper:number}
export type BlockType = 'house' | 'apartment' | 'office' | 'pbsa'
export type Block = {id:string; name:string; type:BlockType; line:Point[]; depth:number; floors:number; ground:number; upper:number; level:number; houseType:HouseType; setbacks?:Point[]; apartmentLayout?:ApartmentOptions}
export const defaultApartmentAreaPerHome=80
export type Project = {houseHeights?:StoreyHeights;apartmentAreaPerHome?:number; apartmentSettings?:ApartmentSettings; anchor?:{lat:number;lon:number}; boundary:Point[]; blocks:Block[]; targets:Record<HouseType,number>; colours:Record<HouseType,string>}
export const defaults = { frontage:4.5, external:0.6, party:0.3, houseFloors:3, houseHeight:3 }
export const blockTypes:Record<BlockType,{label:string;legend:string;depth:number;ground:number;upper:number;floors:number}>={
  house:{label:'House terrace',legend:'Houses',depth:0,ground:defaults.houseHeight,upper:defaults.houseHeight,floors:defaults.houseFloors},
  apartment:{label:'Apartment block',legend:'Apartments',depth:18,ground:4.5,upper:3,floors:4},
  office:{label:'Office',legend:'Offices',depth:18,ground:4.5,upper:4,floors:4},
  pbsa:{label:'Student accommodation (PBSA)',legend:'PBSA',depth:16,ground:4.5,upper:3,floors:4}
}
export const length = (a:Point,b:Point) => Math.hypot(b[0]-a[0],b[1]-a[1])
const signedArea = (p:Point[]) => p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-a[1]*b[0]},0)/2
export const area = (p:Point[]) => Math.abs(signedArea(p))
export const frontage = (p:Point[]) => p.slice(1).reduce((sum,b,i)=>sum+length(p[i],b),0)
export const houseFrontage = (storeys:HouseStoreys) => storeys===2?5.5:defaults.frontage
export const depthFor = (target:number,storeys:HouseStoreys=3) =>
  target / storeys / (houseFrontage(storeys)-defaults.party) + 2*defaults.external
export const blockStoreys={min:1,max:30}
export const houseStoreys=(b:Block):HouseStoreys=>b.floors===2?2:3
export const floors = (b:Block) => b.type==='house' ? houseStoreys(b) : b.floors
export const defaultHouseHeights:StoreyHeights={ground:defaults.houseHeight,upper:defaults.houseHeight}
export const ceilingAllowance=.3
export const minimumDwellingStoreyHeight=2.6
export const meetsDwellingCeiling=(height:number)=>height-ceilingAllowance>=ndssCeiling.clearHeight-1e-7
export const levels = (b:Block,houseHeights=defaultHouseHeights) => {
  const {ground,upper}=b.type==='house'?houseHeights:b
  return Array.from({length:floors(b)},(_,i)=>ground+i*upper)
}
export const height = (b:Block,houseHeights=defaultHouseHeights) => levels(b,houseHeights).at(-1)??0
export const houseAreaTarget=(type:HouseType,storeys:HouseStoreys,targets:Project['targets'])=>
  storeys===2?ndss[type].areas[1]:targets[type]
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
function houseUnits(line:Point[],target:number,storeys:HouseStoreys) {
  const width=houseFrontage(storeys)
  const depth=depthFor(target,storeys)
  const clearDepth=depth-2*defaults.external
  return line.slice(1).flatMap((end,i)=>{
    const start=line[i],count=Math.floor((length(start,end)+1e-7)/width)
    return Array.from({length:count},(_,j)=>{
      const left=j===0?defaults.external:defaults.party/2
      const right=j===count-1?defaults.external:defaults.party/2
      const internalWidth=width-(j===0?left:0)-(j===count-1?right:0)
      const front=pointAlong(start,end,j*width+left),rear=pointAlong(start,end,(j+1)*width-right)
      return {
        outline:rectangle(pointAlong(start,end,j*width),pointAlong(start,end,(j+1)*width),depth),
        innerOutline:rectangle(offset(front,end,defaults.external),offset(rear,start,-defaults.external),clearDepth),
        internalArea:internalWidth*clearDepth,
        usableArea:(width-left-right)*clearDepth
      }
    })
  })
}
export function houseFloorplates(b:Block,targets:Project['targets']){
  const storeys=houseStoreys(b)
  return houseUnits(b.line.filter((p,i)=>!i||length(p,b.line[i-1])>.01),houseAreaTarget(b.houseType,storeys,targets),storeys)
    .map(({outline,innerOutline})=>({outline,innerOutline}))
}
export function footprints(b:Block,targets:Project['targets']):Point[][] {
  const line=b.line.filter((p,i)=>!i||length(p,b.line[i-1])>.01)
  if(line.length<2) return []
  if(b.type==='house') return houseUnits(line,houseAreaTarget(b.houseType,houseStoreys(b),targets),houseStoreys(b)).map(unit=>unit.outline)
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
export function editGroundFrontage(block:Block,line:Point[]):Block {
  const updated={...block,line}
  if(block.type==='house'||block.floors<2)return updated
  const sides=[0,1].map(side=>{
    const oldEnd=side?block.line.at(-1)!:block.line[0]
    const newEnd=side?line.at(-1)!:line[0]
    const oldDirection=endDirection(block,side),direction=endDirection(updated,side)
    const [dx,dy]=minus(oldEnd,newEnd)
    return {shift:dx*direction[0]+dy*direction[1],
      alignment:oldDirection[0]*direction[0]+oldDirection[1]*direction[1]}
  })
  const setbacks=levels(block).map((_,floor):Point=>{
    if(!floor)return [0,0]
    return sides.map(({shift,alignment},side)=>{
      const oldInset=endInset(block,floor)[side]
      const inset=oldInset<1e-7?0:Math.max(0,shift+alignment*oldInset)
      return inset<1e-7?0:inset
    }) as Point
  })
  return block.setbacks||setbacks.some(([a,b])=>a||b)?{...updated,setbacks}:updated
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
function validBlockFloors(block:Block,outline:Point[]) {
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
    }) && internalFloorArea(polygon)!==null
  })
}
export function resizeStoreys(block:Block,floors:number):Block {
  if(block.floors===floors)return block
  return block.setbacks ? {...block,floors,setbacks:block.setbacks.slice(0,floors)} : {...block,floors}
}
export function adjustSetback(block:Block,targets:Project['targets'],floor:number,end:number,delta:number,step:number):Block {
  if(block.type==='house'||floor<=0||floor>=block.floors)return block
  const original=endInset(block,floor)[end]
  const sharesEdge=(inset:number)=>Math.abs(inset-original)<1e-7
  let first=floor
  if(delta<0){
    while(first>1&&sharesEdge(endInset(block,first-1)[end]))first--
  }
  const minimum=endInset(block,first-1)[end]
  const extendsGround=delta<0&&first===1&&sharesEdge(0)
  const movement=extendsGround?delta:Math.max(minimum-original,delta)
  if(Math.abs(movement)<1e-7)return block
  const outline=footprints(block,targets)[0]
  if(!outline)return block
  const apply=(offset:number):Block=>{
    if(extendsGround){
      const line=[...block.line]
      const index=end?line.length-1:0
      const [x,y]=line[index]
      const [dx,dy]=endDirection(block,end)
      line[index]=[x+dx*offset,y+dy*offset]
      return editGroundFrontage(block,line)
    }
    return {...block,setbacks:levels(block).map((_,i)=>{
      const values=[...endInset(block,i)] as Point
      if(i>=first&&sharesEdge(values[end]))values[end]=original+offset
      else if(i>floor)values[end]=Math.max(values[end],original+offset)
      return values
    })}
  }
  const valid=(candidate:Block)=>extendsGround?footprintSatisfies(candidate,targets):validBlockFloors(candidate,outline)
  const requested=apply(movement)
  if(valid(requested))return requested
  let low=0,high=1
  for(let i=0;i<22;i++){
    const mid=(low+high)/2
    if(valid(apply(movement*mid)))low=mid
    else high=mid
  }
  const accepted=movement*low
  const bounded=step?Math.sign(accepted)*Math.floor(Math.abs(accepted)/step)*step:accepted
  return Math.abs(bounded)>1e-6?apply(bounded):block
}
export function internalFloorOutline(poly:Point[]) {
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
  )?inner:null
}
function internalFloorArea(poly:Point[]) {
  const inner=internalFloorOutline(poly)
  return inner?area(inner):null
}
export function blockStats(b:Block,p:Project) {
  const units=b.type==='house'?houseUnits(b.line.filter((p,i)=>!i||length(p,b.line[i-1])>.01),houseAreaTarget(b.houseType,houseStoreys(b),p.targets),houseStoreys(b)):null
  const outlines=units?units.map(unit=>unit.outline):footprints(b,p.targets)
  const footprint=outlines.reduce((sum,poly)=>sum+area(poly),0)
  const floorAreas=levels(b).map((_,i)=>{
    if(units)return {gea:footprint,gia:units.reduce((sum,unit)=>sum+unit.internalArea,0)}
    if(!outlines[0])return {gea:0,gia:0}
    const polygon=floorOutline(b,outlines[0],i)
    return {gea:area(polygon),gia:internalFloorArea(polygon)}
  })
  const gross=floorAreas.reduce((sum,floor)=>sum+floor.gea,0)
  const gia=floorAreas.some(floor=>floor.gia===null)?null:floorAreas.reduce((sum,floor)=>sum+(floor.gia??0),0)
  const outside=p.boundary.length>=3 && outlines.some(poly=>poly.some((a,i)=>
    !inside(a,p.boundary) || p.boundary.some((c,j)=>intersects(a,poly[(i+1)%poly.length],c,p.boundary[(j+1)%p.boundary.length]))
  ))
  const houses=b.type==='house'?outlines.length:0
  const usable=units?units.reduce((sum,unit)=>sum+unit.usableArea,0)*floors(b):0
  return {footprint, gross, gia, houses, usable, outside, floorAreas}
}
export function development(p:Project) {
  const site=area(p.boundary)
  const giaByUse:Record<BlockType,number|null>={house:0,apartment:0,office:0,pbsa:0}
  const mix=Object.fromEntries(dwellingTypes.map(type=>[type,0])) as Record<DwellingType,number>
  const apartmentMix={...mix}
  const houseMix:Record<HouseType,number>={'3B5P':0,'3B6P':0}
  let generatedApartments=0,estimatedGia:number|null=0
  let targetAchieving=0,generatedUsable=0,coreArea=0,corridorArea=0
  let measuredGia:number|null=0
  const totals=p.blocks.reduce((total,b)=>{
    const s=blockStats(b,p)
    if(b.type==='house'){
      measuredGia=measuredGia===null||s.gia===null?null:measuredGia+s.gia
      mix[b.houseType]+=s.houses
      houseMix[b.houseType]+=s.houses
    }
    if(b.type==='apartment'){
      const layout=apartmentLayout(b,p)
      if(layout?.ok){
        measuredGia=measuredGia===null||s.gia===null?null:measuredGia+s.gia
        layout.floors.forEach(f=>{
          coreArea+=f.coreArea
          corridorArea+=f.corridorArea
          f.units.forEach(unit=>{
            generatedApartments++
            mix[unit.type]++
            apartmentMix[unit.type]++
            generatedUsable+=unit.area
            if(unit.area+1e-7>=unit.target)targetAchieving++
          })
        })
      }else{
        estimatedGia=estimatedGia===null||s.gia===null?null:estimatedGia+s.gia
      }
    }
    const useGia=giaByUse[b.type]
    giaByUse[b.type]=useGia===null||s.gia===null?null:useGia+s.gia
    return {gross:total.gross+s.gross,gia:total.gia===null||s.gia===null?null:total.gia+s.gia,footprint:total.footprint+s.footprint,houses:total.houses+s.houses,usable:total.usable+s.usable}
  },{gross:0,gia:0 as number|null,footprint:0,houses:0,usable:0})
  const savedArea=p.apartmentAreaPerHome
  const apartmentAreaPerHome=savedArea!==undefined&&Number.isFinite(savedArea)&&savedArea>=1?savedArea:defaultApartmentAreaPerHome
  const estimatedApartments=estimatedGia===null?null:Math.floor(estimatedGia/apartmentAreaPerHome)
  const apartments=estimatedApartments===null?null:generatedApartments+estimatedApartments
  const homes=apartments===null?null:totals.houses+apartments
  return {...totals,giaByUse,apartmentAreaPerHome,estimatedApartments,generatedApartments,apartments,homes,site,mix,apartmentMix,houseMix,targetAchieving,generatedUsable,coreArea,corridorArea,
    efficiency:measuredGia?(totals.usable+generatedUsable)*100/measuredGia:null,
    density:homes===null?null:site?homes*10000/site:0,coverage:site?totals.footprint/site*100:0}
}
export function newBlock(project:Project,type:Block['type'],line:Point[]):Block {
  let index=0
  const label=(n:number):string=>(n>=26?label(Math.floor(n/26)-1):'')+String.fromCharCode(65+n%26)
  while(project.blocks.some(b=>b.name==='Block '+label(index))) index++
  const {depth,floors,ground,upper}=blockTypes[type]
  return {id:crypto.randomUUID(),name:'Block '+label(index),type,line,depth,floors,ground,upper,level:0,houseType:'3B5P'}
}
export function csv(p:Project) {
  const headings=['Block','Type','Storeys','Height (m)','Footprint (m²)','External floor area (m²)','Houses','House type','Modelled usable house area (m²)','Site area (m²)']
  const fixed=(n:number)=>n.toFixed(2)
  const rows=p.blocks.map(b=>{const s=blockStats(b,p);return [b.name,b.type,floors(b),fixed(height(b,p.houseHeights)),fixed(s.footprint),fixed(s.gross),s.houses,b.type==='house'?b.houseType:'',fixed(s.usable),'']})
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
  if(block.type!=='house')return !!polygons[0]&&validPolygon(polygons[0])&&validBlockFloors(block,polygons[0])
  return polygons.length>0 && polygons.every((poly,index)=>
    validPolygon(poly) && !polygons.slice(0,index).some(other=>overlapRectangles(poly,other))
  )
}
