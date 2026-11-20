import test from 'node:test'
import assert from 'node:assert/strict'
import { area, blockStats, csv, depthFor, development, footprints, footprintSatisfies, height, length, newBlock, sample, validPolygon } from '../src/model.ts'
import { geographicPoint, mapFrame } from '../src/basemap.ts'
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} ≠ ${b}`)

test('sample has three editable, valid and contained blocks',()=>{
  assert.equal(sample.blocks.length,3)
  assert.ok(validPolygon(sample.boundary))
  for(const block of sample.blocks){
    assert.ok(footprintSatisfies(block,sample.targets))
    assert.equal(blockStats(block,sample).outside,false)
  }
  assert.equal(development(sample).houses,10)
  assert.ok(csv(sample).includes('Site total'))
})

test('45 m frontage fits ten three-storey houses at each type’s net target',()=>{
  const run=newBlock(sample,'house',[[0,0],[45,0]])
  for(const houseType of ['3B5P','3B6P'] as const){
    const block={...run,houseType}
    const target=sample.targets[houseType]
    const units=footprints(block,sample.targets)
    assert.equal(units.length,10)
    assert.equal(height(block),9)
    units.forEach((poly,i)=>{
      const measuredWidth=length(poly[0],poly[1])
      const partyAllowances=i===0||i===9?.75:.30
      const externalDepth=length(poly[1],poly[2])
      near(measuredWidth,4.5)
      near((externalDepth-1.2)*(measuredWidth-partyAllowances)*3,target)
    })
    near(blockStats(block,sample).usable,10*target)
  }
  near(depthFor(99),99/3/4.2+1.2)
})

test('house remainder is unused and angled overlapping runs are invalid',()=>{
  const run=newBlock(sample,'house',[[0,0],[47,0]])
  const units=footprints(run,sample.targets)
  assert.equal(units.length,10)
  assert.equal(units.at(-1)![1][0],45)
  assert.equal(footprintSatisfies({...run,line:[[0,0],[20,0],[20,20]]},sample.targets),false)
  assert.equal(footprintSatisfies({...run,line:[[0,0],[4.49,0]]},sample.targets),false)
})

test('crossed boundaries and blocks outside a concave redline are flagged',()=>{
  assert.equal(validPolygon([[0,0],[10,8],[0,10],[10,0]]),false)
  const p=structuredClone(sample)
  p.boundary=[[0,0],[80,0],[80,80],[50,80],[50,25],[30,25],[30,80],[0,80]]
  near(area(p.boundary),5300)
  const block=newBlock(p,'apartment',[[5,35],[75,35]])
  assert.equal(blockStats(block,p).outside,true)
})

test('Mercator tile frame and local-metre origin agree',()=>{
  const anchor={lat:52.48,lon:-1.9},zoom=17
  const frame=mapFrame(anchor,zoom)
  const shifted=mapFrame(geographicPoint(anchor,10,0),zoom)
  near((shifted.x-frame.x)*frame.width,10)
  assert.ok(mapFrame(geographicPoint(anchor,0,10),zoom).y>frame.y)
})
