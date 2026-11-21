import {apartmentLayout} from './apartment'
import {area,blockStats,blockTypes,floors,type Project} from './model'
import {dwellingTypes} from './ndss'
import {Icon} from './icons'

const number=new Intl.NumberFormat('en-GB',{maximumFractionDigits:1})
const format=(value:number|null)=>value===null?'—':number.format(value)

type Measures={gea:number;gia:number|null;units:number;unitArea:number;commercial:number;communal:number;core:number;corridor:number}
const empty:Measures={gea:0,gia:0,units:0,unitArea:0,commercial:0,communal:0,core:0,corridor:0}
function sum(rows:Measures[]):Measures {
  return rows.reduce((a,b)=>({
    gea:a.gea+b.gea,gia:a.gia===null||b.gia===null?null:a.gia+b.gia,
    units:a.units+b.units,unitArea:a.unitArea+b.unitArea,commercial:a.commercial+b.commercial,
    communal:a.communal+b.communal,core:a.core+b.core,corridor:a.corridor+b.corridor
  }),empty)
}

export function scheduleBlocks(project:Project){
  return project.blocks.map(block=>{
    const stats=blockStats(block,project)
    const layout=apartmentLayout(block,project)
    const byLevel=stats.floorAreas.map((measure,i):Measures=>{
      const plate=layout?.ok?layout.floors[i]:undefined
      return {...measure,
        units:plate?.units.length??(i===0?stats.houses:0),
        unitArea:plate?.units.reduce((total,unit)=>total+unit.area,0)??stats.usable/floors(block),
        commercial:plate?.uses.filter(use=>use.kind==='commercial').reduce((total,use)=>total+area(use.outline),0)??0,
        communal:plate?.uses.filter(use=>use.kind==='communal').reduce((total,use)=>total+area(use.outline),0)??0,
        core:plate?.coreArea??0,corridor:plate?.corridorArea??0
      }
    })
    return {block,byLevel,total:sum(byLevel)}
  })
}

const columns:{key:keyof Measures;label:string;unit:string}[]=[
  {key:'gea',label:'GEA',unit:'m²'},{key:'gia',label:'GIA',unit:'m²'},
  {key:'unitArea',label:'Usable home area',unit:'m²'},{key:'commercial',label:'Commercial',unit:'m²'},
  {key:'communal',label:'Communal',unit:'m²'},{key:'core',label:'Cores',unit:'m²'},
  {key:'corridor',label:'Corridors',unit:'m²'},{key:'units',label:'Homes',unit:'no.'}
]

function ScheduleTable({label,heading,rows}:{label:string;heading:string;rows:{name:string;measures:Measures}[]}){
  const total=sum(rows.map(row=>row.measures))
  const shown=columns.filter(({key})=>key==='gea'||key==='gia'||total[key]!==0)
  const cells=(measures:Measures)=>shown.map(({key})=><td key={key}>{format(measures[key])}</td>)
  return <div className="schedule-table-wrap"><table aria-label={label}>
    <thead><tr><th scope="col">{heading}</th>{shown.map(({key,label,unit})=><th scope="col" key={key}>{label}<small>{unit}</small></th>)}</tr></thead>
    <tbody>{rows.map(({name,measures},i)=><tr key={i}><th scope="row">{name}</th>{cells(measures)}</tr>)}
      <tr className="schedule-total"><th scope="row">Total</th>{cells(total)}</tr>
    </tbody>
  </table></div>
}
const levelName=(i:number)=>i===0?'Ground':`Level ${i}`

export function SchedulePage({name,project,totals,onBack}:{name:string;project:Project;totals:ReturnType<typeof import('./model').development>;onBack:()=>void}){
  const blocks=scheduleBlocks(project)
  const levels=Array.from({length:Math.max(0,...blocks.map(block=>block.byLevel.length))},(_,i)=>({
    name:levelName(i),measures:sum(blocks.flatMap(block=>block.byLevel[i]?[block.byLevel[i]]:[]))
  }))
  const mix=dwellingTypes.filter(type=>totals.mix[type]>0)
  function print(){
    const title=document.title
    document.title=`${name} – Development schedule`
    try{window.print()}finally{document.title=title}
  }
  return <main className="schedule-page">
    <nav className="schedule-actions" aria-label="Schedule actions">
      <button className="back-to-sites" onClick={onBack}><Icon name="right"/>Back to model</button>
      <button className="schedule-print" onClick={print}><Icon name="download"/>Export PDF</button>
    </nav>
    <header className="schedule-heading"><p>{name}</p><h1>Development schedule</h1></header>
    <dl className="schedule-metrics">
      <div><dt>Homes</dt><dd>{format(totals.homes)}</dd></div>
      <div><dt>Density</dt><dd>{totals.site?format(totals.density):'—'} <small>dph</small></dd></div>
      <div><dt>Gross internal area</dt><dd>{format(totals.gia)} <small>m²</small></dd></div>
      <div><dt>Site area</dt><dd>{totals.site?format(totals.site):'—'} <small>m²</small></dd></div>
    </dl>
    {!!totals.estimatedApartments&&<p className="schedule-estimate">Includes {format(totals.estimatedApartments)} estimated apartments.</p>}
    {!blocks.length?<p>Add buildings to populate the schedule.</p>:<>
      <section><h2>Area by use</h2><ScheduleTable label="Area by use" heading="Use" rows={
        (Object.keys(blockTypes) as (keyof typeof blockTypes)[]).flatMap(type=>{
          const items=blocks.filter(({block})=>block.type===type)
          return items.length?[{name:blockTypes[type].legend,measures:sum(items.map(item=>item.total))}]:[]
        })
      }/></section>
      <section><h2>Combined floor totals</h2><ScheduleTable label="Combined floor totals" heading="Level" rows={levels}/></section>
      {mix.length>0&&<section><h2>Dwelling mix</h2><div className="schedule-table-wrap"><table aria-label="Dwelling mix">
        <thead><tr><th scope="col">Type</th><th scope="col">Apartments</th><th scope="col">Houses</th><th scope="col">Homes</th><th scope="col">Share</th></tr></thead>
        <tbody>{mix.map(type=><tr key={type}><th scope="row">{type}</th><td>{format(totals.apartmentMix[type])}</td>
          <td>{format(totals.mix[type]-totals.apartmentMix[type])}</td><td>{format(totals.mix[type])}</td>
          <td>{format(totals.mix[type]*100/(totals.generatedApartments+totals.houses))}%</td></tr>)}</tbody>
      </table></div></section>}
      <section><h2>Building schedules</h2>
        {blocks.map(({block,byLevel})=><section className="schedule-block" key={block.id}>
          <h3>{block.name} <small>{blockTypes[block.type].label}</small></h3>
          <ScheduleTable label={block.name} heading="Level" rows={byLevel.map((measures,i)=>({name:levelName(i),measures}))}/>
        </section>)}
      </section>
    </>}
  </main>
}
