import test from 'node:test'
import assert from 'node:assert/strict'
import {solveApartments,defaultApartmentOptions,defaultApartmentSettings} from '../src/apartment.ts'
import {area,defaults,development,editGroundFrontage,newBlock,type Block} from '../src/model.ts'
import {blankProject} from '../src/project.ts'

const project=blankProject()
const residentialOptions={...defaultApartmentOptions,commercial:0,communal:0}
const rectangle=(span=54,depth=18):Block=>({...newBlock(project,'apartment',[[0,0],[span,0]]),depth,apartmentLayout:{...residentialOptions}})

test('double loaded subdivision reserves core and corridor and mirrors units',()=>{
  const block=rectangle()
  const answer=solveApartments(block,{...project,apartmentSettings:{...defaultApartmentSettings,nonHrbTravel:40}})
  assert.ok(answer.ok)
  const [ground,upper]=answer.floors
  assert.ok(ground.units.length>4)
  assert.equal(ground.coreArea,50)
  assert.ok(Math.abs(area(ground.cores[0])-50)<1e-7)
  assert.ok(Math.abs(ground.corridorArea-(54-1.2)*1.5)<1e-7)
  assert.deepEqual(ground.units.map(u=>u.outline),upper.units.map(u=>u.outline))
  const front=ground.units.filter(u=>u.outline[0][1]<9)
  const [coreStart,coreEnd]=ground.cores[0].slice(0,2).map(([x])=>x)
  const before=front.filter(unit=>unit.outline[1][0]<coreStart).at(-1)!
  const after=front.find(unit=>unit.outline[0][0]>coreEnd)!
  assert.ok(Math.abs(coreStart-before.outline[1][0]-defaults.party)<1e-7)
  assert.ok(Math.abs(after.outline[0][0]-coreEnd-defaults.party)<1e-7)
  assert.ok(front.every(u=>ground.units.some(rear=>rear.type===u.type&&
    rear.outline[0][1]>9&&rear.outline[0][0]===u.outline[0][0]&&rear.outline[1][0]===u.outline[1][0])))
  for(const u of ground.units){
    assert.ok(u.area>=u.minimum-1e-7)
    assert.ok(Math.abs(area(u.outline)-u.area)<1e-7)
  }
})

test('single loading fits a shallower block and respects frontage minima',()=>{
  const block=rectangle(42,10)
  block.apartmentLayout={...defaultApartmentOptions,mode:'single',coreSide:'rear'}
  const answer=solveApartments(block,project)
  assert.ok(answer.ok)
  assert.ok(answer.floors[0].units.every(u=>u.outline[0][1]>2.1))
  assert.ok(answer.floors[0].units.every(u=>u.outline[1][0]-u.outline[0][0]+.3>=5.5-1e-7))
  const changed=solveApartments(block,{...project,apartmentSettings:{...defaultApartmentSettings,corridor:9}})
  assert.ok(!changed.ok)
})

test('setbacks retain lower floors and drop only units cut by the upper edge',()=>{
  const block=rectangle()
  const baseline=solveApartments(block,project)
  const reduced=solveApartments({...block,setbacks:[[0,0],[0,0],[6,5]]},project)
  assert.ok(baseline.ok&&reduced.ok)
  assert.deepEqual(reduced.floors[0],baseline.floors[0])
  assert.ok(reduced.floors[2].units.length<baseline.floors[2].units.length)
  assert.ok(reduced.floors[2].units.every(u=>baseline.floors[2].units.some(v=>v.id===u.id&&JSON.stringify(v.outline)===JSON.stringify(u.outline))))
  const broken=solveApartments({...block,setbacks:[[0,0],[0,0],[24,24]]},project)
  assert.ok(!broken.ok)
  assert.equal(broken.floor,2)
})

test('higher-risk planning checks use top storey elevation and switch core allowances',()=>{
  const block=rectangle(63,18)
  const below=solveApartments({...block,floors:6},project)
  assert.ok(below.ok)
  assert.equal(below.topStoreyHeight,16.5)
  assert.equal(below.hrb,false)
  const atHeight=solveApartments({...block,floors:6,level:1.5},project)
  assert.ok(atHeight.ok)
  assert.equal(atHeight.hrb,true)
  assert.equal(atHeight.floors[0].coreArea,120)
  assert.ok(Math.abs(area(atHeight.floors[0].cores[0])-70)<1e-7)
  const two=solveApartments({...block,floors:7,apartmentLayout:{...residentialOptions,hrbCores:2}},project)
  assert.ok(two.ok)
  assert.equal(two.floors[0].cores.length,2)
  assert.equal(two.floors[0].coreArea,100)
})

