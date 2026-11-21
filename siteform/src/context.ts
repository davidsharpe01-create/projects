import {classifyRings,VectorTile,type VectorTileFeature} from '@mapbox/vector-tile'
import {PbfReader} from 'pbf'
import earcut from 'earcut'
import {mapFrame,mapTiles,type Anchor} from './geography.ts'
import {mapboxTile,mapboxToken} from './aerial.ts'
import type {Point} from './model.ts'

export type ContextBuilding={rings:Point[][];triangles?:Point[][];height:number;base:number}
export type ContextRoad={line:Point[];kind:string}
export type StreetName=ContextRoad & {name:string}
export type ContextData={buildings:ContextBuilding[];roads:ContextRoad[];streetNames:StreetName[]; provider?:'mapbox'|'openfreemap'}
export const emptyContext:ContextData={buildings:[],roads:[],streetNames:[]}
export const roadWidths:Record<string,number>={motorway:18,trunk:15,primary:12,secondary:10,tertiary:8,minor:6,service:3.5,track:2.5}
const tileJsonUrl='https://tiles.openfreemap.org/planet/latest'
const radius=420
const cache=new Map<string,ContextData>()

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

export function readContextTile(data:Uint8Array,anchor:Anchor,z:number,x:number,y:number,mapbox=false):ContextData {
  const {building,transportation,transportation_name:names}=new VectorTile(new PbfReader(data)).layers
  const frame=mapFrame(anchor,z)
  const east=(x-frame.x)*frame.width,south=(y-frame.y)*frame.width
  function localCoordinates(feature:VectorTileFeature){
    const [left,top,right,bottom]=feature.bbox()
    const unit=frame.width/feature.extent
    if(east+left*unit>radius||east+right*unit< -radius||south+top*unit>radius||south+bottom*unit< -radius)return
    return ({x,y}:{x:number;y:number}):Point=>[east+x*unit,south+y*unit]
  }
  const buildings:ContextBuilding[]=[]
  for(let i=0;i<(building?.length??0);i++){
    const feature=building.feature(i)
    const attrs=feature.properties
    if(feature.type!==3||attrs.hide_3d===true||attrs.hide_3d===1||attrs.hide_3d==='1'||mapbox&&attrs.extrude==='false')continue
    const local=localCoordinates(feature)
    if(!local)continue
    const height=Number((mapbox?attrs.height:attrs.render_height)??0)
    const base=Number((mapbox?attrs.min_height:attrs.render_min_height)??0)
    const roof=Number.isFinite(height)&&height>0?height:0
    const bottomHeight=Number.isFinite(base)&&base>=0&&base<roof?base:0
    for(const polygon of classifyRings(feature.loadGeometry())){
      const rings=polygon.map(ring=>ring.slice(0,-1).map(local))
      if(!rings[0]||rings[0].length<3)continue
      buildings.push({rings,triangles:roofTriangles(rings),height:roof,base:bottomHeight})
    }
  }
  function readRoads(layer:typeof transportation){
    const roads:{line:Point[];kind:string;name:string}[]=[]
    for(let i=0;i<(layer?.length??0);i++){
      const feature=layer.feature(i)
      const attrs=feature.properties
      const kind=String(attrs.class??'')
      if(feature.type!==2||!Object.hasOwn(roadWidths,kind)||attrs.brunnel==='tunnel'||attrs.indoor===1)continue
      const local=localCoordinates(feature)
      if(!local)continue
      const name=String((kind==='motorway'?attrs.ref:attrs.name)??attrs.name??attrs.ref??'').trim()
      for(const shape of feature.loadGeometry()){
        if(shape.length>1)roads.push({line:shape.map(local),kind,name})
      }
    }
    return roads
  }
  return {buildings,roads:readRoads(transportation),streetNames:readRoads(names).filter(road=>road.name)}
}

async function request(url:string,signal:AbortSignal) {
  const response=await fetch(url,{signal})
  if(!response.ok)throw new Error('Map tile request returned '+response.status)
  return response
}

export async function loadContext(anchor:Anchor,signal:AbortSignal) {
  const id=anchor.lat+','+anchor.lon
  const cached=cache.get(id)
  if(cached)return cached
  const deadline=AbortSignal.any([signal,AbortSignal.timeout(12000)])
  async function openTiles(){
    const response=await request(tileJsonUrl,deadline)
    const info=await response.json()
    if(typeof info.tiles?.[0]!=='string'||!Number.isInteger(info.maxzoom))throw new Error('Invalid OpenFreeMap tile manifest')
    const template=new URL(info.tiles[0],response.url||tileJsonUrl).href
      .replaceAll('%7B','{').replaceAll('%7D','}')
    const z=Math.min(info.maxzoom,14)
    const frame=mapFrame(anchor,z)
    return Promise.all(mapTiles(frame,radius).map(async ({x,y,wrappedX})=>{
      const url=template.replace('{z}',String(z)).replace('{x}',String(wrappedX)).replace('{y}',String(y))
      const tile=await request(url,deadline)
      return tile.status===204?emptyContext:readContextTile(new Uint8Array(await tile.arrayBuffer()),anchor,z,x,y)
    }))
  }
  async function mapboxBuildings(){
    const z=15,frame=mapFrame(anchor,z)
    const tiles=await Promise.all(mapTiles(frame,radius).map(async ({x,y,wrappedX})=>{
      const response=await request(mapboxTile('mapbox.mapbox-streets-v8',z,wrappedX,y,'vector.pbf'),deadline)
      return response.status===204?[]:readContextTile(new Uint8Array(await response.arrayBuffer()),anchor,z,x,y,true).buildings
    }))
    return tiles.flat()
  }
  const [open,box]=await Promise.allSettled([openTiles(),mapboxToken?mapboxBuildings():Promise.resolve([])])
  if(open.status==='rejected'&&(box.status==='rejected'||!box.value.length))throw open.reason
  const tiles=open.status==='fulfilled'?open.value:[]
  const buildings=box.status==='fulfilled'&&box.value.length?box.value:tiles.flatMap(tile=>tile.buildings)
  const coordinates=(line:Point[])=>line.flat().map(v=>Math.round(v*10)).join(',')
  function unique<T>(items:T[],keyFor:(item:T)=>string) {
    const seen=new Set<string>()
    return items.filter(item=>{
      const key=keyFor(item)
      if(seen.has(key))return false
      seen.add(key)
      return true
    })
  }
  const context={
    provider:box.status==='fulfilled'&&box.value.length?'mapbox' as const:'openfreemap' as const,
    buildings:unique(buildings,b=>b.height+':'+b.base+':'+b.rings.map(coordinates).join(';')),
    roads:unique(tiles.flatMap(tile=>tile.roads),r=>r.kind+':'+coordinates(r.line)),
    streetNames:unique(tiles.flatMap(tile=>tile.streetNames),r=>r.name+':'+coordinates(r.line))
  }
  if(!mapboxToken||context.provider==='mapbox'){
    if(cache.size>=8)cache.delete(cache.keys().next().value!)
    cache.set(id,context)
  }
  return context
}
