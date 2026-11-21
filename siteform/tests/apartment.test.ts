import test from 'node:test'
import assert from 'node:assert/strict'
import {solveApartments,defaultApartmentOptions,defaultApartmentSettings} from '../src/apartment.ts'
import {area,development,newBlock,type Block} from '../src/model.ts'
import {blankProject} from '../src/project.ts'

const project=blankProject()
const rectangle=(span=54,depth=18):Block=>({...newBlock(project,'apartment',[[0,0],[span,0]]),depth,apartmentLayout:{...defaultApartmentOptions}})

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
  const two=solveApartments({...block,floors:7,apartmentLayout:{...defaultApartmentOptions,hrbCores:2}},project)
  assert.ok(two.ok)
  assert.equal(two.floors[0].cores.length,2)
  assert.equal(two.floors[0].coreArea,100)
})

test('mixed ground floor retains upper apartments and reports actual and estimated homes separately',()=>{
  const block=rectangle()
  const regular=solveApartments(block,project)
  const mixed={...block,apartmentLayout:{...defaultApartmentOptions,commercial:20,communal:10}}
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
    assert.ok(ground.cores[0].length>4)
    assert.ok(Math.abs(area(ground.cores[0])-50)<1e-5)
    assert.ok(ground.cores[0].every(([,y])=>turn>0?y>=9.75-1e-7:y<=8.25+1e-7))
    assert.deepEqual(upper.cores,ground.cores)
    assert.ok(ground.units.length>=4)
    assert.ok(ground.units.every(unit=>unit.area>=unit.minimum-1e-7))
  }
})

test('rejects a bend where the inside edge folds back',()=>{
  const answer=solveApartments({...rectangle(),line:[[0,0],[12,0],[12,22]]},project)
  assert.ok(!answer.ok)
  assert.match(answer.reason,/bend is too tight/)
})

test('adds aligned cores when apartment centres are over the single-direction limit',()=>{
  const block=rectangle(70)
  const relaxed=solveApartments(block,{...project,apartmentSettings:{...defaultApartmentSettings,nonHrbTravel:40}})
  assert.ok(relaxed.ok)
  assert.equal(relaxed.floors[0].cores.length,1)
  assert.ok(relaxed.floors[0].travel>30)
  const answer=solveApartments(block,project)
  assert.ok(answer.ok)
  for(const floor of answer.floors){
    assert.equal(floor.cores.length,2)
    assert.equal(floor.coreArea,100)
    assert.ok(floor.travel<=30)
    assert.deepEqual(floor.cores,answer.floors[0].cores)
  }
})

test('retains the travel warning if a setback prevents another aligned core',()=>{
  const answer=solveApartments({...rectangle(70),setbacks:[[0,0],[29,29]]},project)
  assert.ok(answer.ok)
  assert.equal(answer.floors[0].cores.length,1)
  assert.ok(answer.floors[0].travel>30)
})

test('single-direction travel runs from apartment centre via corridor to outer core edge',()=>{
  const answer=solveApartments(rectangle(),project)
  assert.ok(answer.ok)
  const floor=answer.floors[0]
  assert.equal(floor.cores.length,1)
  const [left,right]=floor.cores[0].slice(0,2).map(p=>p[0])
  const expected=Math.max(...floor.units.map(({outline})=>{
    const x=(outline[0][0]+outline[2][0])/2
    const y=(outline[0][1]+outline[2][1])/2
    return Math.max(0,left-x,x-right)+Math.abs(y-9)+.75
  }))
  assert.ok(Math.abs(floor.travel-expected)<1e-7)
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
  assert.ok(answer.floors[1].units.every(unit=>answer.floors[0].units.some(ground=>JSON.stringify(ground.outline)===JSON.stringify(unit.outline))))
})