test('new subdivisions split the available ground-floor area equally between commercial and communal',()=>{
  for(const floors of [1,4]){
    const result=solveApartments({...rectangle(),floors,apartmentLayout:defaultApartmentOptions},project)
    assert.ok(result.ok)
    const [ground,...upper]=result.floors
    const used=(kind:string)=>ground.uses.filter(use=>use.kind===kind).reduce((sum,use)=>sum+area(use.outline),0)
    assert.ok(used('commercial')>0)
    assert.ok(Math.abs(used('commercial')-used('communal'))<1e-7)
    assert.equal(ground.units.length,0)
    assert.ok(upper.every(floor=>floor.uses.length===0&&floor.units.length>0))
  }
})

test('mixed ground floor retains upper apartments and reports actual and estimated homes separately',()=>{
  const block=rectangle()
  const regular=solveApartments(block,project)
  const mixed={...block,apartmentLayout:{...residentialOptions,commercial:20,communal:10}}
  const answer=solveApartments(mixed,project)
  assert.ok(regular.ok&&answer.ok)
  assert.ok(answer.floors[0].units.length<regular.floors[0].units.length)
  assert.deepEqual(answer.floors[1],regular.floors[1])
  assert.deepEqual(new Set(answer.floors[0].uses.map(u=>u.kind)),new Set(['commercial','communal']))
  const estimate=rectangle()
  delete estimate.apartmentLayout
  const totals=development({...project,blocks:[mixed,estimate]})
  assert.equal(totals.generatedApartments,answer.floors.flatMap(f=>f.units).length)
  assert.equal(totals.estimatedApartments,Math.floor(development({...project,blocks:[estimate]}).gia!/80))
  assert.equal(totals.homes,totals.generatedApartments+totals.estimatedApartments!)
})

test('bent frontages have continuous corridors and cores on the inside of each turn',()=>{
  for(const turn of [1,-1]){
    const block={...rectangle(),line:[[0,0],[42,0],[42,turn*42]] as Block['line']}
    const answer=solveApartments(block,{...project,apartmentSettings:{...defaultApartmentSettings,nonHrbTravel:100,betweenCoreTravel:100}})
    assert.ok(answer.ok)
    const [ground,upper]=answer.floors
    assert.equal(ground.cores.length,1)
    assert.ok(ground.corridor.length>4)
    assert.equal(ground.cores[0].length,6)
    assert.ok(area(ground.cores[0])>=50)
    assert.ok(ground.cores[0].every(([,y])=>turn>0?y>=9.75-1e-7:y<=8.25+1e-7))
    assert.deepEqual(upper.cores,ground.cores)
    const corner=ground.units.find(unit=>unit.outline.length===6)
    assert.ok(corner)
    assert.ok(corner.outline.some(([x,y])=>Math.abs(x-41.4)<1e-7&&Math.abs(y-.6)<1e-7)||turn===-1)
    assert.deepEqual(upper.units.find(unit=>unit.outline.length===6)?.outline,corner.outline)
    const faceY=turn>0?10.05:7.95
    assert.ok(ground.cores[0].some(([,y])=>Math.abs(y-faceY)<1e-7))
    assert.ok(ground.units.length>=4)
    assert.ok(ground.units.every(unit=>unit.area>=unit.minimum-1e-7))
  }
})

test('rejects a bend where the inside edge folds back',()=>{
  const answer=solveApartments({...rectangle(),line:[[0,0],[12,0],[12,22]]},project)
  assert.ok(!answer.ok)
  assert.match(answer.reason,/bend is too tight/)
})

