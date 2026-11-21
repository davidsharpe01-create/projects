import test from 'node:test'
import assert from 'node:assert/strict'
import {solveApartments,defaultApartmentOptions,defaultApartmentSettings} from '../src/apartment.ts'
import {area,development,newBlock,type Block} from '../src/model.ts'
import {blankProject} from '../src/project.ts'

const project=blankProject()
const rectangle=(span=54,depth=18):Block=>({...newBlock(project,'apartment',[[0,0],[span,0]]),depth,apartmentLayout:{...defaultApartmentOptions}})

test('double loaded subdivision reserves core and corridor and mirrors units',()=>{
  const block=rectangle()
  const answer=solveApartments(block,project)
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
  assert.equal(atHeight.floors[0].coreArea,70)
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

test('unsupported frontage returns a specific reason',()=>{
  const answer=solveApartments({...rectangle(),line:[[0,0],[20,0],[25,20]]},project)
  assert.ok(!answer.ok)
  assert.match(answer.reason,/straight frontage/)
})
