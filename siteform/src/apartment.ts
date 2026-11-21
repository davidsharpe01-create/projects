import {area,defaults,endInset,length,validPolygon,inside,type Block,type Point,type Project} from './model.ts'
import {defaultMix,defaultTargets,dwellingTypes,ndss,type DwellingType} from './ndss.ts'

export type ApartmentOptions={mode:'single'|'double';coreSide:'front'|'rear';hrbCores:1|2;mix?:Record<DwellingType,number>;commercial?:number;communal?:number;corePosition?:number}
export type ApartmentSettings={corridor:number;nonHrbTravel:number;hrbTravel:number;betweenCoreTravel:number;frontages:[number,number,number];
  targets:Partial<Record<DwellingType,number>>;colours?:Partial<Record<DwellingType,string>>;mix:Record<DwellingType,number>}
export const defaultApartmentOptions:ApartmentOptions={mode:'double',coreSide:'front',hrbCores:1}
export const defaultApartmentSettings:ApartmentSettings={corridor:1.5,nonHrbTravel:30,hrbTravel:15,betweenCoreTravel:30,frontages:[5.5,7,9],targets:{},mix:defaultMix}
const corridorWall=.3
const eps=1e-7
type Span=[number,number]
type Bay={y:Span;side:'front'|'rear'}
type Unit={id:string;type:DwellingType;outline:Point[];area:number;minimum:number;target:number}
type LocalUnit={x:Span;bay:Bay;type:DwellingType;area:number;minimum:number;target:number}
type ApartmentBayUnit=LocalUnit & {outline?:Point[];corridorStations?:Span;corridorJunctions?:[Point,Point]}
type TravelRoute={points:Point[];distance:number;betweenCores:boolean}
export type ApartmentFloor={units:Unit[];cores:Point[][];corridor:Point[];uses:{kind:'commercial'|'communal';outline:Point[]}[];coreArea:number;corridorArea:number;travel:number;betweenCores:number;travelRoutes:TravelRoute[]}
type Layout={ok:true;floors:ApartmentFloor[];hrb:boolean;topStoreyHeight:number;cornerCores:boolean;endHomes:number}
export type ApartmentResult=Layout|{ok:false;reason:string;floor?:number}
type Inputs=Pick<Project,'targets'|'apartmentSettings'>
export const apartmentSettings=(project:Inputs)=>({...defaultApartmentSettings,...project.apartmentSettings})
export const areaTarget=(type:DwellingType,project:Inputs)=>{
  if(type==='3B5P'||type==='3B6P')return Math.max(ndss[type].areas[0],project.targets[type])
  return Math.max(ndss[type].areas[0],apartmentSettings(project).targets[type]??defaultTargets[type])
}

function allocate(span:Span,bay:Bay,project:Inputs,options:ApartmentSettings) {
  const width=span[1]-span[0],depth=bay.y[1]-bay.y[0]
  const mixTotal=dwellingTypes.reduce((sum,t)=>sum+options.mix[t],0)
  const items=dwellingTypes.map(type=>{
    const minimum=ndss[type].areas[0],target=areaTarget(type,project)
    const front=options.frontages[ndss[type].beds-1]
    const share=mixTotal?options.mix[type]/mixTotal:1/dwellingTypes.length
    return {type,minimum,target,share,min:Math.max(front,minimum/depth+defaults.party),
      desired:Math.max(front,target/depth+defaults.party)}
  })
  const narrowest=Math.min(...items.map(t=>t.min))
  let best:{score:number;items:typeof items}|undefined
  for(let count=1;count<=Math.min(200,Math.floor((width+eps)/narrowest));count++){
    const used=new Map<DwellingType,number>()
    let remaining=width
    const selection:typeof items=[]
    for(let i=0;i<count;i++){
      const feasible=items.filter(t=>remaining+eps>=t.min+(count-i-1)*narrowest)
      feasible.sort((a,b)=>(b.share*count-(used.get(b.type)??0))-(a.share*count-(used.get(a.type)??0))||a.desired-b.desired)
      const item=feasible[0]
      if(!item)break
      selection.push(item)
      remaining-=item.min
      used.set(item.type,(used.get(item.type)??0)+1)
    }
    if(selection.length!==count)continue
    const deviation=items.reduce((sum,t)=>sum+Math.abs((used.get(t.type)??0)/count-t.share),0)
    const desired=selection.reduce((sum,t)=>sum+t.desired,0)
    const score=deviation*1.6+Math.max(0,desired-width)/width*2+Math.max(0,width-desired)/width*.65
    if(!best||score<best.score-eps)best={score,items:selection}
  }
  if(!best)return []
  const units=best.items
  const minimum=units.reduce((sum,item)=>sum+item.min,0)
  const desired=units.reduce((sum,item)=>sum+item.desired,0)
  const toTarget=desired>minimum?Math.min(1,(width-minimum)/(desired-minimum)):0
  const surplus=Math.max(0,width-desired)
  let x=span[0]
  return units.map((item,i):LocalUnit=>{
    const available=item.min+(item.desired-item.min)*toTarget+surplus*item.desired/desired
    const next=i===units.length-1?span[1]:x+available
    const clear:Span=[x+defaults.party/2,next-defaults.party/2]
    x=next
    return {x:clear,bay,type:item.type,area:(clear[1]-clear[0])*depth,minimum:item.minimum,target:item.target}
  })
}