test('adds aligned cores when corridor junctions are over the single-direction limit',()=>{
  const block=rectangle(96)
  const relaxed=solveApartments(block,{...project,apartmentSettings:{...defaultApartmentSettings,nonHrbTravel:40}})
  assert.ok(relaxed.ok)
  assert.equal(relaxed.floors[0].cores.length,1)
  assert.ok(relaxed.floors[0].travel>30)
  const answer=solveApartments(block,project)
  assert.ok(answer.ok)
  for(const floor of answer.floors){
    assert.ok(floor.cores.length>1)
    assert.equal(floor.coreArea,50*floor.cores.length)
    assert.ok(floor.travel<=30)
    assert.deepEqual(floor.cores,answer.floors[0].cores)
  }
})

test('adds lower cores when the upper setback has room for only one core',()=>{
  const answer=solveApartments({...rectangle(96),setbacks:[[0,0],[42,42]]},project)
  assert.ok(answer.ok)
  assert.equal(answer.floors[0].cores.length,3)
  assert.ok(answer.floors.slice(1).every(floor=>floor.cores.length===1))
  assert.ok(answer.floors.every(floor=>floor.travel<=30&&floor.betweenCores<=30))
})

test('extending a lower wing adds cores below the setback and keeps the upper core aligned',()=>{
  const short={...rectangle(),line:[[0,0],[31,0],[31,36]] as Block['line'],floors:12,
    setbacks:[[0,0],[0,0],[4,4]] as Block['setbacks']}
  const before=solveApartments(short,project)
  assert.ok(before.ok&&before.hrb)
  assert.equal(before.floors[0].cores.length,1)
  const extended=editGroundFrontage(short,[[-59,0],[31,0],[31,36]])
  assert.deepEqual(extended.setbacks?.[2],[63,4])
  const after=solveApartments(extended,project)
  assert.ok(after.ok&&after.hrb)
  const [ground,first,second]=after.floors
  assert.ok(ground.cores.length>second.cores.length)
  assert.deepEqual(ground.cores,first.cores)
  assert.equal(second.cores.length,1)
  assert.ok(ground.cores.some(core=>JSON.stringify(core)===JSON.stringify(second.cores[0])))
  assert.ok(after.floors.every(floor=>floor.travel<=15&&floor.betweenCores<=30))
})

test('single-direction travel uses access points 1 m along the core wall and 2 m along the apartment wall',()=>{
  const answer=solveApartments(rectangle(),project)
  assert.ok(answer.ok)
  const floor=answer.floors[0]
  assert.equal(floor.cores.length,1)
  const [left,right]=floor.cores[0].slice(0,2).map(p=>p[0])
  const outerRoutes=floor.travelRoutes.filter(route=>route.points.at(-1)![0]<left||route.points.at(-1)![0]>right)
  assert.equal(outerRoutes.length,2)
  for(const route of outerRoutes){
    const [coreX,coreY]=route.points[0]
    const [x,y]=route.points.at(-1)!
    const onLeft=x<left
    assert.ok(Math.abs(coreX-(onLeft?left+1:right-1))<1e-7)
    assert.ok(floor.cores[0].some(p=>Math.abs(p[1]-coreY)<1e-7))
    assert.ok(floor.units.some(({outline})=>outline.some(([wallX,wallY])=>
      Math.abs(wallY-y)<1e-7&&Math.abs(wallX-(x+(onLeft?2:-2)))<1e-7)))
    assert.ok(Math.abs(route.distance-(Math.abs(coreX-x)+2.1))<1e-7)
  }
  assert.equal(floor.travel,Math.max(...outerRoutes.map(route=>route.distance)))
})

test('applies the 15 m HRB limit and the 30 m edge-to-edge spacing limit',()=>{
  const hrb=solveApartments({...rectangle(63),floors:7},project)
  assert.ok(hrb.ok&&hrb.hrb)
  assert.ok(hrb.floors[0].travel<=15)
  const long=rectangle(100)
  const relaxed=solveApartments(long,{...project,apartmentSettings:{...defaultApartmentSettings,betweenCoreTravel:60}})
  const standard=solveApartments(long,project)
  assert.ok(relaxed.ok&&standard.ok)
  const [loose,tight]=[relaxed.floors[0],standard.floors[0]]
  assert.ok(loose.betweenCores>30&&loose.travel<=30)
  assert.ok(tight.cores.length>loose.cores.length)
  assert.ok(tight.betweenCores<=30&&tight.travel<=30)
})

