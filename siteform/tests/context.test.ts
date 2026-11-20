import test from 'node:test'
import assert from 'node:assert/strict'
import {PbfWriter} from 'pbf'
import {area} from '../src/model.ts'
import {readBuildings} from '../src/context.ts'

export function buildingTile(x:number,y:number) {
  const writer=new PbfWriter()
  writer.writeMessage(3,(_,layer)=>{
    layer.writeStringField(1,'building')
    layer.writeMessage(2,(_,feature)=>{
      feature.writePackedVarint(2,[0,0,1,1])
      feature.writeVarintField(3,3)
      const geometry:number[]=[]
      let lastX=0,lastY=0
      const zigzag=(n:number)=>n<0?-n*2-1:n*2
      for(const ring of [
        [[x,y],[x+180,y],[x+180,y+100],[x,y+100]],
        [[x+55,y+25],[x+55,y+75],[x+125,y+75],[x+125,y+25]]
      ]){
        ring.forEach(([nx,ny],i)=>{
          if(i===0)geometry.push(9)
          if(i===1)geometry.push(26)
          geometry.push(zigzag(nx-lastX),zigzag(ny-lastY))
          lastX=nx;lastY=ny
        })
        geometry.push(15)
      }
      feature.writePackedVarint(4,geometry)
    },null)
    layer.writeStringField(3,'render_height')
    layer.writeStringField(3,'render_min_height')
    for(const number of [18,2])layer.writeMessage(4,(n,value)=>value.writeVarintField(5,n),number)
    layer.writeVarintField(5,4096)
    layer.writeVarintField(15,2)
  },null)
  return writer.finish()
}

test('context decoding preserves local coordinates, height and open courtyards',()=>{
  const blocks=readBuildings(buildingTile(0,0),{lat:0,lon:0},14,8192,8192)
  assert.equal(blocks.length,1)
  const [block]=blocks
  assert.equal(block.height,18)
  assert.equal(block.base,2)
  assert.deepEqual(block.rings[0][0],[0,0])
  assert.equal(block.rings.length,2)
  const projectedArea=area(block.rings[0])-area(block.rings[1])
  const roofArea=block.triangles!.reduce((sum,triangle)=>sum+area(triangle),0)
  assert.ok(Math.abs(projectedArea-roofArea)<1e-6)
  assert.deepEqual(readBuildings(buildingTile(2000,2000),{lat:0,lon:0},14,8192,8192),[])
})
