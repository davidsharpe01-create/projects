import earcut from 'earcut'
import {apartmentLayout,type ApartmentFloor} from './apartment'
import {ndss} from './ndss'
import type {SnapGuide} from './snap'
import type {AerialTile} from './aerial'
import {roadWidths,type ContextData} from './context'
import { depthPlane, foregroundShape, pickSurface, visibleSurface, type Surface } from './depth'
import { footprints, levels, height, floors, floorOutline, endInset, inside, area, length, type Point, type Project } from './model'
export const coreFill='#b8babc'
const editingBlue='#235b88'
export type Camera = {angle:number; tilt:number; zoom:number; pan:Point}
export const home:Camera={angle:-.42,tilt:.63,zoom:1,pan:[0,0]}
export type Layers = {context:boolean; streets:boolean; aerial:boolean; hrb:boolean; travel:boolean; grid:boolean; labels:boolean}
export const initialLayers:Layers={context:true,streets:true,aerial:true,hrb:true,travel:true,grid:false,labels:true}
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
type Scene = {showApartments:boolean; camera:Camera;plan:boolean;floor:number;editFloor:number;project:Project;selected:string|null;draft:Point[];pointer:Point|null;guide?:SnapGuide; layers:Layers; opacity:number; editFrontage:boolean; drawBuilding:boolean; editBoundary:boolean; drafting?:boolean; context:ContextData; aerial:AerialTile[]; ghosted:ReadonlySet<number>}
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
  const boundary=project.boundary
  world(boundary,project.anchor?'#ead7be72':'#e9dbc7','#ad574e',2.1)
  type Drawable=Surface & {paint:()=>void;bounds:[number,number,number,number]}
  const surfaces:Drawable[]=[]
  function addSurface(surface:Surface,paint:()=>void){
    const xs=surface.shape.map(p=>p[0]),ys=surface.shape.map(p=>p[1])
    const bounds:Drawable['bounds']=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]
    if(bounds[2]<-2||bounds[0]>w+2||bounds[3]<-2||bounds[1]>h+2)return
    surfaces.push({...surface,paint,bounds})
  }
  type Material={roof:string; walls:string[]; line:string; floor:string}
  const white:Material={roof:'#fffefd',walls:['#efefed','#dededc','#e8e8e6','#f5f5f3'],line:'#a09f9a',floor:'#c5c4bf'}
  const useTints={
    house:['#fcf7ee','#eee5d5','#e5dac9','#f2eadc','#f7f0e4'],
    apartment:['#eff7f3','#deebe4','#d2e2da','#e4efe9','#eaf4ee'],
    office:['#f0f5fb','#e0e9f3','#d6e2ee','#e6eef7','#ebf2f9'],
    pbsa:['#f6f1fa','#eae1f1','#e0d6e9','#eee7f4','#f3edf7']
  }
  const face=(poly:Point[],z:number,material:Material,storeys:number[],id?:string,base=0,storey?:number,cap=true,topRoof=true,holes:Point[][]=[],triangles?:Point[][],contextIndex?:number,outlineOnly=false,layout?:ApartmentFloor,showTravel=false)=>{
    const top=poly.map(p=>xy(p,z))
    if(!plan&&z>base){
      const winding=poly.reduce((sum,p,i)=>{const q=poly[(i+1)%poly.length];return sum+p[0]*q[1]-p[1]*q[0]},0)
      for(const ring of [poly,...holes])ring.forEach((p,i)=>{
        const q=ring[(i+1)%ring.length],a=xy(p,base),b=xy(q,base)
        if((b[0]-a[0])*Math.sign(winding)>=-1e-7)return
        const high=xy(p,z)
        const shape=[a,b,xy(q,z),high]
        addSurface({id,contextIndex,floor:storey,shape,depth:depthPlane(a,b,high,depth(p,base),depth(q,base),depth(p,z))},()=>{
          path(shape,material.walls[i%4],material.line,.75)
          if(storey!==undefined)path([high,xy(q,z)],undefined,material.floor,.85,false)
          storeys.slice(0,-1).forEach(level=>path([xy(p,base+level),xy(q,base+level)],undefined,material.floor,.85,false))
        })
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
          if(!layout)return
          world(layout.corridor,'#e7e4dd','#a9a298',.7,true,z)
          layout.cores.forEach(core=>world(core,coreFill,'#727678',.8,true,z))
          layout.uses.forEach(use=>world(use.outline,use.kind==='commercial'?'#dec4a2':'#c8c5ad','#8c8173',.7,true,z))
          layout.units.forEach(unit=>world(unit.outline,project.apartmentSettings?.colours?.[unit.type]??ndss[unit.type].colour,'#66615b',.65,true,z))
          if(layers.travel&&showTravel&&id===selected){
            const red='#a52d28'
            const annotations=layout.travelRoutes.map(route=>{
              const points=route.points.map(p=>xy(p,z))
              ctx.setLineDash(route.betweenCores?[5,3]:[])
              path(points,undefined,red,1.8,false)
              ctx.setLineDash([])
              for(const [x,y] of [points[0],points.at(-1)!]){
                ctx.beginPath();ctx.arc(x,y,2.5,0,Math.PI*2);ctx.fillStyle=red;ctx.fill()
              }
              let longest=0,anchor=points[0]
              for(let i=1;i<points.length;i++){
                const [a,b]=[points[i-1],points[i]]
                const size=length(a,b)
                if(size>longest){longest=size;anchor=[(a[0]+b[0])/2,(a[1]+b[1])/2]}
              }
              return {anchor,label:route.distance.toFixed(1)+' m'}
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
    const layout=scene.drafting?undefined:apartmentLayout(b,project)
    const validLayout=layout?.ok?layout:undefined
    const stack=!plan&&b.id===selected&&scene.showApartments&&!!b.apartmentLayout
    const [roof,...walls]=useTints[b.type]
    const material={...white,roof:b.type==='house'?`color-mix(in srgb, ${project.colours[b.houseType]} 24%, #fff)`:roof,walls,line:b.id===selected?editingBlue:!plan&&layers.hrb&&validLayout?.hrb?'#894864':white.line}
    let group=polys.flat()
    if(stack){
      const storeys=levels(b,project.houseHeights)
      storeys.forEach((top,i)=>{
        const elevation=b.level+top
        const last=i===storeys.length-1
        const slab={...material,roof:white.roof,
          line:i===Math.min(floor,storeys.length-1)?editingBlue:white.line}
        if(!polys[0])return
        const plate=floorOutline(b,polys[0],i)
        face(plate,elevation,slab,[],b.id,elevation-.24,i,true,last,[],undefined,undefined,false,
          validLayout?.floors[i],i===Math.min(floor,storeys.length-1))
        if(last)group=plate
      })
    }else if(b.type!=='house'&&polys[0]){
      const heights=levels(b)
      if(plan){
        const poly=floorOutline(b,polys[0],floor)
        face(poly,0,b.id===selected&&editFloor?{...material,line:editingBlue}:material,[],b.id,0,undefined,true,true,[],undefined,undefined,false,validLayout?.floors[floor],true)
        group=poly
      }else{
        heights.forEach((top,i)=>{
          const poly=floorOutline(b,polys[0],i)
          const last=i===heights.length-1
          const here=endInset(b,i),above=endInset(b,i+1)
          const cap=last||here.some((dist,j)=>dist!==above[j])
          const colour=i>0&&i===editFloor&&b.id===selected&&editFrontage
            ?{...material,walls:['#7fa9c0','#5b889f','#6b98ae','#91b4c6'],floor:'#dceaf0'}
            :material
          face(poly,b.level+top,colour,[],b.id,b.level+(heights[i-1]??0),i,cap,last)
          if(last)group=poly
        })
      }
    }else{
      polys.forEach(poly=>face(poly,z,material,levels(b,project.houseHeights),b.id,plan?0:b.level))
    }
    if(group.length&&(b.id===selected||(plan&&layers.labels))){
      let center=group.reduce(([x,y],p)=>[x+p[0]/group.length,y+p[1]/group.length] as Point,[0,0] as Point)
      if(!plan&&editFrontage&&b.id===selected&&b.type!=='house'){
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
  solidSurfaces.forEach((surface,index)=>{
    ctx.save()
    if(surface.id)ctx.globalAlpha=opacity
    if(!plan){
      const [left,top,right,bottom]=surface.bounds
      // Clip only where another face projects in front of this one.
      solidSurfaces.forEach((other,i)=>{
        if(i===index||(!surface.id&&other.id&&opacity<1))return
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
    const [x,y]=heightHandle,colour=editingBlue
    dot(heightHandle,colour,8)
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
      const elevation=plan?0:block.level+(scene.showApartments?heights[editFloor]:(heights[editFloor-1]+heights[editFloor])/2)
      const lastFront=poly.length/2-1
      const front=poly.slice(0,lastFront+1).map(p=>xy(p,elevation))
      path(front,undefined,editingBlue,2,false)
      setbackHandles.push(front[0],front[lastFront])
      setbackHandles.forEach(p=>dot(p,editingBlue,6.5))
    }
  }
  const handles=block&&(!editFloor||block.type==='house')
    ?block.line.map(p=>xy(p,plan?0:block.level))
    :editBoundary?boundary.map(p=>xy(p)):[]
  if(block)path(handles,undefined,editingBlue,2,false)
  handles.forEach(p=>dot(p,block?editingBlue:'#aa5049',5.5))
  if(draft.length){
    const colour=scene.drawBuilding?editingBlue:'#a14a42'
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
  function dot(p:Point,colour:string,r:number){
    ctx.beginPath();ctx.arc(...p,r,0,2*Math.PI);ctx.fillStyle='#fffdf5';ctx.fill()
    ctx.strokeStyle=colour;ctx.lineWidth=2;ctx.stroke()
  }
  return {pick:(point:Point)=>pickSurface(solidSurfaces,point),handles,
    pickContext:(point:Point)=>visibleSurface(solidSurfaces,point)?.contextIndex,
    pickGhost:(point:Point)=>visibleSurface(surfaces.filter(surface=>
      surface.contextIndex!==undefined&&scene.ghosted.has(surface.contextIndex)),point)?.contextIndex,
    setbackHandles,pickFloor:(point:Point)=>visibleSurface(solidSurfaces,point)?.floor??0,
    heightAt:(point:Point)=>!!heightHandle&&(length(point,heightHandle)<12||pickSurface(solidSurfaces,point,true)===selected)}
}
