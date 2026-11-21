import {mapFrame,mapTiles,type Anchor} from './geography.ts'
import type {Point} from './model.ts'

declare const MAPBOX_PUBLIC_TOKEN:string
export const mapboxToken=typeof MAPBOX_PUBLIC_TOKEN==='string'?MAPBOX_PUBLIC_TOKEN:''
export function mapboxTile(layer:string,z:number,x:number,y:number,format:string) {
  return `https://api.mapbox.com/v4/${layer}/${z}/${x}/${y}.${format}?access_token=${encodeURIComponent(mapboxToken)}`
}

export type AerialTile={image:ImageBitmap;origin:Point;width:number}

export async function loadAerial(anchor:Anchor,signal:AbortSignal):Promise<AerialTile[]>{
  const z=17
  const frame=mapFrame(anchor,z)
  const deadline=AbortSignal.any([signal,AbortSignal.timeout(12000)])
  const outcomes=await Promise.allSettled(mapTiles(frame,420).map(async ({x,y,wrappedX}):Promise<AerialTile>=>{
    const response=await fetch(mapboxTile('mapbox.satellite',z,wrappedX,y,'jpg'),{signal:deadline})
    if(!response.ok)throw new Error('Imagery unavailable')
    const image=await createImageBitmap(await response.blob())
    return {image,origin:[(x-frame.x)*frame.width,(y-frame.y)*frame.width],width:frame.width}
  }))
  const images=outcomes.flatMap(result=>result.status==='fulfilled'?[result.value]:[])
  if(signal.aborted)images.forEach(tile=>tile.image.close())
  return signal.aborted?[]:images
}