export function solveApartments(block:Block,project:Inputs):ApartmentResult {
  if(block.type!=='apartment'||!block.apartmentLayout)return {ok:false,reason:'This block has no apartment subdivision.'}
  const config=block.apartmentLayout
  const settings={...apartmentSettings(project),...(config.mix?{mix:config.mix}:{})}
  const line=block.line.filter((p,i)=>!i||length(p,block.line[i-1])>.01)
  if(line.length<2)return {ok:false,reason:'The frontage is too short.'}
  const stations=[0]
  const directions=line.slice(1).map((end,i):Point=>{
    const start=line[i],size=length(start,end)
    stations.push(stations[i]+size)
    return [(end[0]-start[0])/size,(end[1]-start[1])/size]
  })
  const span=stations.at(-1)!
  const turns=directions.slice(1).map(([x,y],i)=>directions[i][0]*y-directions[i][1]*x)
  const bends=turns.flatMap((turn,i)=>Math.abs(turn)>.0001?[{x:stations[i+1],side:turn>0?'rear' as const:'front' as const}]:[])
  const offsets=line.map((_,i):Point=>{
    const [ax,ay]=directions[Math.max(0,i-1)], [bx,by]=directions[Math.min(i,directions.length-1)]
    const scale=1+ax*bx+ay*by
    return [-(ay+by)/scale,(ax+bx)/scale]
  })
  const atVertex=(i:number,y:number):Point=>[line[i][0]+offsets[i][0]*y,line[i][1]+offsets[i][1]*y]
  const segment=(x:number)=>{
    const end=stations.findIndex((station,i)=>i>0&&x<=station+eps)
    return end<0?directions.length-1:end-1
  }
  const point=(x:number,y:number):Point=>{
    const i=segment(x),a=atVertex(i,y),b=atVertex(i+1,y)
    const t=(x-stations[i])/(stations[i+1]-stations[i])
    return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]
  }
  function wingFrame(i:number){
    const [dx,dy]=directions[i],[ox,oy]=line[i]
    const projectAlong=([x,y]:Point)=>(x-ox)*dx+(y-oy)*dy
    const offsetAt=(x:number,y:number)=>projectAlong(point(x,y))
    const worldPoint=(x:number,y:number):Point=>[ox+x*dx-y*dy,oy+x*dy+y*dx]
    function stationAt(x:number,y:number){
      const start=projectAlong(atVertex(i,y)),end=projectAlong(atVertex(i+1,y))
      return stations[i]+(x-start)*(stations[i+1]-stations[i])/(end-start)
    }
    function rectangularRun([a,b]:Span,[near,far]:Span):Span{
      return [Math.max(offsetAt(a,near),offsetAt(a,far)),Math.min(offsetAt(b,near),offsetAt(b,far))]
    }
    function stationBounds([left,right]:Span,[near,far]:Span):Span{
      return [Math.min(stationAt(left,near),stationAt(left,far)),Math.max(stationAt(right,near),stationAt(right,far))]
    }
    function rectangle([left,right]:Span,[near,far]:Span):Point[]{
      return [worldPoint(left,near),worldPoint(right,near),worldPoint(right,far),worldPoint(left,far)]
    }
    return {offsetAt,worldPoint,stationAt,rectangularRun,stationBounds,rectangle}
  }
  function cornerBand(vertex:number,y:Span,leg:number,rightLeg=leg){
    const left=wingFrame(vertex-1),right=wingFrame(vertex),x=stations[vertex]
    const leftCuts=y.map(depth=>left.offsetAt(x,depth)),rightCuts=y.map(depth=>right.offsetAt(x,depth))
    const a=Math.min(...leftCuts)-leg,b=Math.max(...rightCuts)+rightLeg
    const outline=[left.worldPoint(a,y[0]),atVertex(vertex,y[0]),right.worldPoint(b,y[0]),
      right.worldPoint(b,y[1]),atVertex(vertex,y[1]),left.worldPoint(a,y[1])]
    return {outline,a,b,left,right,
      runs:[{wing:vertex-1,run:[a,Math.max(...leftCuts)] as Span},{wing:vertex,run:[Math.min(...rightCuts),b] as Span}]}
  }
  const along=([a,b]:Span,y:number):Point[]=>[a,...bends.map(bend=>bend.x).filter(x=>x>a+eps&&x<b-eps),b].map(x=>point(x,y))
  const polygon=(x:Span,y:Span)=>[...along(x,y[0]),...along(x,y[1]).reverse()]
  // Each ribbon segment interpolates between parallel offsets joined at their miters.
  const endLimits=(insets:Point,y:number):Span=>{
    const ends:[number,number]=[0,directions.length-1]
    const [left,right]=ends.map((i,end)=>{
      const a=atVertex(i,y),b=atVertex(i+1,y)
      return (insets[end]+defaults.external)*(stations[i+1]-stations[i])/length(a,b)
    })
    return [left,span-right]
  }
  const routeLength=(points:Point[])=>points.slice(1).reduce((total,p,i)=>total+length(points[i],p),0)
  const D=block.depth,E=defaults.external
  const double=config.mode==='double'
  const clearBay=(D-2*E-settings.corridor-(double?2:1)*corridorWall)/(double?2:1)
  if(clearBay<=0)return {ok:false,reason:'The block is too shallow for the corridor and apartments.'}
  const singleFront=(bends[0]?.side??config.coreSide)==='front'
  const corridorY:Span=double?[(D-settings.corridor)/2,(D+settings.corridor)/2]:
    singleFront?[D-E-settings.corridor,D-E]:[E,E+settings.corridor]
  const bays:Bay[]=[]
  if(double||singleFront)bays.push({side:'front',y:[E,corridorY[0]-corridorWall]})
  if(double||!singleFront)bays.push({side:'rear',y:[corridorY[1]+corridorWall,D-E]})
  const defaultSide=double?config.coreSide:singleFront?'front':'rear'
  const coreDepths=(side:Bay['side']):Span=>side==='front'?[E,corridorY[0]-corridorWall]:[corridorY[1]+corridorWall,D-E]
  if(!offsets.every(p=>p.every(Number.isFinite))||directions.some(([dx,dy],i)=>{
    const a=atVertex(i,D),b=atVertex(i+1,D)
    return (b[0]-a[0])*dx+(b[1]-a[1])*dy<=eps
  })||!validPolygon(polygon([0,span],[0,D]))){
    return {ok:false,reason:'The bend is too tight for this building depth. Open the angle, extend the frontage or reduce the depth.'}
  }
  const topStoreyHeight=Math.max(0,block.level+(block.floors>1?block.ground+(block.floors-2)*block.upper:0))
  const threshold=block.floors>=7||topStoreyHeight>=18
  const spans=Array.from({length:block.floors},(_,i):Span=>{
    const insets=endInset(block,i)
    const front=endLimits(insets,E),rear=endLimits(insets,D-E)
    return [Math.max(front[0],rear[0]),Math.min(front[1],rear[1])]
  })
  const interiors=spans.map((_,floor)=>{
    const insets=endInset(block,floor)
    return [...along(endLimits(insets,E),E),...along(endLimits(insets,D-E),D-E).reverse()]
  })
  const fitsTop=(outline:Point[])=>validPolygon(outline)&&outline.every(p=>inside(p,interiors.at(-1)!))
  function generate(hrb:boolean,coreCount:number,shift=0,preferNextWing=false,oppositeRun=-1,alternateShift=false):ApartmentResult {
    const primaryArea=hrb&&config.hrbCores===1?70:50
    const top=spans.at(-1)!
    const targets=bends.map(bend=>({...bend,side:double?bend.side:defaultSide,corner:true}))
    const [lo,hi]=spans[0]
    if(bends.length){
      const ends=[lo,...bends.map(bend=>bend.x),hi]
      const runs=ends.slice(1).map((end,i)=>({start:ends[i],end,extras:0}))
      for(let remaining=coreCount-bends.length;remaining>0;remaining--){
        const spacing=(run:typeof runs[number])=>(run.end-run.start)/(run.extras+1)
        runs.reduce((longest,run)=>spacing(run)>spacing(longest)?run:longest).extras++
      }
      runs.forEach(({start,end,extras},i)=>{
        for(let n=1;n<=extras;n++){
          const offset=alternateShift&&i%2?-shift:shift
          const x=start+(end-start)*(n+offset)/(extras+1)
          const before=bends[i-1],after=bends[i]
          const nearest=before&&(!after||x-before.x<=after.x-x)?before:after
          const preferred=double?(nearest?.side??defaultSide):defaultSide
          const side=double&&i===oppositeRun?(preferred==='front'?'rear':'front'):preferred
          targets.push({x,side,corner:false})
        }
      })
    }else{
      for(let i=0;i<coreCount;i++){
        const x=lo+(hi-lo)*((i+.5+shift)/coreCount+((config.corePosition??50)-50)/100)
        targets.push({x,side:defaultSide,corner:false})
      }
    }
    targets.sort((a,b)=>a.x-b.x)
    const primary=targets.findIndex(target=>target.corner)
    const coreAreas=targets.map((_,i)=>i===Math.max(primary,0)?primaryArea:50)
    const widths=targets.map(({x,side},i)=>{
      const y=coreDepths(side)
      if(!bends.length)return coreAreas[i]/(y[1]-y[0])
      let low=0,high=top[1]-top[0]
      for(let step=0;step<32;step++){
        const width=(low+high)/2
        const left=Math.max(top[0],Math.min(top[1]-width,x-width/2))
        if(area(polygon([left,left+width],y))<coreAreas[i])low=width
        else high=width
      }
      return high
    })
    const totalWidth=widths.reduce((sum,width)=>sum+width,0)
    const unfit=spans.findIndex(([a,b])=>b-a<totalWidth+eps)
    if(unfit>=0)return {ok:false,floor:unfit,reason:`Floor ${unfit} cannot fit the ${coreCount===1?primaryArea+' m² core':coreCount+' aligned cores'}.`}
    let usedWidth=0,previousEnd=top[0]
    const cores=targets.map(({x,side},i)=>{
      const width=widths[i]
      const left=Math.max(previousEnd,Math.min(top[1]-totalWidth+usedWidth,x-width/2))
      usedWidth+=width
      previousEnd=left+width
      return {x:[left,previousEnd] as Span,side,pointAtEdge:undefined as ((station:number)=>Point)|undefined}
    })
    const corridorCentre=(corridorY[0]+corridorY[1])/2
    const reserved=cores.map(core=>({x:core.x,side:core.side,wing:-1,run:core.x}))
    const cornerBlocks:{wing:number;run:Span;side:Bay['side']}[]=[]
    const corePolygons=cores.map((core,index)=>{
      const y=coreDepths(core.side)
      if(!bends.length)return polygon(core.x,y)
      const target=targets[index]
      if(target.corner){
        const vertex=stations.indexOf(target.x)
        let low=0,high=coreAreas[index]/(y[1]-y[0])
        for(let step=0;step<40;step++){
          const leg=(low+high)/2
          if(area(cornerBand(vertex,y,leg).outline)<coreAreas[index])low=leg
          else high=leg
        }
        const band=cornerBand(vertex,y,Math.max(.35,high))
        const overlaps=band.runs.some(run=>[...reserved,...cornerBlocks].some(other=>
          other.side===core.side&&other.wing===run.wing&&other.run[0]<run.run[1]-eps&&other.run[1]>run.run[0]+eps))
        if(!overlaps&&fitsTop(band.outline)){
          const edge=core.side==='front'?y[1]:y[0]
          core.x=[band.left.stationAt(band.a,corridorCentre),band.right.stationAt(band.b,corridorCentre)]
          reserved[index].x=[Math.min(...y.map(depth=>band.left.stationAt(band.a,depth))),
            Math.max(...y.map(depth=>band.right.stationAt(band.b,depth)))]
          cornerBlocks.push(...band.runs.map(run=>({...run,side:core.side})))
          core.pointAtEdge=station=>point(station,edge)
          return band.outline
        }
      }
      const middle=target.corner?target.x:(core.x[0]+core.x[1])/2
      const wing=segment(middle)
      const candidates=target.corner?(preferNextWing?[wing+1,wing]:[wing,wing+1]):[wing]
      const edge=core.side==='front'?y[1]:y[0]
      const width=coreAreas[index]/(y[1]-y[0])
      for(const i of candidates){
        const frame=wingFrame(i)
        const lo=Math.max(top[0],stations[i],reserved[index-1]?.x[1]??top[0])
        const hi=Math.min(top[1],stations[i+1],reserved[index+1]?.x[0]??top[1])
        if(hi-lo<=eps)continue
        const [start,end]=frame.rectangularRun([lo,hi],y)
        if(end-start<width-eps)continue
        const desired=target.corner?(i===wing?end-width:start):frame.offsetAt(middle,edge)-width/2
        const left=Math.max(start,Math.min(end-width,desired))
        const run:Span=[left,left+width]
        reserved[index].x=frame.stationBounds(run,y)
        reserved[index].wing=i
        reserved[index].run=run
        core.x=[frame.stationAt(run[0],corridorCentre),frame.stationAt(run[1],corridorCentre)]
        core.pointAtEdge=station=>frame.worldPoint(frame.offsetAt(station,corridorCentre),edge)
        return frame.rectangle(run,y)
      }
      return null
    })
    if(corePolygons.some(poly=>poly===null)||bends.length&&cores.some((core,i)=>
      i>0&&(core.x[0]<=cores[i-1].x[1]||routeLength(along([cores[i-1].x[1],core.x[0]],corridorCentre))<3-eps))){
      return {ok:false,reason:'The floorplate cannot fit these aligned cores with clear space between them.'}
    }
    const coreOutlines=corePolygons.filter(poly=>poly!==null)
    const totalCoreArea=bends.length?coreOutlines.reduce((sum,poly)=>sum+area(poly),0):coreAreas.reduce((sum,value)=>sum+value,0)
    const coreRoutes=cores.slice(1).map((core,i):TravelRoute=>{
      const points=along([cores[i].x[1],core.x[0]],corridorCentre)
      return {points,distance:routeLength(points),betweenCores:true}
    }).filter(route=>route.distance>eps)
    const betweenCores=Math.max(0,...coreRoutes.map(route=>route.distance))
    const cornerUnits:{unit:ApartmentBayUnit;floors:number}[]=[]
    for(const bend of bends){
      const vertex=stations.indexOf(bend.x)
      const bay=bays.find(bay=>bay.side!==bend.side)
      if(!bay)continue
      const outer=bay.side==='front'?bay.y[0]:bay.y[1]
      const edge=bay.side==='front'?corridorY[0]:corridorY[1]
      const baseArea=area(cornerBand(vertex,bay.y,0).outline)
      const bayDepth=bay.y[1]-bay.y[0]
      let best:{unit:ApartmentBayUnit;floors:number;band:ReturnType<typeof cornerBand>}|undefined
      for(const type of ['2B4P','2B3P','1B2P','1B1P'] as const){
        const minimum=ndss[type].areas[0],target=areaTarget(type,project)
        for(const desired of [target,minimum]){
          const metres=Math.max(.7,(desired-baseArea)/bayDepth)
          for(const share of [.5,.25,.75,0,1]){
            const leftLeg=Math.max(.35,Math.min(metres-.35,metres*share))
            const band=cornerBand(vertex,bay.y,leftLeg,metres-leftLeg)
            const [left,right]=[band.left.worldPoint(band.a,outer),band.right.worldPoint(band.b,outer)]
            const frontage=length(left,atVertex(vertex,outer))+length(atVertex(vertex,outer),right)
            const size=area(band.outline)
            if(size<minimum-eps||frontage<settings.frontages[ndss[type].beds-1]||!validPolygon(band.outline))continue
            if(band.runs.some(run=>[...reserved,...cornerBlocks].some(core=>core.side===bay.side&&core.wing===run.wing&&
              core.run[0]<run.run[1]+defaults.party-eps&&core.run[1]>run.run[0]-defaults.party+eps)))continue
            const firstCut=interiors.findIndex(interior=>!band.outline.every(p=>inside(p,interior)))
            const floors=firstCut<0?block.floors:firstCut
            if(!floors||best&&best.floors>=floors)continue
            const x:Span=[band.left.stationAt(band.a,corridorCentre),band.right.stationAt(band.b,corridorCentre)]
            best={band,floors,unit:{x,bay,type,area:size,minimum,target,outline:band.outline,
              corridorStations:x,corridorJunctions:[band.left.worldPoint(band.a,edge),band.right.worldPoint(band.b,edge)]}}
            if(floors===block.floors)break
          }
          if(best?.floors===block.floors)break
        }
        if(best?.floors===block.floors)break
      }
      if(!best)continue
      cornerBlocks.push(...best.band.runs.map(run=>({...run,side:bay.side})))
      cornerUnits.push(best)
    }
    const ranges:{zone:Span;eligible:Bay[];wing?:number}[]=[]
    function addRange(zone:Span,eligible:Bay[],wing?:number){
      if(zone[1]-zone[0]>eps&&eligible.length)ranges.push({zone,eligible,wing})
    }
    function bayLimits(wing:number,bay:Bay,floor:number):Span{
      const [start,end]=wingFrame(wing).rectangularRun([stations[wing],stations[wing+1]],bay.y)
      const [left,right]=endInset(block,floor)
      return [wing===0?Math.max(start,left+E):start,wing===directions.length-1?Math.min(end,stations[wing+1]-stations[wing]-right-E):end]
    }
    // Obstructions already have clear outlines. Allocate up to the wall centreline.
    const halfParty=defaults.party/2
    if(!bends.length){
      let x=lo
      for(const core of cores){
        const left=Math.max(x,core.x[0]-halfParty),right=Math.min(hi,core.x[1]+halfParty)
        addRange([x,left],bays)
        addRange([left,right],bays.filter(bay=>bay.side!==core.side))
        x=right
      }
      addRange([x,hi],bays)
    }else{
      for(const bay of bays){
        for(let wing=0;wing<directions.length;wing++){
          const [start,end]=bayLimits(wing,bay,0)
          let x=start
          const obstructions=[...reserved,...cornerBlocks].filter(core=>core.wing===wing&&core.side===bay.side)
            .sort((a,b)=>a.run[0]-b.run[0])
          for(const core of obstructions){
            addRange([x,Math.min(end,core.run[0]-halfParty)],[bay],wing)
            x=Math.max(x,core.run[1]+halfParty)
          }
          addRange([x,end],[bay],wing)
        }
      }
    }
    function bentUnit(unit:LocalUnit,wing:number,run:Span):ApartmentBayUnit{
      const frame=wingFrame(wing),[left,right]=run
      const corridorEdge=unit.bay.side==='front'?corridorY[0]:corridorY[1]
      return {...unit,x:run,outline:frame.rectangle(run,unit.bay.y),
        area:(right-left)*(unit.bay.y[1]-unit.bay.y[0]),
        corridorStations:[frame.stationAt(left,corridorCentre),frame.stationAt(right,corridorCentre)],
        corridorJunctions:[frame.worldPoint(left,corridorEdge),frame.worldPoint(right,corridorEdge)]}
    }
    function allocateRange(zone:Span,eligible:Bay[],wing?:number):ApartmentBayUnit[]{
      const units=allocate(zone,eligible[0],project,settings).flatMap(unit=>eligible.map(bay=>({...unit,bay})))
      return wing===undefined?units:units.map(unit=>bentUnit(unit,wing,unit.x))
    }
    const typical=ranges.map(({zone,eligible,wing})=>allocateRange(zone,eligible,wing))
    if(bends.length&&double){
      // Use an opposite row as a partition template when the remaining
      // frontage can still be filled without losing an apartment.
      for(const [index,{zone,eligible:[bay],wing}] of ranges.entries()){
        if(wing===undefined)continue
        const original=typical[index]
        const originalArea=original.reduce((sum,unit)=>sum+unit.area,0)
        let mirrored=0
        for(const [other,range] of ranges.entries()){
          if(range.wing!==wing||range.eligible[0]===bay)continue
          const matches=typical[other].filter(unit=>unit.x[0]-defaults.party/2>=zone[0]-eps&&unit.x[1]+defaults.party/2<=zone[1]+eps)
          if(matches.length<=mirrored)continue
          const left=matches[0].x[0]-defaults.party/2,right=matches.at(-1)!.x[1]+defaults.party/2
          const candidate=[
            ...allocateRange([zone[0],left],[bay],wing),
            ...matches.map(unit=>bentUnit({...unit,bay},wing,unit.x)),
            ...allocateRange([right,zone[1]],[bay],wing)
          ]
          if(candidate.length<original.length||candidate.reduce((sum,unit)=>sum+unit.area,0)<originalArea-defaults.party*clearBay-eps)continue
          typical[index]=candidate
          mirrored=matches.length
        }
      }
    }
    const available=ranges.flatMap(({zone,eligible,wing})=>eligible.map(bay=>({
      x:[...zone] as Span,bay,wing,areaPerMetre:bay.y[1]-bay.y[0]
    }))).reverse()
    const bayArea=available.reduce((sum,v)=>sum+(v.x[1]-v.x[0])*v.areaPerMetre,0)
    const uses:{kind:'commercial'|'communal';x:Span;bay:Bay;wing?:number}[]=[]
    for(const kind of ['commercial','communal'] as const){
      let remaining=bayArea*(config[kind]??0)/100
      for(const place of available){
        if(remaining<=eps)break
        const amount=Math.min(remaining/place.areaPerMetre,place.x[1]-place.x[0])
        if(amount<=eps)continue
        uses.push({kind,x:[place.x[1]-amount,place.x[1]],bay:place.bay,wing:place.wing})
        place.x[1]-=amount
        remaining-=amount*place.areaPerMetre
      }
    }
    let endHomes=0
    const floors=spans.map((limits,floor):ApartmentFloor=>{
      const fitting=typical.flatMap((row,rowIndex)=>{
        const {zone,eligible,wing}=ranges[rowIndex]
        const [left,right]=wing===undefined?limits:bayLimits(wing,eligible[0],floor)
        const remaining:Span=[Math.max(zone[0],left),Math.min(zone[1],right)]
        const retained=row.flatMap((original,index)=>{
          let unit=original
          const originalRun=unit.x
          if(originalRun[0]-defaults.party/2<remaining[0]-eps||originalRun[1]+defaults.party/2>remaining[1]+eps){
            if(wing===undefined)return []
            const run:Span=[Math.max(originalRun[0],remaining[0]+defaults.party/2),Math.min(originalRun[1],remaining[1]-defaults.party/2)]
            const frontage=settings.frontages[ndss[unit.type].beds-1]-defaults.party
            if(run[1]-run[0]<frontage-eps)return []
            unit=bentUnit(unit,wing,run)
            if(unit.area<unit.minimum-eps)return []
          }
          const run=unit.x
          if(floor===0&&uses.some(use=>use.wing===wing&&use.bay===unit.bay&&use.x[1]>run[0]-defaults.party/2+eps&&use.x[0]<run[1]+defaults.party/2-eps))return []
          return [{unit,index:`${rowIndex}:${index}`}]
        })
        return retained
      })
      if(floor>0||(config.commercial??0)+(config.communal??0)<100){
        fitting.push(...cornerUnits.flatMap(({unit,floors},index)=>floor<floors?[{unit,index:`corner:${index}`}]:[]))
      }
      const units=fitting.map(({unit,index})=>({id:`${block.id}:${floor}:${index}`,type:unit.type,
        outline:unit.outline??polygon(unit.x,unit.bay.y),area:unit.area,minimum:unit.minimum,target:unit.target}))
      const [leftInset,rightInset]=endInset(block,floor)
      for(const [end,inset] of [leftInset,rightInset].entries()){
        const wing=end?directions.length-1:0,[dx,dy]=directions[wing]
        const origin=end?line.at(-1)!:line[0],direction=end?-1:1
        endHomes+=units.filter(unit=>unit.outline.some(([x,y])=>
          Math.abs(((x-origin[0])*dx+(y-origin[1])*dy)*direction-inset-E-defaults.party/2)<.04)).length
      }
      const endRoutes:(TravelRoute|undefined)[]=[]
      for(const {unit} of fitting){
        const [start,end]=unit.corridorStations??unit.x
        const left=cores[0].x[0],right=cores.at(-1)!.x[1]
        if(cores.length>1&&start<=right&&end>=left)continue
        const gap=(x:number)=>Math.max(0,left-x,x-right)
        const x=gap(start)<=gap(end)?start:end
        const coreX=Math.min(right,Math.max(left,x))
        const side=x<=left?0:x>=right?1:2
        const core=side===1?cores.at(-1)!:cores[0]
        const edge=coreDepths(core.side)[core.side==='front'?1:0]
        const unitEdge=unit.bay.side==='front'?corridorY[0]:corridorY[1]
        const corridorPoints=along([Math.min(x,coreX),Math.max(x,coreX)],corridorCentre)
        if(coreX>x)corridorPoints.reverse()
        const junction=unit.corridorJunctions?.[x===start?0:1]??point(x,unitEdge)
        const points=[core.pointAtEdge?.(coreX)??point(coreX,edge),...corridorPoints,junction]
        const distance=routeLength(points)
        if(distance<=(endRoutes[side]?.distance??0))continue
        endRoutes[side]={points,distance,betweenCores:false}
      }
      const apartmentRoutes=endRoutes.filter(route=>route!==undefined)
      const travel=Math.max(0,...apartmentRoutes.map(route=>route.distance))
      const insets=endInset(block,floor)
      const corridor=[...along(endLimits(insets,corridorY[0]),corridorY[0]),...along(endLimits(insets,corridorY[1]),corridorY[1]).reverse()]
      return {units,cores:coreOutlines,corridor,
        uses:floor?[]:uses.map(use=>({kind:use.kind,outline:use.wing===undefined?polygon(use.x,use.bay.y):wingFrame(use.wing).rectangle(use.x,use.bay.y)})),
        coreArea:totalCoreArea,corridorArea:area(corridor),travel,betweenCores,travelRoutes:[...apartmentRoutes,...coreRoutes]}
    })
    if(!floors.some(f=>f.units.length))return {ok:false,reason:'The core and corridor leave too little frontage or area for an apartment.'}
    return {ok:true,floors,hrb,topStoreyHeight,cornerCores:bends.length>0,endHomes}
  }
  function routeLayout(hrb:boolean):ApartmentResult {
    const minimum=Math.max(bends.length,hrb?config.hrbCores:1)
    const initial=generate(hrb,minimum)
    if(!initial.ok&&!bends.length)return initial
    const travelLimit=hrb?settings.hrbTravel:settings.nonHrbTravel
    const longest=(layout:Layout)=>Math.max(...layout.floors.map(f=>
      Math.max(f.travel/travelLimit,f.betweenCores/settings.betweenCoreTravel)))
    if(bends.length){
      const usable=(layout:Layout)=>layout.endHomes*8+layout.floors.reduce((total,floor)=>
        total+floor.units.reduce((sum,unit)=>sum+unit.area,0),0)
      let best=initial.ok?initial:undefined
      for(let count=minimum;count<=Math.min(28,minimum+Math.ceil(span/Math.min(travelLimit,settings.betweenCoreTravel)));count++){
        const feasible:Layout[]=[]
        function consider(candidate:ApartmentResult){
          if(!candidate.ok||hrb&&candidate.floors.reduce((sum,floor)=>sum+floor.units.length,0)<2)return
          const violation=longest(candidate)
          if(violation<=1+eps)feasible.push(candidate)
          else if(!best||violation<longest(best)-eps)best=candidate
        }
        const shifts=count===minimum?[0]:[0,-.28,.28,-.42,.42]
        for(const shift of shifts){
          for(const nextWing of [false,true]){
            consider(count===minimum&&!nextWing?initial:generate(hrb,count,shift,nextWing))
          }
        }
        if(count>minimum){
          // Keep secondary cores on one side of each wing so the opposite
          // apartment row stays continuous.
          const oppositeRuns=double?[-1,...bends.map((_,i)=>i),bends.length]:[-1]
          for(const shift of [0,-.34,.34]){
            for(const nextWing of [false,true]){
              for(const oppositeRun of oppositeRuns){
                if(shift!==0||oppositeRun!==-1)consider(generate(hrb,count,shift,nextWing,oppositeRun,true))
              }
            }
          }
        }
        if(feasible.length)return feasible.reduce((winner,candidate)=>usable(candidate)>usable(winner)+eps?candidate:winner)
      }
      return best??initial
    }
    if(!initial.ok)return initial
    let best=initial
    if(config.corePosition===undefined||config.corePosition===50){
      for(const shift of [-.12,.12]){
        const candidate=generate(hrb,minimum,shift)
        if(candidate.ok&&longest(candidate)<=1+eps&&
          (longest(best)>1+eps||candidate.endHomes>best.endHomes))best=candidate
      }
    }
    for(let count=minimum+1;longest(best)>1+eps;count++){
      const candidate=generate(hrb,count)
      if(!candidate.ok)break
      if(hrb&&candidate.floors.reduce((count,f)=>count+f.units.length,0)<2)continue
      if(longest(candidate)<longest(best)-eps)best=candidate
    }
    return best
  }
  const standard=routeLayout(false)
  if(!standard.ok||!threshold||standard.floors.reduce((count,f)=>count+f.units.length,0)<2)return standard
  const higherRisk=routeLayout(true)
  if(higherRisk.ok&&higherRisk.floors.reduce((count,f)=>count+f.units.length,0)<2){
    return {ok:false,reason:'The higher-risk core leaves room for fewer than two apartments. Adjust the block or core layout.'}
  }
  return higherRisk
}

const cache=new WeakMap<Block,{key:string;result:ApartmentResult}>()
export function apartmentLayout(block:Block,project:Inputs):ApartmentResult|undefined{
  if(!block.apartmentLayout||block.type!=='apartment')return
  const key=JSON.stringify([project.targets,project.apartmentSettings])
  const existing=cache.get(block)
  if(existing?.key===key)return existing.result
  const result=solveApartments(block,project)
  cache.set(block,{key,result})
  return result
}
