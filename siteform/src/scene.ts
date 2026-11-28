import earcut from 'earcut'
import {apartmentLayout,type ApartmentFloor} from './apartment'
import {ndss} from './ndss'
import type {SnapGuide} from './snap'
import type {AerialTile} from './aerial'
import {roadWidths,type ContextData} from './context'
import { depthPlane, foregroundShape, pickSurface, visibleSurface, type Surface } from './depth'
import { footprints, internalFloorOutline, houseFloorplates, levels, height, floors, floorOutline, endDirection, endInset, inside, area, length, type Point, type Project } from './model'
const coreFill='#b8babc'
const editingBlue='#235b88'
const boundaryRed='#ef262e'
export type Camera = {angle:number; tilt:number; zoom:number; pan:Point}
export const home:Camera={angle:-.42,tilt:.63,zoom:1,pan:[0,0]}
export type Layers = {context:boolean; streets:boolean; aerial:boolean; travel:boolean; floorplates:boolean; grid:boolean}
export const initialLayers:Layers={context:true,streets:true,aerial:true,travel:true,floorplates:false,grid:false}
export function projection(w:number,h:number,c:Camera,plan:boolean) {
  const angle=plan?0:c.angle
  const s=Math.min(w/185,h/(plan?133:108))*c.zoom
  const x=w*.49+c.pan[0],y=h*.49+c.pan[1]
  const cs=Math.cos(angle),sn=Math.sin(angle),tilt=plan?1:c.tilt
  const project=(p:Point,z=0):Point=>[x+s*(p[0]*cs-p[1]*sn),y+s*((p[0]*sn+p[1]*cs)*tilt-z*Math.sqrt(1-tilt*tilt))]
  const invert=(p:Point):Point=>{
    const u=(p[0]-x)/s,v=(p[1]-y)/s/tilt
    return [u*cs+v*sn,-u*sn+v*cs]
  }
  const depth=(p:Point,z=0)=>(p[0]*sn+p[1]*cs)*Math.sqrt(1-tilt*tilt)+z*tilt
  return {project,invert,s,depth}
}
export function fitCamera(w:number,h:number,camera:Camera,plan:boolean,project:Project,maxZoom=4):Camera {
  const base:Camera={...camera,zoom:1,pan:[0,0]}
  const model=projection(w,h,base,plan)
  const points=project.boundary.map(p=>model.project(p))
  project.blocks.forEach(b=>footprints(b,project.targets).forEach(poly=>poly.forEach(p=>{
    points.push(model.project(p,plan?0:b.level),model.project(p,plan?0:b.level+height(b,project.houseHeights)))
  })))
  if(!points.length)return base
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1])
  const l=Math.min(...xs),r=Math.max(...xs),t=Math.min(...ys),b=Math.max(...ys)
  const zoom=Math.min(maxZoom,(w*.81)/Math.max(1,r-l),(h*.76)/Math.max(1,b-t))
  const [x,y]=model.project([0,0])
  return {...base,zoom,pan:[w/2-x-((l+r)/2-x)*zoom,h/2-y-((t+b)/2-y)*zoom]}
}
export type LegendEntry={label:string;colour:string;outline?:boolean}
type SetbackEdge = {origin:Point; inward:Point}

function exposedRoute(points:Point[],edges:SetbackEdge[]):Point[][] {
  if(!edges.length)return [points]
  return edges.flatMap(({origin,inward})=>{
    const offset=([x,y]:Point)=>(x-origin[0])*inward[0]+(y-origin[1])*inward[1]
    const portions:Point[][]=[]
    let current:Point[]|undefined
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],da=offset(a),db=offset(b)
      if(da>=0&&db>=0){current=undefined;continue}
      const crossing=():Point=>{
        const t=da/(da-db)
        return [a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]
      }
      if(!current){current=[da<=0?a:crossing()];portions.push(current)}
      current.push(db<=0?b:crossing())
      if(db>=0)current=undefined
    }
    return portions
  })
}

