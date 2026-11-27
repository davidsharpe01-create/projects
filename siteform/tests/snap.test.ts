import test from 'node:test'
import assert from 'node:assert/strict'
import {snapAlong,snapAngle,snapEdges,snapPoint,type SnapEdge} from '../src/snap.ts'
import {newBlock,type Point} from '../src/model.ts'
import {blankProject} from '../src/project.ts'

const face:SnapEdge={a:[0,0],b:[20,0],source:'building',block:'a'}
const boundary:SnapEdge={a:[30,-10],b:[30,20],source:'boundary'}
const screen=([x,y]:Point):Point=>[5*x,5*y]

test('aligns to nearby corners and face segments before the grid',()=>{
  assert.deepEqual(snapPoint([.6,.4],[face],screen).point,[0,0])
  assert.deepEqual(snapPoint([9,1.1],[face],screen).point,[9,0])
  assert.deepEqual(snapPoint([30.7,8],[boundary],screen).point,[30,8])
  const fallback=snapPoint([9.3,3.4],[face],screen)
  assert.deepEqual(fallback.point,[9.5,3.5])
  assert.equal(fallback.guide,undefined)
})

test('snaps directions parallel and perpendicular to a reference face',()=>{
  const parallel=snapPoint([43,1.5],[face],screen,[[0,0]])
  assert.deepEqual(parallel.point,[43,0])
  assert.equal(parallel.guide?.label,'Parallel to building face')
  assert.equal(snapAngle(Math.PI/2+.02,[face])?.angle,Math.PI/2)
  assert.equal(snapAngle(.2,[face]),undefined)
})

test('a constrained setback stops at the intersection with a nearby boundary',()=>{
  const match=snapAlong([20,8],[1,0],9,[boundary],screen)
  assert.deepEqual(match?.guide.point,[30,8])
  assert.equal(match?.movement,10)
  assert.equal(snapAlong([20,25],[1,0],9,[boundary],screen),undefined)
})

test('project snap references include buildings and exclude the site redline',()=>{
  const project=blankProject()
  project.boundary=[[30,-10],[40,-10],[40,20],[30,20]]
  project.blocks=[newBlock(project,'office',[[0,0],[20,0]])]
  const edges=snapEdges(project,0)
  assert.ok(edges.length>0)
  assert.ok(edges.every(edge=>edge.source==='building'))
  assert.equal(snapPoint([30.7,8],edges,screen).guide,undefined)
})