test('multiple bends retain both corner cores and the corridor through upper setbacks',()=>{
  const block={...rectangle(),line:[[0,0],[45,0],[45,50],[90,50]] as Block['line'],setbacks:[[0,0],[5,4]] as Block['setbacks']}
  const answer=solveApartments(block,{...project,apartmentSettings:{...defaultApartmentSettings,nonHrbTravel:100,betweenCoreTravel:100}})
  assert.ok(answer.ok)
  assert.equal(answer.floors[0].cores.length,2)
  assert.deepEqual(answer.floors[1].cores,answer.floors[0].cores)
  assert.ok(answer.floors[1].corridorArea<answer.floors[0].corridorArea)
  assert.ok(answer.floors[0].travelRoutes.some(route=>route.betweenCores))
  const middleWing=answer.floors[0].units.filter(unit=>unit.outline.every(([,y])=>y>18&&y<42))
  assert.ok(middleWing.length>0)
  assert.ok(middleWing.every(unit=>answer.floors[1].units.some(upper=>JSON.stringify(upper.outline)===JSON.stringify(unit.outline))))
})

test('party walls are perpendicular to the local façade on both sides of an oblique bend',()=>{
  const block={...rectangle(),line:[[0,0],[48,16],[30,60]] as Block['line']}
  const answer=solveApartments(block,project)
  assert.ok(answer.ok)
  const directions=[[48,16],[-18,44]]
  const counts=[0,0]
  const [ground,upper]=answer.floors
  const wrapped=ground.units.filter(unit=>unit.outline.length===6)
  assert.equal(wrapped.length,1)
  const corner=wrapped[0]
  assert.deepEqual(upper.units.find(unit=>unit.outline.length===6)?.outline,corner.outline)
  const [a,b,c,d,e,f]=corner.outline
  const dot=(p:Block['line'][number],q:Block['line'][number],[x,y]:number[])=>(q[0]-p[0])*x+(q[1]-p[1])*y
  assert.ok(Math.abs(dot(a,f,directions[0]))<1e-7)
  assert.ok(Math.abs(dot(c,d,directions[1]))<1e-7)
  const firstLength=Math.hypot(...directions[0])
  const depth=(p:Block['line'][number])=>(p[1]*directions[0][0]-p[0]*directions[0][1])/firstLength
  assert.ok(Math.abs(depth(b)-.6)<1e-7)
  assert.ok(Math.abs(depth(e)-7.95)<1e-7)
  for(const {outline:[a,b,c,d]} of ground.units.filter(unit=>unit.outline.length===4)){
    const wing=directions.findIndex(([x,y])=>Math.abs((b[0]-a[0])*y-(b[1]-a[1])*x)<1e-7)
    assert.ok(wing>=0)
    const [x,y]=directions[wing]
    for(const [start,end] of [[a,d],[b,c]]){
      assert.ok(Math.abs((end[0]-start[0])*x+(end[1]-start[1])*y)<1e-7)
    }
    counts[wing]++
  }
  assert.ok(counts.every(count=>count>0))
})

test('extra cores on a long L stay rectangular and leave a continuous apartment row opposite',()=>{
  const block={...rectangle(),line:[[0,0],[90,0],[90,48]] as Block['line']}
  const answer=solveApartments(block,project)
  assert.ok(answer.ok)
  const floor=answer.floors[0]
  assert.ok(floor.cores.length>1&&floor.cores.length<=4)
  const wingCores=floor.cores.filter(outline=>outline.length===4)
  assert.equal(wingCores.length,floor.cores.length-1)
  for(const [a,b,c,d] of wingCores){
    assert.ok(Math.abs((b[0]-a[0])*(d[0]-a[0])+(b[1]-a[1])*(d[1]-a[1]))<1e-7)
    assert.ok(Math.abs(area([a,b,c,d])-50)<1e-7)
  }
  const front=floor.units.filter(unit=>unit.outline.every(p=>p[1]<8.25)).sort((a,b)=>a.outline[0][0]-b.outline[0][0])
  assert.ok(front.length>=4)
  assert.ok(front.slice(1).every((unit,i)=>unit.outline[0][0]-front[i].outline[1][0]<=defaults.party+.1))
  assert.ok(floor.travel<=30&&floor.betweenCores<=30)
})