type Scene = {activeHandle?:number|'height'|null; showFloorplates:boolean; camera:Camera;plan:boolean;floor:number;editFloor:number;project:Project;selected:string|null;draft:Point[];pointer:Point|null;guide?:SnapGuide; layers:Layers; opacity:number; editFrontage:boolean; drawBuilding:boolean; editBoundary:boolean; skipLayouts?:boolean; context:ContextData; aerial:AerialTile[]; ghosted:ReadonlySet<number>}
export function draw(canvas:HTMLCanvasElement,scene:Scene) {
  const ctx=canvas.getContext('2d')!
  const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(devicePixelRatio,2)
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)
  }
  const {camera,plan,project,selected,draft,pointer,guide,layers,opacity,editFrontage,editBoundary,floor,editFloor}=scene
  const {project:xy,s,depth}=projection(w,h,camera,plan)
  ctx.setTransform(dpr,0,0,dpr,0,0)
  ctx.fillStyle='#eeeae3';ctx.fillRect(0,0,w,h)
  ctx.lineJoin='round';ctx.lineCap='round'
  const path=(points:Point[],fill?:string,stroke?:string,width=1,close=true)=>{
    if(!points.length)return
    ctx.beginPath();ctx.moveTo(...points[0]);points.slice(1).forEach(p=>ctx.lineTo(...p))
    if(close)ctx.closePath()
    if(fill){ctx.fillStyle=fill;ctx.fill()}
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke()}
  }
  const world=(p:Point[],fill?:string,stroke?:string,width=1,close=true,z=0)=>path(p.map(a=>xy(a,z)),fill,stroke,width,close)
  if(layers.aerial&&scene.aerial.length){
    ctx.save()
    ctx.globalAlpha=.34
    for(const {image,origin,width} of scene.aerial){
      const [x,y]=xy(origin)
      const [eastX,eastY]=xy([origin[0]+width,origin[1]])
      const [southX,southY]=xy([origin[0],origin[1]+width])
      ctx.save()
      ctx.transform(eastX-x,eastY-y,southX-x,southY-y,x,y)
      ctx.drawImage(image,0,0,1,1)
      ctx.restore()
    }
    ctx.restore()
  }
  if(layers.grid){
    for(let i=-300;i<=300;i+=10){
      world([[i,-300],[i,300]],undefined,'#64776d44',.8,false)
      world([[-300,i],[300,i]],undefined,'#64776d44',.8,false)
    }
  }
  const legend=new Map<string,LegendEntry>()
  function inView(points:Point[]){
    return points.length>0&&points.some(([x])=>x>=0)&&points.some(([x])=>x<=w)&&
      points.some(([,y])=>y>=0)&&points.some(([,y])=>y<=h)
  }
  function key(label:string,colour:string,shape:Point[],z=0,outline=false){
    if(!legend.has(label)&&inView(shape.map(p=>xy(p,z))))legend.set(label,{label,colour,outline})
  }
  const boundary=project.boundary
  key('Site boundary',boundaryRed,boundary,0,true)
  world(boundary,project.anchor?'#ead7be72':'#e9dbc7',boundaryRed,3.4)
  type Drawable=Surface & {paint:()=>void;alpha?:number;rearWall?:boolean;bounds:[number,number,number,number]}
  const surfaces:Drawable[]=[]
  function addSurface(surface:Surface,paint:()=>void,alpha?:number,rearWall=false){
    const xs=surface.shape.map(p=>p[0]),ys=surface.shape.map(p=>p[1])
    const bounds:Drawable['bounds']=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]
    if(bounds[2]<-2||bounds[0]>w+2||bounds[3]<-2||bounds[1]>h+2)return
    surfaces.push({...surface,paint,bounds,alpha,rearWall})
  }
  type Material={roof:string; walls:string[]; line:string; floor:string}
  const white:Material={roof:'#fffefd',walls:['#efefed','#dededc','#e8e8e6','#f5f5f3'],line:'#a09f9a',floor:'#c5c4bf'}
  const activeFloorMaterial:Material={
    ...white,roof:'#dbeeff',walls:['#82bcea','#6ba9df','#78b2e5','#a2cff3'],line:editingBlue,floor:editingBlue
  }
  const face=(poly:Point[],z:number,material:Material,storeys:number[],id?:string,base=0,storey?:number,cap=true,topRoof=true,holes:Point[][]=[],triangles?:Point[][],contextIndex?:number,outlineOnly=false,layout?:ApartmentFloor,showTravel=false,wallOpacity?:number,showLayout=true,setbackEdges:SetbackEdge[]=[],interior?:Point[]|null)=>{
    const top=poly.map(p=>xy(p,z))
    if(!plan&&z>base){
      const winding=poly.reduce((sum,p,i)=>{const q=poly[(i+1)%poly.length];return sum+p[0]*q[1]-p[1]*q[0]},0)
      for(const ring of [poly,...holes])ring.forEach((p,i)=>{
        const q=ring[(i+1)%ring.length],a=xy(p,base),b=xy(q,base)
        const facing=(b[0]-a[0])*Math.sign(winding)
        const rearWall=facing>0
        if(Math.abs(facing)<1e-7||rearWall&&wallOpacity===undefined)return
        const high=xy(p,z)
        const shape=[a,b,xy(q,z),high]
        addSurface({id,contextIndex,floor:storey,shape,depth:depthPlane(a,b,high,depth(p,base),depth(q,base),depth(p,z))},()=>{
          path(shape,material.walls[i%4],material.line,.75)
          if(storey!==undefined)path([high,xy(q,z)],undefined,material.floor,.85,false)
          storeys.slice(0,-1).forEach(level=>path([xy(p,base+level),xy(q,base+level)],undefined,material.floor,.85,false))
        },wallOpacity,rearWall)
      })
    }
    if(!cap)return
    // A roof is horizontal, so depth across it depends only on screen height.
    const roofDepth=plan?()=>0:([,y]:Point)=>depth(poly[0],z)+(y-top[0][1])*Math.sqrt(1-camera.tilt**2)/(s*camera.tilt)
    if(triangles){
      for(const triangle of triangles){
        const shape=triangle.map(p=>xy(p,z))
        addSurface({shape,depth:roofDepth,contextIndex},()=>{if(!outlineOnly)path(shape,material.roof)})
      }
    }else{
      addSurface({id,contextIndex,shape:top,depth:roofDepth,roof:topRoof,floor:storey},
        ()=>{
          if(outlineOnly)return
          path(top,material.roof,material.line,id&&id===selected?1.75:.8)
          if(interior){
            key('Internal floorplate','#e6eaed',interior,z)
            world(interior,'#e6eaed','#9ca5ab',.8,true,z)
          }
          if(!layout)return
          if(showLayout){
            const detail=(label:string,shape:Point[],fill:string,stroke:string,width:number)=>{
              key(label,fill,shape,z)
              world(shape,fill,stroke,width,true,z)
            }
            detail('Corridor',layout.corridor,'#e7e4dd','#a9a298',.7)
            layout.cores.forEach(core=>detail('Core',core,coreFill,'#727678',.8))
            layout.uses.forEach(use=>detail(use.kind==='commercial'?'Commercial':'Communal',use.outline,
              use.kind==='commercial'?'#dec4a2':'#c8c5ad','#8c8173',.7))
            layout.units.forEach(unit=>detail(unit.type,unit.outline,
              project.apartmentSettings?.colours?.[unit.type]??ndss[unit.type].colour,'#66615b',.65))
          }
          if(layers.travel&&showTravel&&id===selected){
            const red='#a52d28'
            const annotations=layout.travelRoutes.flatMap(route=>{
              const portions=exposedRoute(route.points,setbackEdges)
              if(!portions.length)return []
              let longest=0,anchor:Point=xy(portions[0][0],z)
              for(const portion of portions){
                key('Travel distance',red,portion,z,true)
                const points=portion.map(p=>xy(p,z))
                ctx.setLineDash(route.betweenCores?[5,3]:[])
                path(points,undefined,red,1.8,false)
                ctx.setLineDash([])
                for(let i=1;i<points.length;i++){
                  const [a,b]=[points[i-1],points[i]]
                  const size=length(a,b)
                  if(size>longest){longest=size;anchor=[(a[0]+b[0])/2,(a[1]+b[1])/2]}
                }
                for(const endpoint of [portion[0],portion.at(-1)!]){
                  if(endpoint!==route.points[0]&&endpoint!==route.points.at(-1))continue
                  const [x,y]=xy(endpoint,z)
                  ctx.beginPath();ctx.arc(x,y,2.5,0,Math.PI*2);ctx.fillStyle=red;ctx.fill()
                }
              }
              return [{anchor,label:route.distance.toFixed(1)+' m'}]
            })
            ctx.save()
            ctx.font='600 11px system-ui';ctx.textAlign='center';ctx.textBaseline='bottom'
            ctx.lineWidth=3;ctx.strokeStyle='#fffaf4';ctx.fillStyle=red
            for(const {anchor:[x,y],label} of annotations){
              ctx.strokeText(label,x,y-3);ctx.fillText(label,x,y-3)
            }
            ctx.restore()
          }
        })
    }
  }
  const contextMaterial={...white,line:'#bcbbb7'}
  if(layers.context)scene.context.buildings.forEach((building,index)=>{
    const [outline,...holes]=building.rings
    const ghost=scene.ghosted.has(index)
    const outlineOnly=plan||building.height===0||ghost
    key(ghost?'Ghosted buildings':'Existing buildings',outlineOnly?contextMaterial.line:contextMaterial.roof,
      outline,plan?0:building.height,outlineOnly)
    if(outlineOnly){
      ctx.save()
      if(ghost){ctx.setLineDash([1,4]);ctx.globalAlpha=.68}
      for(const ring of building.rings){
        world(ring,undefined,contextMaterial.line,ghost?1.5:.9,true,plan?0:building.height)
        if(ghost&&!plan&&building.height>building.base){
          world(ring,undefined,contextMaterial.line,1,true,building.base)
          ring.forEach(p=>path([xy(p,building.base),xy(p,building.height)],undefined,contextMaterial.line,1,false))
        }
      }
      ctx.restore()
    }
    face(outline,plan?0:building.height,contextMaterial,[],undefined,building.base,undefined,true,false,
      holes,building.triangles,index,outlineOnly)
  })
  const labels:{p:Point;name:string;selected:boolean}[]=[]
  let heightHandle:Point|undefined
  project.blocks.forEach(b=>{
    if(plan && floor>=floors(b))return
    const polys=footprints(b,project.targets),z=plan?0:height(b,project.houseHeights)+b.level
    const layout=scene.skipLayouts?undefined:apartmentLayout(b,project)
    const validLayout=layout?.ok?layout:undefined
    const detailed=layers.floorplates||b.id===selected&&scene.showFloorplates
    const stack=!plan&&detailed
    const material={...white,line:b.id===selected?editingBlue:white.line}
    const firstSurface=surfaces.length
    let group=polys.flat()
    const setbackEdges=(i:number):SetbackEdge[]=>{
      const above=endInset(b,i+1)
      return endInset(b,i).flatMap((inset,end)=>{
        if(above[end]<=inset)return []
        const [x,y]=end?b.line.at(-1)!:b.line[0]
        const inward=endDirection(b,end)
        return [{origin:[x+inward[0]*above[end],y+inward[1]*above[end]],inward}]
      })
    }
    if(stack&&polys[0]){
      const outlines=b.type==='house'?houseFloorplates(b,project.targets):[{outline:polys[0],innerOutline:undefined}]
      const storeys=levels(b,project.houseHeights)
      storeys.forEach((top,i)=>{
        const base=b.level+(storeys[i-1]??0)
        const detail=validLayout?.floors[i]
        const active=b.id===selected&&editFrontage&&i===editFloor
        const slab=active?activeFloorMaterial:white
        const edges=setbackEdges(i)
        for(const {outline,innerOutline} of outlines){
          const plate=floorOutline(b,outline,i)
          face(plate,b.level+top,active?activeFloorMaterial:white,[],b.id,base,i,false,false,[],undefined,undefined,false,undefined,false,active ? .68 : .5)
          const interior=detail?undefined:innerOutline??internalFloorOutline(plate)
          face(plate,base+.025,slab,[],b.id,base+.025,i,true,false,[],undefined,undefined,false,detail,i===storeys.length-1||edges.length>0,undefined,true,edges,interior)
          if(b.type!=='house'&&i===storeys.length-1)group=plate
        }
      })
    }else if(b.type!=='house'&&polys[0]){
      const heights=levels(b)
      if(plan){
        const poly=floorOutline(b,polys[0],floor)
        face(poly,0,b.id===selected&&editFrontage&&floor===editFloor?activeFloorMaterial:material,[],b.id,0,undefined,true,true,[],undefined,undefined,false,validLayout?.floors[floor],true,undefined,true,[],detailed&&!validLayout?.floors[floor]?internalFloorOutline(poly):undefined)
        group=poly
      }else{
        heights.forEach((top,i)=>{
          const poly=floorOutline(b,polys[0],i)
          const last=i===heights.length-1
          const edges=setbackEdges(i)
          const cap=last||edges.length>0
          const active=i===editFloor&&b.id===selected&&editFrontage
          const colour=active?activeFloorMaterial:material
          face(poly,b.level+top,colour,[],b.id,b.level+(heights[i-1]??0),i,cap,last,[],undefined,undefined,false,cap?validLayout?.floors[i]:undefined,cap,undefined,false,edges)
          if(last)group=poly
        })
      }
    }else if(plan&&detailed){
      for(const {outline,innerOutline} of houseFloorplates(b,project.targets)){
        face(outline,0,material,[],b.id,0,undefined,true,true,[],undefined,undefined,false,undefined,false,undefined,true,[],innerOutline)
      }
    }else{
      polys.forEach(poly=>face(poly,z,material,levels(b,project.houseHeights),b.id,plan?0:b.level))
    }
    if(surfaces.length>firstSurface&&!(plan&&validLayout?.floors[floor])){
      const label='Proposed buildings'
      if(!legend.has(label))legend.set(label,{label,colour:white.roof})
    }
    if(!plan&&group.length&&b.id===selected){
      let center=group.reduce(([x,y],p)=>[x+p[0]/group.length,y+p[1]/group.length] as Point,[0,0] as Point)
      if(editFrontage&&b.type!=='house'){
        if(!inside(center,group)){
          const indices=earcut(group.flat())
          let largest=0
          for(let i=0;i<indices.length;i+=3){
            const triangle=indices.slice(i,i+3).map(index=>group[index])
            const size=area(triangle)
            if(size>largest){
              largest=size
              center=[(triangle[0][0]+triangle[1][0]+triangle[2][0])/3,
                (triangle[0][1]+triangle[1][1]+triangle[2][1])/3]
            }
          }
        }
        heightHandle=xy(center,z)
      }else labels.push({p:xy(center,z),name:b.name,selected:b.id===selected})
    }
  })
  const solidSurfaces=surfaces.filter(surface=>surface.contextIndex===undefined||!scene.ghosted.has(surface.contextIndex))
  const translucentWalls=solidSurfaces.filter(surface=>surface.alpha!==undefined)
  const paintSurfaces=[
    ...solidSurfaces.filter(surface=>surface.alpha===undefined),
    ...translucentWalls.filter(surface=>surface.rearWall),
    ...translucentWalls.filter(surface=>!surface.rearWall)
  ]
  paintSurfaces.forEach((surface,index)=>{
    ctx.save()
    if(surface.id)ctx.globalAlpha=surface.alpha??opacity
    if(!plan){
      const [left,top,right,bottom]=surface.bounds
      // Clip only where another face projects in front of this one.
      paintSurfaces.forEach((other,i)=>{
        if(i===index||other.alpha!==undefined&&surface.alpha===undefined||(!surface.id&&other.id&&opacity<1))return
        // Let the walls on the far side show through the translucent walls in front.
        if(surface.alpha!==undefined&&other.alpha!==undefined&&surface.id===other.id&&surface.rearWall!==other.rearWall)return
        const [x,y,r,b]=other.bounds
        if(r<=left||x>=right||b<=top||y>=bottom)return
        const mask=foregroundShape(surface,other,i>index)
        if(mask.length<3)return
        ctx.beginPath()
        ctx.rect(-2,-2,w+4,h+4)
        ctx.moveTo(...mask[0])
        mask.slice(1).forEach(p=>ctx.lineTo(...p))
        ctx.closePath()
        ctx.clip('evenodd')
      })
    }
    surface.paint()
    ctx.restore()
  })
  if(layers.streets){
    const used=new Set<string>()
    const boxes:{x:number;y:number;half:number}[]=[]
    const streetNames=[...scene.context.streetNames].sort((a,b)=>roadWidths[b.kind]-roadWidths[a.kind])
    ctx.font='500 11px system-ui'
    ctx.textAlign='center'
    ctx.textBaseline='middle'
    for(const street of streetNames){
      if(used.has(street.name))continue
      const points=street.line.map(p=>xy(p))
      const widths=points.slice(1).map((p,i)=>length(p,points[i]))
      const total=widths.reduce((a,b)=>a+b,0)
      const half=ctx.measureText(street.name).width/2+4
      if(total<half*2+4)continue
      const candidates=widths.map((width,i)=>({width,a:points[i],b:points[i+1]}))
        .sort((a,b)=>b.width-a.width)
      let placed=false
      for(const {a,b,width} of candidates){
        if(width<10)break
        for(const t of [.5,.25,.75]){
          const x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t
          if(x-half<10||x+half>w-43||y<23||y>h-26)continue
          if(boxes.some(box=>Math.abs(x-box.x)<half+box.half+7&&Math.abs(y-box.y)<20))continue
          if([x,x-half,x+half].some(px=>visibleSurface(solidSurfaces,[px,y])))continue
          ctx.lineWidth=3
          ctx.strokeStyle='#faf8f2'
          ctx.strokeText(street.name,x,y)
          ctx.fillStyle='#554e43'
          ctx.fillText(street.name,x,y)
          boxes.push({x,y,half})
          used.add(street.name)
          placed=true
          break
        }
        if(placed)break
      }
    }
  }
  labels.forEach(({p:[x,y],name,selected:chosen})=>{
    ctx.font='600 11px system-ui'
    const width=ctx.measureText(name).width+21
    ctx.beginPath();ctx.roundRect(x-width/2,y-11,width,22,5)
    ctx.fillStyle=chosen?editingBlue:'#fdfcf8';ctx.fill()
    ctx.fillStyle=chosen?'#fff':'#354f63';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(name,x,y+.5)
  })
  if(heightHandle){
    const [x,y]=heightHandle,active=scene.activeHandle==='height'
    const colour=active?'#fff':editingBlue
    dot(heightHandle,editingBlue,8,active)
    path([[x,y-4.5],[x,y+4.5]],undefined,colour,1.4,false)
    path([[x-2.5,y-2],[x,y-4.5],[x+2.5,y-2]],undefined,colour,1.4,false)
    path([[x-2.5,y+2],[x,y+4.5],[x+2.5,y+2]],undefined,colour,1.4,false)
  }
  const block=editFrontage?project.blocks.find(b=>b.id===selected && (!plan||floor<floors(b))):undefined
  const setbackHandles:Point[]=[]
  if(block&&block.type!=='house'&&editFloor>0&&editFloor<block.floors){
    const outline=footprints(block,project.targets)[0]
    if(outline){
      const poly=floorOutline(block,outline,editFloor)
      const heights=levels(block)
      const elevation=plan?0:block.level+((layers.floorplates||scene.showFloorplates)?heights[editFloor]:(heights[editFloor-1]+heights[editFloor])/2)
      const lastFront=poly.length/2-1
      const front=poly.slice(0,lastFront+1).map(p=>xy(p,elevation))
      path(front,undefined,editingBlue,2,false)
      setbackHandles.push(front[0],front[lastFront])
      setbackHandles.forEach((p,i)=>dot(p,editingBlue,6.5,scene.activeHandle===i))
    }
  }
  const handles=block&&(!editFloor||block.type==='house')
    ?block.line.map(p=>xy(p,plan?0:block.level))
    :editBoundary?boundary.map(p=>xy(p)):[]
  if(block)path(handles,undefined,editingBlue,2,false)
  handles.forEach((p,i)=>dot(p,block?editingBlue:boundaryRed,5.5,scene.activeHandle===i))
  if(draft.length){
    const colour=scene.drawBuilding?editingBlue:boundaryRed
    world(draft,undefined,colour,2,false)
    if(pointer){ctx.setLineDash([5,5]);world([draft.at(-1)!,pointer],undefined,colour,1.6,false);ctx.setLineDash([])}
    draft.forEach(p=>dot(xy(p),colour,4.2))
  }
  if(guide){
    const colour=block||scene.drawBuilding?editingBlue:'#6953a2'
    const level=guide.level??0
    ctx.setLineDash([4,4])
    world([guide.edge.a,guide.edge.b],undefined,colour,2,false,level)
    if(guide.anchor)world([guide.anchor,guide.point],undefined,colour,1.6,false,level)
    ctx.setLineDash([])
    const point=xy(guide.point,level)
    dot(point,colour,5)
    ctx.font='600 11px system-ui'
    const width=ctx.measureText(guide.label).width+14
    const x=Math.min(w-width-4,Math.max(4,point[0]+10)),y=Math.max(4,point[1]-27)
    ctx.beginPath();ctx.roundRect(x,y,width,19,4)
    ctx.fillStyle=colour;ctx.fill()
    ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle='white'
    ctx.fillText(guide.label,x+7,y+10)
  }
  function dot(p:Point,colour:string,r:number,filled=false){
    ctx.beginPath();ctx.arc(...p,r,0,2*Math.PI);ctx.fillStyle=filled?colour:'#fffdf5';ctx.fill()
    ctx.strokeStyle=colour;ctx.lineWidth=2;ctx.stroke()
  }
  return {legend:[...legend.values()],pick:(point:Point)=>pickSurface(solidSurfaces,point),handles,
    pickContext:(point:Point)=>visibleSurface(solidSurfaces,point)?.contextIndex,
    pickGhost:(point:Point)=>visibleSurface(surfaces.filter(surface=>
      surface.contextIndex!==undefined&&scene.ghosted.has(surface.contextIndex)),point)?.contextIndex,
    setbackHandles,pickFloor:(point:Point)=>{
      const surface=visibleSurface(solidSurfaces,point)
      return surface?.floor??0
    },
    heightAt:(point:Point,handleOnly=false)=>!!heightHandle&&(length(point,heightHandle)<12||!handleOnly&&pickSurface(solidSurfaces,point,true)===selected)}
}
