import {area,defaults,endInset,length,validPolygon,type Block,type Point,type Project} from './model.ts'
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
type Layout={ok:true;floors:ApartmentFloor[];hrb:boolean;topStoreyHeight:number;cornerCores:boolean}
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
  const coreDepths=(side:Bay['side']):Span=>side==='front'?[E,corridorY[0]]:[corridorY[1],D-E]
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
  function generate(hrb:boolean,coreCount:number):ApartmentResult {
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
          const x=start+(end-start)*n/(extras+1)
          const before=bends[i-1],after=bends[i]
          const nearest=before&&(!after||x-before.x<=after.x-x)?before:after
          targets.push({x,side:double?(nearest?.side??defaultSide):defaultSide,corner:false})
        }
      })
    }else{
      for(let i=0;i<coreCount;i++){
        const x=lo+(hi-lo)*((i+.5)/coreCount+((config.corePosition??50)-50)/100)
        targets.push({x,side:defaultSide,corner:false})
      }
    }
    targets.sort((a,b)=>a.x-b.x)
    const coreAreas=targets.map((_,i)=>i===0?primaryArea:50)
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
      return {x:[left,previousEnd] as Span,side}
    })
    const corridorCentre=(corridorY[0]+corridorY[1])/2
    // Keep a corner core wrapped around its bend. Cores elsewhere use a
    // rectangular footprint aligned with their wing and retain their target area.
    const reserved=cores.map(core=>({x:core.x,side:core.side}))
    const corePolygons=cores.map((core,index)=>{
      const y=coreDepths(core.side)
      if(!bends.length||targets[index].corner)return polygon(core.x,y)
      const middle=(core.x[0]+core.x[1])/2
      const wing=segment(middle),frame=wingFrame(wing)
      const lo=Math.max(top[0],stations[wing],reserved[index-1]?.x[1]??top[0])
      const hi=Math.min(top[1],stations[wing+1],reserved[index+1]?.x[0]??top[1])
      const [start,end]=frame.rectangularRun([lo,hi],y)
      const width=coreAreas[index]/(y[1]-y[0])
      if(end-start<width-eps)return polygon(core.x,y)
      const edge=core.side==='front'?y[1]:y[0]
      const left=Math.max(start,Math.min(end-width,frame.offsetAt(middle,edge)-width/2))
      const run:Span=[left,left+width]
      reserved[index].x=frame.stationBounds(run,y)
      core.x=[frame.stationAt(run[0],corridorCentre),frame.stationAt(run[1],corridorCentre)]
      return frame.rectangle(run,y)
    })
    const totalCoreArea=bends.length?corePolygons.reduce((sum,poly)=>sum+area(poly),0):coreAreas.reduce((sum,value)=>sum+value,0)
    const coreRoutes=cores.slice(1).map((core,i):TravelRoute=>{
      const points=along([cores[i].x[1],core.x[0]],corridorCentre)
      return {points,distance:routeLength(points),betweenCores:true}
    }).filter(route=>route.distance>eps)
    const betweenCores=Math.max(0,...coreRoutes.map(route=>route.distance))
    const ranges:{zone:Span;eligible:Bay[]}[]=[]
    function addRange(zone:Span,eligible:Bay[]){
      const cuts=[zone[0],...bends.map(bend=>bend.x).filter(x=>x>zone[0]+eps&&x<zone[1]-eps),zone[1]]
      cuts.slice(1).forEach((end,i)=>{
        if(end-cuts[i]>eps&&eligible.length)ranges.push({zone:[cuts[i],end],eligible})
      })
    }
    if(!bends.length){
      let x=lo
      for(const core of cores){
        addRange([x,core.x[0]],bays)
        addRange(core.x,bays.filter(bay=>bay.side!==core.side))
        x=core.x[1]
      }
      addRange([x,hi],bays)
    }else{
      for(const bay of bays){
        let x=lo
        for(const core of reserved.filter(core=>core.side===bay.side)){
          addRange([x,core.x[0]],[bay])
          x=Math.max(x,core.x[1])
        }
        addRange([x,hi],[bay])
      }
    }
    const typical=ranges.flatMap(({zone,eligible}):ApartmentBayUnit[]=>{
      if(!bends.length)return allocate(zone,eligible[0],project,settings).flatMap(unit=>eligible.map(bay=>({...unit,bay})))
      const frame=wingFrame(segment((zone[0]+zone[1])/2))
      return eligible.flatMap(bay=>allocate(frame.rectangularRun(zone,bay.y),bay,project,settings).map(unit=>{
        const [left,right]=unit.x
        const corridorEdge=bay.side==='front'?corridorY[0]:corridorY[1]
        return {...unit,x:frame.stationBounds(unit.x,bay.y),outline:frame.rectangle(unit.x,bay.y),
          corridorStations:[frame.stationAt(left,corridorCentre),frame.stationAt(right,corridorCentre)],
          corridorJunctions:[frame.worldPoint(left,corridorEdge),frame.worldPoint(right,corridorEdge)]}
      }))
    })
    const available=ranges.flatMap(({zone,eligible})=>eligible.map(bay=>({
      x:[...zone] as Span,bay,areaPerMetre:bends.length?area(polygon(zone,bay.y))/(zone[1]-zone[0]):clearBay
    }))).reverse()
    const bayArea=available.reduce((sum,v)=>sum+(v.x[1]-v.x[0])*v.areaPerMetre,0)
    const uses:{kind:'commercial'|'communal';x:Span;bay:Bay}[]=[]
    for(const kind of ['commercial','communal'] as const){
      let remaining=bayArea*(config[kind]??0)/100
      for(const place of available){
        if(remaining<=eps)break
        const amount=Math.min(remaining/place.areaPerMetre,place.x[1]-place.x[0])
        if(amount<=eps)continue
        uses.push({kind,x:[place.x[1]-amount,place.x[1]],bay:place.bay})
        place.x[1]-=amount
        remaining-=amount*place.areaPerMetre
      }
    }
    const floors=spans.map((limits,floor):ApartmentFloor=>{
      const fitting=typical.map((unit,index)=>({unit,index})).filter(({unit})=>
        unit.x[0]-(bends.length?0:defaults.party/2)>=limits[0]-eps&&unit.x[1]+(bends.length?0:defaults.party/2)<=limits[1]+eps&&
        (floor>0||!uses.some(use=>use.bay===unit.bay&&use.x[1]>unit.x[0]-defaults.party/2+eps&&use.x[0]<unit.x[1]+defaults.party/2-eps)))
      const units=fitting.map(({unit,index})=>({id:`${block.id}:${floor}:${index}`,type:unit.type,
        outline:unit.outline??polygon(unit.x,unit.bay.y),area:unit.area,minimum:unit.minimum,target:unit.target}))
      const endRoutes:(TravelRoute|undefined)[]=[]
      for(const {unit} of fitting){
        const [start,end]=unit.corridorStations??unit.x
        const left=cores[0].x[0],right=cores.at(-1)!.x[1]
        if(cores.length>1&&start<=right&&end>=left)continue
        const gap=(x:number)=>Math.max(0,left-x,x-right)
        const x=gap(start)<=gap(end)?start:end
        const coreX=Math.min(right,Math.max(left,x))
        const side=x<=left?0:x>=right?1:2
        const coreSide=side===1?cores.at(-1)!.side:cores[0].side
        const edge=coreSide==='front'?corridorY[0]:corridorY[1]
        const unitEdge=unit.bay.side==='front'?corridorY[0]:corridorY[1]
        const corridorPoints=along([Math.min(x,coreX),Math.max(x,coreX)],corridorCentre)
        if(coreX>x)corridorPoints.reverse()
        const junction=unit.corridorJunctions?.[x===start?0:1]??point(x,unitEdge)
        const points=[point(coreX,edge),...corridorPoints,junction]
        const distance=routeLength(points)
        if(distance<=(endRoutes[side]?.distance??0))continue
        endRoutes[side]={points,distance,betweenCores:false}
      }
      const apartmentRoutes=endRoutes.filter(route=>route!==undefined)
      const travel=Math.max(0,...apartmentRoutes.map(route=>route.distance))
      const insets=endInset(block,floor)
      const corridor=[...along(endLimits(insets,corridorY[0]),corridorY[0]),...along(endLimits(insets,corridorY[1]),corridorY[1]).reverse()]
      return {units,cores:corePolygons,corridor,
        uses:floor?[]:uses.map(use=>({kind:use.kind,outline:polygon(use.x,use.bay.y)})),
        coreArea:totalCoreArea,corridorArea:area(corridor),travel,betweenCores,travelRoutes:[...apartmentRoutes,...coreRoutes]}
    })
    if(!floors.some(f=>f.units.length))return {ok:false,reason:'The core and corridor leave too little frontage or area for an apartment.'}
    return {ok:true,floors,hrb,topStoreyHeight,cornerCores:bends.length>0}
  }
  function routeLayout(hrb:boolean):ApartmentResult {
    const minimum=Math.max(bends.length,hrb?config.hrbCores:1)
    const initial=generate(hrb,minimum)
    if(!initial.ok)return initial
    const travelLimit=hrb?settings.hrbTravel:settings.nonHrbTravel
    const longest=(layout:Layout)=>Math.max(...layout.floors.map(f=>
      Math.max(f.travel/travelLimit,f.betweenCores/settings.betweenCoreTravel)))
    let best=initial
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
