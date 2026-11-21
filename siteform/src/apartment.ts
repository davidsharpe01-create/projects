import {defaults,endInset,length,type Block,type Point,type Project} from './model.ts'
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
export type ApartmentFloor={units:Unit[];cores:Point[][];corridor:Point[];uses:{kind:'commercial'|'communal';outline:Point[]}[];coreArea:number;corridorArea:number;travel:number;betweenCores:number}
type Layout={ok:true;floors:ApartmentFloor[];hrb:boolean;topStoreyHeight:number}
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
  const start=block.line[0],end=block.line.at(-1)
  if(!start||!end||length(start,end)<.1)return {ok:false,reason:'The frontage is too short.'}
  const span=length(start,end)
  const dx=(end[0]-start[0])/span,dy=(end[1]-start[1])/span
  let previous=-Infinity
  for(const p of block.line){
    const x=p[0]-start[0],y=p[1]-start[1],along=x*dx+y*dy
    if(Math.abs(x*dy-y*dx)>.001||along<previous-eps||along>span+eps)
      return {ok:false,reason:'Apartment subdivision currently needs a straight frontage. Split a bent block into straight wings.'}
    previous=along
  }
  const D=block.depth,E=defaults.external
  const double=config.mode==='double'
  const clearBay=(D-2*E-settings.corridor-(double?2:1)*corridorWall)/(double?2:1)
  if(clearBay<=0)return {ok:false,reason:'The block is too shallow for the corridor and apartments.'}
  const singleFront=config.coreSide==='front'
  const corridorY:Span=double?[(D-settings.corridor)/2,(D+settings.corridor)/2]:
    singleFront?[D-E-settings.corridor,D-E]:[E,E+settings.corridor]
  const bays:Bay[]=[]
  if(double||singleFront)bays.push({side:'front',y:[E,corridorY[0]-corridorWall]})
  if(double||!singleFront)bays.push({side:'rear',y:[corridorY[1]+corridorWall,D-E]})
  const coreBay=bays.find(b=>b.side===config.coreSide)!
  const coreY:Span=coreBay.side==='front'?[E,corridorY[0]]:[corridorY[1],D-E]
  const topStoreyHeight=Math.max(0,block.level+(block.floors>1?block.ground+(block.floors-2)*block.upper:0))
  const threshold=block.floors>=7||topStoreyHeight>=18
  const spans=Array.from({length:block.floors},(_,i):Span=>{
    const [left,right]=endInset(block,i)
    return [left+E,span-right-E]
  })
  const point=(x:number,y:number):Point=>[start[0]+x*dx-y*dy,start[1]+x*dy+y*dx]
  const polygon=(x:Span,y:Span)=>[point(x[0],y[0]),point(x[1],y[0]),point(x[1],y[1]),point(x[0],y[1])]
  function generate(hrb:boolean,coreCount:number):ApartmentResult {
    const primaryArea=hrb&&config.hrbCores===1?70:50
    const coreAreas=Array.from({length:coreCount},(_,i)=>i===0?primaryArea:50)
    const totalCoreArea=primaryArea+50*(coreCount-1)
    const coreDepth=coreY[1]-coreY[0]
    const totalWidth=totalCoreArea/coreDepth
    const top=spans.at(-1)!
    const unfit=spans.findIndex(([a,b])=>b-a<totalWidth+eps)
    if(unfit>=0)return {ok:false,floor:unfit,reason:`Floor ${unfit} cannot fit the ${coreCount===1?primaryArea+' m² core':coreCount+' aligned cores'}.`}
    const [lo,hi]=spans[0]
    // Keep the typical grid centred on the ground floor unless an upper setback forces a core move.
    let usedWidth=0,previousEnd=top[0]
    const cores=coreAreas.map((area,i):Span=>{
      const width=area/coreDepth
      const wanted=lo+(hi-lo)*((i+.5)/coreCount+((config.corePosition??50)-50)/100)-width/2
      const left=Math.max(previousEnd,Math.min(top[1]-totalWidth+usedWidth,wanted))
      usedWidth+=width
      previousEnd=left+width
      return [left,previousEnd]
    })
    const betweenCores=cores.slice(1).reduce((distance,core,i)=>Math.max(distance,core[0]-cores[i][1]),0)
    const corridorCentre=(corridorY[0]+corridorY[1])/2
    const zones:Span[]=[]
    let x=lo
    for(const core of cores){zones.push([x,core[0]],core);x=core[1]}
    zones.push([x,hi])
    const ranges=zones.map((zone,i)=>({zone,eligible:i%2?bays.filter(b=>b!==coreBay):bays}))
    const typical=ranges.flatMap(({zone,eligible})=>
      eligible.length?allocate(zone,eligible[0],project,settings).flatMap(unit=>eligible.map(bay=>({...unit,bay}))):[])
    const available=ranges.flatMap(({zone,eligible})=>eligible.map(bay=>({x:[...zone] as Span,bay}))).reverse()
    const bayLength=available.reduce((sum,v)=>sum+v.x[1]-v.x[0],0)
    const uses:{kind:'commercial'|'communal';x:Span;bay:Bay}[]=[]
    for(const kind of ['commercial','communal'] as const){
      let remaining=bayLength*(config[kind]??0)/100
      for(const place of available){
        if(remaining<=eps)break
        const amount=Math.min(remaining,place.x[1]-place.x[0])
        if(amount<=eps)continue
        uses.push({kind,x:[place.x[1]-amount,place.x[1]],bay:place.bay})
        place.x[1]-=amount
        remaining-=amount
      }
    }
    const floors=spans.map((limits,floor):ApartmentFloor=>{
      const fitting=typical.map((unit,index)=>({unit,index})).filter(({unit})=>
        unit.x[0]-defaults.party/2>=limits[0]-eps&&unit.x[1]+defaults.party/2<=limits[1]+eps&&
        (floor>0||!uses.some(use=>use.bay===unit.bay&&use.x[1]>unit.x[0]-defaults.party/2+eps&&use.x[0]<unit.x[1]+defaults.party/2-eps)))
      const units=fitting.map(({unit,index})=>({id:`${block.id}:${floor}:${index}`,type:unit.type,
        outline:polygon(unit.x,unit.bay.y),area:unit.area,minimum:unit.minimum,target:unit.target}))
      const travel=fitting.reduce((distance,{unit})=>{
        const x=(unit.x[0]+unit.x[1])/2
        const outside=Math.max(cores[0][0]-x,x-cores.at(-1)![1])
        if(outside<=0&&cores.length>1)return distance
        const centre=(unit.bay.y[0]+unit.bay.y[1])/2
        const toCorridor=Math.abs(centre-corridorCentre)
        return Math.max(distance,Math.max(0,outside)+toCorridor+settings.corridor/2)
      },0)
      return {units,cores:cores.map(core=>polygon(core,coreY)),corridor:polygon(limits,corridorY),
        uses:floor?[]:uses.map(use=>({kind:use.kind,outline:polygon(use.x,use.bay.y)})),
        coreArea:totalCoreArea,corridorArea:(limits[1]-limits[0])*settings.corridor,travel,betweenCores}
    })
    if(!floors.some(f=>f.units.length))return {ok:false,reason:'The core and corridor leave too little frontage or area for an apartment.'}
    return {ok:true,floors,hrb,topStoreyHeight}
  }
  function routeLayout(hrb:boolean):ApartmentResult {
    const minimum=hrb?config.hrbCores:1
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