test('tall L with setbacks keeps layouts orthogonal and vertically aligned',()=>{
  const block={...rectangle(),floors:11,line:[[0,0],[95,0],[95,50]] as Block['line'],
    setbacks:[[0,0],[0,0],[18,12]] as Block['setbacks']}
  const result=solveApartments(block,project)
  assert.ok(result.ok&&result.hrb)
  const ground=result.floors[0]
  assert.equal(ground.cores.length,4)
  assert.ok(ground.units.length>=19)
  assert.ok(result.floors[2].units.length>=11)
  assert.ok(result.floors[2].units.reduce((sum,unit)=>sum+unit.area,0)>740)
  assert.deepEqual(result.floors[2].units.map(({outline})=>outline),result.floors[3].units.map(({outline})=>outline))
  const mainBody=ground.units.filter(unit=>unit.outline.every(([x,y])=>x>24&&y<32))
  assert.ok(mainBody.length>1)
  for(const unit of mainBody){
    assert.ok(result.floors[2].units.some(upper=>JSON.stringify(upper.outline)===JSON.stringify(unit.outline)))
  }
  assert.ok(ground.cores.some(core=>Math.abs(area(core)-70)<1e-7))
  for(const floor of result.floors){
    assert.deepEqual(floor.cores,ground.cores)
    assert.ok(floor.travel<=15&&floor.betweenCores<=30)
    for(const polygon of [...floor.cores,...floor.units.map(unit=>unit.outline)]){
      assert.ok(polygon.length===4||polygon.length===6)
      polygon.forEach(([x,y],i)=>{
        const [a,b]=polygon[(i+1)%polygon.length]
        assert.ok(Math.abs(x-a)<1e-7||Math.abs(y-b)<1e-7)
      })
    }
  }
})

test('repositioning secondary cores recovers apartment space in a tall L with setbacks',()=>{
  const block={...rectangle(),floors:11,line:[[0,0],[100,0],[100,60]] as Block['line'],
    setbacks:[[0,0],[0,0],[14,10]] as Block['setbacks']}
  const result=solveApartments(block,project)
  assert.ok(result.ok&&result.hrb)
  const apartments=result.floors.flatMap(floor=>floor.units)
  assert.ok(apartments.length>=210)
  assert.ok(apartments.reduce((sum,unit)=>sum+unit.area,0)>14300)
  for(const floor of result.floors){
    assert.deepEqual(floor.cores,result.floors[0].cores)
    assert.ok(floor.travel<=15&&floor.betweenCores<=30)
    const extents=(outline:Block['line'])=>{
      const xs=outline.map(([x])=>x),ys=outline.map(([,y])=>y)
      return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]
    }
    for(const unit of floor.units){
      const [left,top,right,bottom]=extents(unit.outline)
      for(const core of floor.cores){
        const [x,y,r,b]=extents(core)
        assert.ok(right<=x+1e-7||r<=left+1e-7||bottom<=y+1e-7||b<=top+1e-7)
      }
    }
  }
})

test('an asymmetric corner apartment survives a setback on the shorter wing',()=>{
  const bend=20*Math.PI/180
  const block={...rectangle(),line:[[0,0],[50,0],[50+16*Math.cos(bend),16*Math.sin(bend)]] as Block['line'],
    setbacks:[[0,0],[0,0],[0,12]] as Block['setbacks']}
  const result=solveApartments(block,{...project,apartmentSettings:{...defaultApartmentSettings,nonHrbTravel:85,betweenCoreTravel:85}})
  assert.ok(result.ok)
  const corner=result.floors[0].units.find(unit=>unit.outline.length===6)
  assert.ok(corner&&corner.area>=corner.minimum)
  for(const floor of result.floors){
    assert.deepEqual(floor.units.find(unit=>unit.outline.length===6)?.outline,corner.outline)
  }
})

