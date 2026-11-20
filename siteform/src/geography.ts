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
