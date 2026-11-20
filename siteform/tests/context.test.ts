import test from 'node:test'
import assert from 'node:assert/strict'
import {PbfWriter} from 'pbf'
import {area} from '../src/model.ts'
import {readContextTile} from '../src/context.ts'

export function buildingTile(x:number,y:number,includeRoads=false) {
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
  if(includeRoads)for(const name of ['transportation','transportation_name']){
    writer.writeMessage(3,(_,layer)=>{
      layer.writeStringField(1,name)
      for(const tags of [[0,0,1,1],[0,2,1,3],[0,0,1,3,2,4]]){
        layer.writeMessage(2,(_,feature)=>{
          feature.writePackedVarint(2,tags)
          feature.writeVarintField(3,2)
          feature.writePackedVarint(4,[9,x*2,(y+150)*2,10,720,0])
        },null)
      }
      for(const key of ['class','name','brunnel'])layer.writeStringField(3,key)
      for(const value of ['minor','Bradford Street','rail','Tunnel Test','tunnel']){
        layer.writeMessage(4,(v,field)=>field.writeStringField(1,v),value)
      }
      layer.writeVarintField(5,4096)
      layer.writeVarintField(15,2)
    },null)
  }
  return writer.finish()
}

test('context decoding preserves local coordinates, height and open courtyards',()=>{
  const blocks=readContextTile(buildingTile(0,0),{lat:0,lon:0},14,8192,8192).buildings
  assert.equal(blocks.length,1)
  const [block]=blocks
  assert.equal(block.height,18)
  assert.equal(block.base,2)
  assert.deepEqual(block.rings[0][0],[0,0])
  assert.equal(block.rings.length,2)
  const projectedArea=area(block.rings[0])-area(block.rings[1])
  const roofArea=block.triangles!.reduce((sum,triangle)=>sum+area(triangle),0)
  assert.ok(Math.abs(projectedArea-roofArea)<1e-6)
  assert.deepEqual(readContextTile(buildingTile(2000,2000),{lat:0,lon:0},14,8192,8192).buildings,[])
})

test('road and name layers share the building coordinate frame and filter rail and tunnels',()=>{
  const {roads,streetNames}=readContextTile(buildingTile(0,0,true),{lat:0,lon:0},14,8192,8192)
  assert.equal(roads.length,1)
  assert.equal(roads[0].kind,'minor')
  assert.equal(streetNames.length,1)
  assert.equal(streetNames[0].name,'Bradford Street')
  assert.deepEqual(roads[0].line,streetNames[0].line)
  assert.equal(roads[0].line[0][0],0)
  assert.ok(roads[0].line[0][1]>0)
})