test('a bent double-loaded block mirrors qualifying bays and keeps the end frontages residential',()=>{
  const block={...rectangle(),line:[[0,0],[42,0],[42,42]] as Block['line']}
  const result=solveApartments(block,project)
  assert.ok(result.ok)
  const ground=result.floors[0]
  assert.equal(ground.cores.length,1)
  const core=ground.cores[0]
  const left=Math.min(...core.map(([x])=>x)), end=Math.max(...core.map(([,y])=>y))
  const horizontal=ground.units.filter(unit=>unit.outline.every(([x,y])=>x<left&&y>9))
  const vertical=ground.units.filter(unit=>unit.outline.every(([x,y])=>x<33&&y>end))
  assert.ok(Math.abs(left-Math.max(...horizontal.flatMap(unit=>unit.outline.map(([x])=>x)))-defaults.party)<1e-7)
  assert.ok(Math.abs(Math.min(...vertical.flatMap(unit=>unit.outline.map(([,y])=>y)))-end-defaults.party)<1e-7)
  const paired=ground.units.filter(unit=>unit.outline.length===4&&unit.outline.every(p=>p[1]<9)&&
    ground.units.some(other=>other.type===unit.type&&other.outline.length===4&&other.outline.every(p=>p[1]>9)&&
      Math.abs(unit.outline[0][0]-other.outline[0][0])<1e-7&&Math.abs(unit.outline[1][0]-other.outline[1][0])<1e-7))
  assert.ok(paired.length>=3)
  assert.equal(ground.units.filter(unit=>unit.outline.some(([x])=>Math.abs(x-.75)<1e-7)).length,2)
  assert.equal(ground.units.filter(unit=>unit.outline.some(([,y])=>Math.abs(y-41.25)<1e-7)).length,2)
  assert.ok(ground.units.every(unit=>unit.area>=unit.minimum-1e-7))
})

test('larger apartments take the outer ends of straight and bent residential floors',()=>{
  for(const line of [[[0,0],[54,0]],[[0,0],[42,0],[42,42]]] as Block['line'][]){
    const result=solveApartments({...rectangle(),line,apartmentLayout:defaultApartmentOptions},project)
    assert.ok(result.ok)
    const offset=defaults.external+defaults.party/2
    for(const atEnd of [([x]:Block['line'][number])=>Math.abs(x-offset)<1e-7,
      ([x,y]:Block['line'][number])=>Math.abs((line.length===2?54-x:42-y)-offset)<1e-7]){
      const units=result.floors[1].units.filter(unit=>unit.outline.some(atEnd))
      assert.equal(units.length,2)
      assert.ok(units.every(unit=>['2B4P','3B5P','3B6P'].includes(unit.type)))
    }
  }
})

test('a smaller apartment fills each usable bay at a setback without moving the adjacent partitions',()=>{
  const block={...rectangle(),line:[[0,0],[42,0],[42,42]] as Block['line'],floors:4,
    apartmentLayout:defaultApartmentOptions}
  const full=solveApartments(block,project)
  const stepped=solveApartments({...block,setbacks:[[0,0],[4,0]]},project)
  assert.ok(full.ok&&stepped.ok)
  const upper=stepped.floors[1]
  const endUnits=upper.units.filter(unit=>unit.outline.some(([x])=>Math.abs(x-4.75)<1e-7))
  assert.equal(endUnits.length,2)
  for(const unit of endUnits){
    assert.equal(unit.type,'1B1P')
    assert.ok(unit.area>=unit.minimum)
  }
  for(const unit of full.floors[1].units.filter(unit=>unit.outline.every(([x])=>x>=10))){
    assert.ok(upper.units.some(candidate=>JSON.stringify(candidate.outline)===JSON.stringify(unit.outline)))
  }
  assert.ok(upper.travel<=30&&upper.betweenCores<=30)
})

test('apartment areas stay within five percent above target on straight, corner and setback floors',()=>{
  for(const [line,setbacks] of [
    [[[0,0],[54,0]],undefined],
    [[[0,0],[42,0],[42,42]],[[0,0],[4,0]]]
  ] as [Block['line'],Block['setbacks']][]){
    const result=solveApartments({...rectangle(),line,setbacks},project)
    assert.ok(result.ok)
    const units=result.floors.flatMap(floor=>floor.units)
    assert.ok(units.length>0)
    for(const unit of units){
      const size=area(unit.outline)
      assert.ok(size<=unit.target*1.05+1e-7)
      assert.ok(size>=unit.minimum-1e-7)
    }
  }
})
