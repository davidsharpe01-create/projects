import {inside,type Point} from './model.ts'

export type Depth = (point:Point)=>number
export type Surface = {shape:Point[];depth:Depth;id?:string;roof?:boolean;floor?:number}
const tolerance=1e-6

export function depthPlane(a:Point,b:Point,c:Point,za:number,zb:number,zc:number):Depth {
  const dx=b[0]-a[0],dy=b[1]-a[1],ex=c[0]-a[0],ey=c[1]-a[1]
  const det=dx*ey-dy*ex
  const x=((zb-za)*ey-(zc-za)*dy)/det
  const y=(dx*(zc-za)-ex*(zb-za))/det
  return p=>za+x*(p[0]-a[0])+y*(p[1]-a[1])
}

export function foregroundShape(target:Surface,other:Surface,otherWinsTie:boolean):Point[] {
  // Offset the comparison slightly to give coplanar surfaces a stable order.
  const delta=(p:Point)=>other.depth(p)-target.depth(p)+(otherWinsTie?tolerance:-tolerance)
  const polygon:Point[]=[]
  let a=other.shape.at(-1)!,da=delta(a)
  for(const b of other.shape){
    const db=delta(b)
    if((da>0)!==(db>0)){
      const t=da/(da-db)
      polygon.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t])
    }
    if(db>0)polygon.push(b)
    a=b;da=db
  }
  return polygon
}

export function visibleSurface(surfaces:Surface[],point:Point) {
  let closest=-Infinity,visible:Surface|undefined
  for(const surface of surfaces){
    const depth=surface.depth(point)
    if(depth>=closest-tolerance&&inside(point,surface.shape)){
      closest=depth
      visible=surface
    }
  }
  return visible
}

export function pickSurface(surfaces:Surface[],point:Point,roofOnly=false) {
  const visible=visibleSurface(surfaces,point)
  return roofOnly&&!visible?.roof?null:visible?.id??null
}
