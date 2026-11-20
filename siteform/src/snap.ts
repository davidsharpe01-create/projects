import {floorOutline,floors,footprints,length,type Point,type Project} from './model.ts'

export type SnapEdge={a:Point;b:Point;source:'boundary'|'building';block?:string}
export type SnapGuide={point:Point;edge:SnapEdge;label:string;anchor?:Point;level?:number}
const pixelTolerance=10
const angleTolerance=5*Math.PI/180
const halfTurn=Math.PI/2
const grid=(p:Point):Point=>[Math.round(p[0]*2)/2,Math.round(p[1]*2)/2]
const direction=(a:Point,b:Point)=>Math.atan2(b[1]-a[1],b[0]-a[0])

export function snapEdges(project:Project,floor:number) {
  const edges:SnapEdge[]=[]
  const add=(poly:Point[],source:SnapEdge['source'],block?:string)=>{
    if(poly.length<2)return
    poly.forEach((a,i)=>{
      const b=poly[(i+1)%poly.length]
      if(length(a,b)>.01)edges.push({a,b,source,block})
    })
  }
  add(project.boundary,'boundary')
  project.blocks.forEach(block=>{
    if(floor>=floors(block))return
    footprints(block,project.targets).forEach(poly=>
      add(block.type!=='house'?floorOutline(block,poly,floor):poly,'building',block.id))
  })
  return edges
}
export function snapAngle(angle:number,edges:SnapEdge[]) {
  let best:{angle:number;edge:SnapEdge;label:string}|undefined
  let distance=angleTolerance
  for(const edge of edges){
    const base=direction(edge.a,edge.b)
    const quarter=Math.round((angle-base)/halfTurn)
    const candidate=base+quarter*halfTurn
    const delta=Math.abs(angle-candidate)
    if(delta<distance){
      distance=delta
      const relation=quarter%2===0?'Parallel':'Perpendicular'
      best={angle:candidate,edge,label:relation+(edge.source==='boundary'?' to boundary':' to building face')}
    }
  }
  return best
}
export function snapPoint(raw:Point,edges:SnapEdge[],project:(p:Point)=>Point,anchors:Point[]=[]) {
  const screen=project(raw)
  let vertex:SnapGuide|undefined,face:SnapGuide|undefined
  let bestVertex=7,bestFace=pixelTolerance
  for(const edge of edges){
    const a=project(edge.a),b=project(edge.b)
    const name=edge.source==='boundary'?'Site boundary':'Building'
    for(const [p,xy] of [[edge.a,a],[edge.b,b]]){
      const dist=length(screen,xy)
      if(dist<bestVertex){bestVertex=dist;vertex={point:p,edge,label:name+' corner'}}
    }
    const dx=b[0]-a[0],dy=b[1]-a[1],squared=dx*dx+dy*dy
    if(squared<1e-8)continue
    const t=((screen[0]-a[0])*dx+(screen[1]-a[1])*dy)/squared
    if(t<0||t>1)continue
    const dist=Math.hypot(screen[0]-a[0]-t*dx,screen[1]-a[1]-t*dy)
    if(dist<bestFace){
      bestFace=dist
      face={point:[edge.a[0]+t*(edge.b[0]-edge.a[0]),edge.a[1]+t*(edge.b[1]-edge.a[1])],
        edge,label:edge.source==='boundary'?name:'Building face'}
    }
  }
  if(vertex||face){
    const guide=(vertex??face)!
    return {point:guide.point,guide}
  }
  let guide:SnapGuide|undefined,closest=16
  for(const anchor of anchors){
    if(length(project(anchor),screen)<10)continue
    const match=snapAngle(direction(anchor,raw),edges)
    if(!match)continue
    const dx=Math.cos(match.angle),dy=Math.sin(match.angle)
    const along=(raw[0]-anchor[0])*dx+(raw[1]-anchor[1])*dy
    const point:Point=[anchor[0]+along*dx,anchor[1]+along*dy]
    const distance=length(screen,project(point))
    if(distance<closest){closest=distance;guide={point,anchor,edge:match.edge,label:match.label}}
  }
  return {point:guide?.point??grid(raw),guide}
}

export function snapAlong(origin:Point,axis:Point,movement:number,edges:SnapEdge[],project:(p:Point)=>Point) {
  let closest=pixelTolerance
  let match:{movement:number;guide:SnapGuide}|undefined
  const raw=project([origin[0]+movement*axis[0],origin[1]+movement*axis[1]])
  for(const edge of edges){
    const dx=edge.b[0]-edge.a[0],dy=edge.b[1]-edge.a[1]
    const cross=axis[0]*dy-axis[1]*dx
    if(Math.abs(cross)<1e-7)continue
    const x=edge.a[0]-origin[0],y=edge.a[1]-origin[1]
    const t=(x*axis[1]-y*axis[0])/cross
    if(t<0||t>1)continue
    const distance=(x*dy-y*dx)/cross
    const point:Point=[origin[0]+distance*axis[0],origin[1]+distance*axis[1]]
    const pixels=length(raw,project(point))
    if(pixels<closest){
      closest=pixels
      match={movement:distance,guide:{point,edge,label:edge.source==='boundary'?'Site boundary':'Building face'}}
    }
  }
  return match
}
