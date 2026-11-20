import type { Point } from './model'
const earth=6378137
const rad=Math.PI/180
export type Anchor={lat:number;lon:number}
export function geographicPoint(anchor:Anchor,east:number,south:number):Anchor{
  return {lat:anchor.lat-south/(earth*rad),lon:anchor.lon+east/(earth*rad*Math.cos(anchor.lat*rad))}
}
export function mapFrame(anchor:Anchor,zoom:number) {
  const latitude=anchor.lat*rad
  const count=2**zoom
  return {
    x:(anchor.lon+180)/360*count,
    y:(.5-Math.asinh(Math.tan(latitude))/(2*Math.PI))*count,
    width:2*Math.PI*earth*Math.cos(latitude)/count,
    count
  }
}
const tiles=new Map<string,HTMLImageElement>()
export function paintMap(context:CanvasRenderingContext2D,anchor:Anchor,scale:number,size:Point,
  project:(p:Point)=>Point,invert:(p:Point)=>Point,refresh:()=>void) {
  const [w,h]=size
  const zoom=Math.max(0,Math.min(19,Math.floor(Math.log2(2*Math.PI*earth*Math.cos(anchor.lat*rad)*scale/256))))
  const f=mapFrame(anchor,zoom)
  const corners=([[0,0],[w,0],[w,h],[0,h]] as Point[]).map(invert)
  const minX=Math.floor(f.x+Math.min(...corners.map(p=>p[0]))/f.width)
  const maxX=Math.floor(f.x+Math.max(...corners.map(p=>p[0]))/f.width)
  const minY=Math.max(0,Math.floor(f.y+Math.min(...corners.map(p=>p[1]))/f.width))
  const maxY=Math.min(f.count-1,Math.floor(f.y+Math.max(...corners.map(p=>p[1]))/f.width))
  if((maxX-minX+1)*(maxY-minY+1)>70)return
  for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){
    const wrapped=(x%f.count+f.count)%f.count
    const key=zoom+'/'+wrapped+'/'+y
    let image=tiles.get(key)
    if(!image){
      image=new Image()
      image.onload=refresh
      image.src='https://tile.openstreetmap.org/'+key+'.png'
      tiles.set(key,image)
      if(tiles.size>180)tiles.delete(tiles.keys().next().value!)
    }
    if(!image.complete||!image.naturalWidth)continue
    const east=(x-f.x)*f.width,south=(y-f.y)*f.width
    const a=project([east,south]),b=project([east+f.width,south]),c=project([east,south+f.width])
    context.save()
    context.transform((b[0]-a[0])/256,(b[1]-a[1])/256,(c[0]-a[0])/256,(c[1]-a[1])/256,...a)
    context.drawImage(image,0,0,256.5,256.5)
    context.restore()
  }
}
