import type {Project} from './model.ts'

export const defaultAddress={
  street:'321 Bradford Street',
  locality:'Birmingham B5 6ET',
  // Postcode reference point for B5 6ET.
  anchor:{lat:52.4749,lon:-1.889077}
}

export const legacySample:Project = {
  boundary:[[-62,-29],[-9,-45],[59,-34],[78,4],[46,37],[-18,44],[-64,20]],
  blocks:[
    {id:'a',name:'Block A',type:'apartment',line:[[-45,-16],[4,-28]],depth:18,floors:5,ground:4.5,upper:3,level:0,houseType:'3B5P'},
    {id:'b',name:'Block B',type:'apartment',line:[[25,-23],[55,-12]],depth:18,floors:4,ground:4.5,upper:3,level:0,houseType:'3B5P'},
    {id:'c',name:'Block C',type:'house',line:[[-34,17],[13,23]],depth:10,floors:3,ground:3,upper:3,level:0,houseType:'3B5P'}
  ],
  targets:{'3B5P':99,'3B6P':108}, colours:{'3B5P':'#d8b284','3B6P':'#cf937f'}
}

export function blankProject():Project {
  return {anchor:{...defaultAddress.anchor},boundary:[],blocks:[],
    targets:{...legacySample.targets},colours:{...legacySample.colours}}
}

export function isDefaultAddress(anchor:Project['anchor']) {
  return anchor?.lat===defaultAddress.anchor.lat&&anchor.lon===defaultAddress.anchor.lon
}

export function restoreProject(saved:string|null):Project {
  try{
    const value=JSON.parse(saved??'null')
    if(value&&Array.isArray(value.blocks)&&Array.isArray(value.boundary)&&value.targets&&value.colours){
      // Only replace the untouched demo. Geometry or settings edits belong to the user.
      if(JSON.stringify(value)!==JSON.stringify(legacySample))return value
    }
  }catch{}
  return blankProject()
}
