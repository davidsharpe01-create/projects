import test from 'node:test'
import assert from 'node:assert/strict'
import {depthPlane,foregroundShape,pickSurface,type Surface} from '../src/depth.ts'
import {inside,type Point} from '../src/model.ts'

const shape:Point[]=[[0,0],[10,0],[10,10],[0,10]]
const roof:Surface={id:'roof',shape,depth:()=>5}
const wall:Surface={id:'wall',shape,depth:depthPlane([0,0],[10,0],[0,10],0,10,0)}

test('a crossing face covers only the region where it is closer',()=>{
  const mask=foregroundShape(roof,wall,true)
  assert.equal(inside([2,5],mask),false)
  assert.equal(inside([8,5],mask),true)
  assert.equal(pickSurface([roof,wall],[2,5]),'roof')
  assert.equal(pickSurface([roof,wall],[8,5]),'wall')
  assert.equal(pickSurface([wall,roof],[8,5]),'wall')
})
test('a nearer context object blocks picking a hidden building',()=>{
  assert.equal(pickSurface([roof,{shape,depth:()=>9}],[5,5]),null)
  assert.deepEqual(foregroundShape(roof,{shape,depth:()=>1},true),[])
  assert.deepEqual(foregroundShape(roof,{shape,depth:()=>5},false),[])
  assert.deepEqual(foregroundShape(roof,{shape,depth:()=>5},true),shape)
})
