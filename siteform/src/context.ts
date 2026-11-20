import {classifyRings,VectorTile} from '@mapbox/vector-tile'
import {PbfReader} from 'pbf'
import earcut from 'earcut'
import {mapFrame,type Anchor} from './geography.ts'
import type {Point} from './model.ts'

export type ContextBuilding={rings:Point[][];triangles?:Point[][];height:number;base:number}
const tileJsonUrl='https://tiles.openfreemap.org/planet/latest'
const radius=420
const cache=new Map<string,ContextBuilding[]>()

function roofTriangles(rings:Point[][]) {
  if(rings.length<2)return undefined
  const holes:number[]=[]
  const points:Point[]=[]
  rings.forEach((ring,i)=>{if(i)holes.push(points.length);points.push(...ring)})
  const indices=earcut(points.flat(),holes)
  const triangles:Point[][]=[]
  for(let i=0;i<indices.length;i+=3)triangles.push(indices.slice(i,i+3).map(n=>points[n]))
  return triangles
}

export function readBuildings(data:Uint8Array,anchor:Anchor,z:number,x:number,y:number) {
  const layer=new VectorTile(new PbfReader(data)).layers.building
  if(!layer)return []
  const frame=mapFrame(anchor,z)
  const buildings:ContextBuilding[]=[]
  for(let i=0;i<layer.length;i++){
    const feature=layer.feature(i)
    const attrs=feature.properties
    if(feature.type!==3||attrs.hide_3d===true||attrs.hide_3d===1||attrs.hide_3d==='1')continue
    const [left,top,right,bottom]=feature.bbox()
    const unit=frame.width/feature.extent
    const east=(x-frame.x)*frame.width,south=(y-frame.y)*frame.width
    if(east+left*unit>radius||east+right*unit< -radius||south+top*unit>radius||south+bottom*unit< -radius)continue
    const height=Number(attrs.render_height??0)
    const base=Number(attrs.render_min_height??0)
    const roof=Number.isFinite(height)&&height>0?height:0
    const bottomHeight=Number.isFinite(base)&&base>=0&&base<roof?base:0
    for(const polygon of classifyRings(feature.loadGeometry())){
      const rings=polygon.map(ring=>ring.slice(0,-1).map(({x,y}):Point=>[east+x*unit,south+y*unit]))
      if(!rings[0]||rings[0].length<3)continue
      buildings.push({rings,triangles:roofTriangles(rings),height:roof,base:bottomHeight})
    }
  }
  return buildings
}

async function request(url:string,signal:AbortSignal) {
  const response=await fetch(url,{signal})
  if(!response.ok)throw new Error('OpenFreeMap returned '+response.status)
  return response
}

export async function loadContext(anchor:Anchor,signal:AbortSignal) {
  const id=anchor.lat+','+anchor.lon
  const cached=cache.get(id)
  if(cached)return cached
  const deadline=AbortSignal.any([signal,AbortSignal.timeout(12000)])
  const response=await request(tileJsonUrl,deadline)
  const info=await response.json()
  if(typeof info.tiles?.[0]!=='string'||!Number.isInteger(info.maxzoom))throw new Error('Invalid OpenFreeMap tile manifest')
  const template=new URL(info.tiles[0],response.url||tileJsonUrl).href
    .replaceAll('%7B','{').replaceAll('%7D','}')
  const z=Math.min(info.maxzoom,14)
  const frame=mapFrame(anchor,z)
  const batch:Promise<ContextBuilding[]>[]=[]
  for(let x=Math.floor(frame.x-radius/frame.width);x<=Math.floor(frame.x+radius/frame.width);x++){
    for(let y=Math.max(0,Math.floor(frame.y-radius/frame.width));y<=Math.min(frame.count-1,Math.floor(frame.y+radius/frame.width));y++){
      const tileX=(x%frame.count+frame.count)%frame.count
      const url=template.replace('{z}',String(z)).replace('{x}',String(tileX)).replace('{y}',String(y))
      batch.push(request(url,deadline).then(async tile=>tile.status===204?[]:
        readBuildings(new Uint8Array(await tile.arrayBuffer()),anchor,z,x,y)))
    }
  }
  const seen=new Set<string>()
  const buildings=(await Promise.all(batch)).flat().filter(b=>{
    const key=b.height+':'+b.base+':'+b.rings.map(r=>r.flat().map(v=>Math.round(v*10)).join(',')).join(';')
    if(seen.has(key))return false
    seen.add(key)
    return true
  })
  if(cache.size>=8)cache.delete(cache.keys().next().value!)
  cache.set(id,buildings)
  return buildings
}
