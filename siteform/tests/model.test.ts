import test from 'node:test'
import assert from 'node:assert/strict'
import { adjustSetback, editGroundFrontage, endInset, floorOutline, resizeStoreys, area, blockStats, csv, depthFor, development, footprints, footprintSatisfies, height, levels, meetsDwellingCeiling, length, newBlock, validPolygon } from '../src/model.ts'
import { legacySample as sample, blankProject, restoreProject } from '../src/project.ts'
import { geographicPoint, mapFrame } from '../src/geography.ts'
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

test('homes include an editable estimate from apartment GIA only',()=>{
  const project={...sample,boundary:[[0,0],[100,0],[100,100],[0,100]] as typeof sample.boundary,blocks:[
    newBlock(sample,'house',[[0,0],[9,0]]),
    newBlock(sample,'apartment',[[0,20],[40,20]]),
    newBlock(sample,'office',[[0,45],[40,45]]),
    newBlock(sample,'pbsa',[[0,70],[40,70]])
  ]}
  const totals=development(project)
  assert.equal(totals.apartmentAreaPerHome,80)
  near(totals.giaByUse.apartment!,(40-1.2)*(18-1.2)*4)
  assert.equal(totals.apartments,32)
  assert.equal(totals.homes,34)
  assert.equal(totals.density,34)
  assert.ok(totals.giaByUse.office!>0&&totals.giaByUse.pbsa!>0&&totals.giaByUse.house!>0)
  assert.equal(development({...project,apartmentAreaPerHome:100}).homes,28)
})

test('two-storey terraces fit 5.5 m houses and use the two-storey NDSS areas',()=>{
  const terrace={...newBlock(sample,'house',[[0,0],[45,0]]),floors:2}
  for(const [houseType,target] of [['3B5P',93],['3B6P',102]] as const){
    const block={...terrace,houseType}
    const outlines=footprints(block,sample.targets)
    assert.equal(outlines.length,8)
    assert.ok(outlines.every(poly=>Math.abs(length(poly[0],poly[1])-5.5)<1e-7))
    near((length(outlines[0][1],outlines[0][2])-1.2)*5.2*2,target)
    assert.equal(blockStats(block,sample).houses,8)
  }
  assert.equal(footprintSatisfies({...terrace,line:[[0,0],[5.49,0]]},sample.targets),false)
})

test('shared house storey heights drive massing and CSV and distinguish clear ceiling height',()=>{
  const house={...newBlock(sample,'house',[[0,0],[11,0]]),floors:2}
  const project={...sample,blocks:[house],houseHeights:{ground:3.2,upper:2.7}}
  assert.deepEqual(levels(house,project.houseHeights),[3.2,5.9])
  near(height(house,project.houseHeights),5.9)
  assert.match(csv(project),/"house","2","5\.90"/)
  assert.equal(meetsDwellingCeiling(2.6),true)
  assert.equal(meetsDwellingCeiling(2.5),false)
})

test('a dragged setback only moves upper floors when it passes their existing offsets',()=>{
  const block={...newBlock(sample,'apartment',[[0,0],[50,0]]),floors:5,
    setbacks:[[0,0],[2,1],[6,3],[10,4],[14,6]] as [number,number][]}
  const offsets=(b:Parameters<typeof endInset>[0])=>[1,2,3,4].map(i=>endInset(b,i))
  const drag=(delta:number)=>adjustSetback(block,sample.targets,2,0,delta,.5)
  assert.deepEqual(offsets(drag(2)),[[2,1],[8,3],[10,4],[14,6]])
  assert.deepEqual(offsets(drag(4)),[[2,1],[10,3],[10,4],[14,6]])
  assert.deepEqual(offsets(drag(6)),[[2,1],[12,3],[12,4],[14,6]])
  assert.deepEqual(offsets(drag(-20)),[[2,1],[2,3],[10,4],[14,6]])
})

