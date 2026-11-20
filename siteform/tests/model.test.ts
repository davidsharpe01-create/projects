import test from 'node:test'
import assert from 'node:assert/strict'
import { adjustSetback, endInset, floorOutline, resizeStoreys, area, blockStats, csv, depthFor, development, footprints, footprintSatisfies, height, length, newBlock, validPolygon } from '../src/model.ts'
import { legacySample as sample, blankProject, restoreProject } from '../src/project.ts'
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

test('45 m frontage fits ten three-storey houses at uniform depth and measures end units accurately',()=>{
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
      near(externalDepth,depthFor(target))
      near((externalDepth-1.2)*(measuredWidth-partyAllowances)*3,target*(measuredWidth-partyAllowances)/4.2)
    })
    near(blockStats(block,sample).usable,8*target+2*target*3.75/4.2)
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

test('homes and density update when frontage or site area changes',()=>{
  const block=newBlock(sample,'house',[[0,0],[45,0]])
  const project={...sample,boundary:[[0,0],[100,0],[100,100],[0,100]] as typeof sample.boundary,blocks:[block]}
  assert.equal(development(project).houses,10)
  assert.equal(development(project).density,10)

  const edited={...project,blocks:[{...block,line:[[0,0],[54,0]] as typeof block.line}]}
  assert.equal(development(edited).houses,12)
  assert.equal(development(edited).density,12)

  const larger={...edited,boundary:[[0,0],[200,0],[200,100],[0,100]] as typeof project.boundary}
  assert.equal(development(larger).houses,12)
  assert.equal(development(larger).density,6)
})

test('indicative GIA deducts apartment external walls and updates with storeys',()=>{
  const block={...newBlock(sample,'apartment',[[0,0],[40,0]]),floors:2}
  const project={...sample,blocks:[block]}
  const floorArea=(40-1.2)*(18-1.2)
  near(development(project).gia!,floorArea*2)
  near(blockStats({...block,floors:3},project).gia!,floorArea*3)
  const house=newBlock(sample,'house',[[0,0],[4.5,0]])
  near(blockStats(house,sample).gia!,99*3.3/4.2)
})

test('end setbacks reduce only the selected floor and above, and update floor areas',()=>{
  const block={...newBlock(sample,'apartment',[[0,0],[50,0]]),floors:4}
  const start=adjustSetback(block,sample.targets,2,0,8,.5)
  const both=adjustSetback(start,sample.targets,2,1,5,.5)
  const upper=adjustSetback(both,sample.targets,3,1,4,.5)
  assert.deepEqual([0,1,2,3].map(i=>endInset(upper,i)),[[0,0],[0,0],[8,5],[8,9]])
  const outline=footprints(block,sample.targets)[0]
  assert.deepEqual([0,1,2,3].map(i=>area(floorOutline(upper,outline,i))),[900,900,666,594])
  near(blockStats(upper,sample).gross,3060)
  near(blockStats(upper,sample).gia!,(50+50+37+33-4*1.2)*16.8)
  const restored=adjustSetback(upper,sample.targets,3,1,-99,.5)
  assert.deepEqual(endInset(restored,3),[8,5])
  const limited=adjustSetback(upper,sample.targets,2,0,100,.5)
  assert.ok(footprintSatisfies(limited,sample.targets))
  assert.ok(endInset(limited,3)[0]+endInset(limited,3)[1]<50)
  assert.deepEqual(endInset(resizeStoreys(resizeStoreys(upper,3),4),3),[8,5])
})

test('ends on a bent frontage can be shortened while retaining the corner',()=>{
  const block=newBlock(sample,'apartment',[[0,0],[40,0],[66,-12]])
  const start=adjustSetback(block,sample.targets,1,0,6,.5)
  const both=adjustSetback(start,sample.targets,1,1,5,.5)
  const outline=footprints(block,sample.targets)[0]
  const upper=floorOutline(both,outline,1)
  assert.deepEqual(endInset(both,1),[6,5])
  assert.deepEqual(upper[1],outline[1])
  near(area(outline)-area(upper),11*block.depth)
  assert.ok(footprintSatisfies(both,sample.targets))
})

test('office and PBSA use their own depths and contribute GIA without adding homes',()=>{
  const office=newBlock(sample,'office',[[0,0],[40,0]])
  const pbsa=newBlock({...sample,blocks:[office]},'pbsa',[[0,30],[50,30]])
  assert.equal(office.depth,18)
  assert.equal(pbsa.depth,16)
  near(blockStats(office,sample).gia!,(40-1.2)*(18-1.2)*office.floors)
  near(blockStats(pbsa,sample).gia!,(50-1.2)*(16-1.2)*pbsa.floors)
  assert.equal(development({...sample,blocks:[office,pbsa]}).houses,0)
  assert.deepEqual(endInset(adjustSetback(pbsa,sample.targets,1,0,5,.5),1),[5,0])
})

test('new projects and untouched legacy demos start empty at the Bradford Street postcode',()=>{
  const expected=blankProject()
  assert.deepEqual(expected.anchor,{lat:52.4749,lon:-1.889077})
  assert.deepEqual(expected.blocks,[])
  assert.deepEqual(expected.boundary,[])
  assert.deepEqual(restoreProject(null),expected)
  assert.deepEqual(restoreProject(JSON.stringify(sample)),expected)
  const changed=structuredClone(sample)
  changed.blocks[0].floors++
  assert.deepEqual(restoreProject(JSON.stringify(changed)),changed)
  const located={...changed,anchor:{lat:51.5,lon:-.12}}
  assert.deepEqual(restoreProject(JSON.stringify(located)),located)
})