test('ground frontage edits preserve upper end positions until the ground edge reaches them',()=>{
  const block={...newBlock(sample,'apartment',[[0,0],[50,0]]),floors:4,
    setbacks:[[0,0],[3,2],[6,5],[9,8]] as [number,number][]}
  const edges=(line:Parameters<typeof editGroundFrontage>[1])=>{
    const edited=editGroundFrontage(block,line)
    assert.ok(footprintSatisfies(edited,sample.targets))
    const outline=footprints(edited,sample.targets)[0]
    return [1,2,3].map(floor=>floorOutline(edited,outline,floor).slice(0,2).map(([x])=>x))
  }
  assert.deepEqual(edges([[2,0],[50,0]]),[[3,48],[6,45],[9,42]])
  assert.deepEqual(edges([[7,0],[44,0]]),[[7,44],[7,44],[9,42]])
  assert.deepEqual(edges([[-5,0],[54,0]]),[[3,48],[6,45],[9,42]])
  const flush=newBlock(sample,'apartment',[[0,0],[50,0]])
  const expanded=editGroundFrontage(flush,[[-5,0],[54,0]])
  const outline=footprints(expanded,sample.targets)[0]
  assert.deepEqual(floorOutline(expanded,outline,1).slice(0,2),[[-5,0],[54,0]])
  const stepped={...block,setbacks:[[0,0],[0,0],[0,2],[9,8]] as [number,number][]}
  const pulled=editGroundFrontage(stepped,[[-5,0],[54,0]])
  assert.deepEqual(pulled.setbacks,[[0,0],[0,0],[0,6],[14,12]])
  assert.ok(footprintSatisfies(pulled,sample.targets))
})

test('aligned upper floor edges follow an upper setback drag in both directions',()=>{
  const block={...newBlock(sample,'apartment',[[0,0],[50,0]]),floors:6,
    setbacks:[[0,0],[2,1],[6,3],[6,4],[6,6],[10,7]] as [number,number][]}
  const offsets=(delta:number)=>adjustSetback(block,sample.targets,2,0,delta,.5).setbacks
  assert.deepEqual(offsets(-2),[[0,0],[2,1],[4,3],[4,4],[4,6],[10,7]])
  assert.deepEqual(offsets(-20),[[0,0],[2,1],[2,3],[2,4],[2,6],[10,7]])
  assert.deepEqual(offsets(2),[[0,0],[2,1],[8,3],[8,4],[8,6],[10,7]])
  assert.deepEqual(offsets(5),[[0,0],[2,1],[11,3],[11,4],[11,6],[11,7]])
})

test('pulling a setback outward moves the linked floors below up to the next step',()=>{
  const block={...newBlock(sample,'apartment',[[0,0],[50,0]]),floors:6,
    setbacks:[[0,0],[2,1],[6,3],[6,4],[6,6],[10,7]] as [number,number][]}
  const drag=(delta:number)=>adjustSetback(block,sample.targets,4,0,delta,.5).setbacks
  assert.deepEqual(drag(-2),[[0,0],[2,1],[4,3],[4,4],[4,6],[10,7]])
  assert.deepEqual(drag(-20),[[0,0],[2,1],[2,3],[2,4],[2,6],[10,7]])
  assert.deepEqual(drag(2),[[0,0],[2,1],[6,3],[6,4],[8,6],[10,7]])
  const top={...block,floors:5}
  assert.deepEqual(adjustSetback(top,sample.targets,4,0,-2,.5).setbacks,drag(-2)?.slice(0,5))
})

test('pulling an upper edge aligned to ground extends the footprint and flush floors',()=>{
  const block={...newBlock(sample,'apartment',[[0,0],[50,0]]),floors:5,
    setbacks:[[0,0],[0,0],[0,0],[0,4],[8,7]] as [number,number][]}
  for(const side of [0,1]){
    const edited=adjustSetback(block,sample.targets,2,side,-5,.5)
    assert.deepEqual(edited.line,side?[[0,0],[55,0]]:[[-5,0],[50,0]])
    assert.deepEqual(edited.setbacks,side?[[0,0],[0,0],[0,0],[0,9],[8,12]]:[[0,0],[0,0],[0,0],[0,4],[13,7]])
    assert.ok(footprintSatisfies(edited,sample.targets))
  }
})
