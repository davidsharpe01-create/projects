// England NDSS, Table 1, published 27 March 2015 and amended 19 May 2016.
// https://www.gov.uk/government/publications/technical-housing-standards-nationally-described-space-standard/technical-housing-standards-nationally-described-space-standard
export const ndssVersion='England NDSS · May 2016'
export const dwellingTypes=['1B1P','1B2P','2B3P','2B4P','3B5P','3B6P'] as const
export type DwellingType=typeof dwellingTypes[number]
export const ndss={
  '1B1P':{beds:1,people:1,areas:[39,null,null],showerOnly:37,storage:1,colour:'#ffd34e'},
  '1B2P':{beds:1,people:2,areas:[50,58,null],storage:1.5,colour:'#ff8a59'},
  '2B3P':{beds:2,people:3,areas:[61,70,null],storage:2,colour:'#8ed85c'},
  '2B4P':{beds:2,people:4,areas:[70,79,null],storage:2,colour:'#36c8bc'},
  '3B5P':{beds:3,people:5,areas:[86,93,99],storage:2.5,colour:'#698cf5'},
  '3B6P':{beds:3,people:6,areas:[95,102,108],storage:2.5,colour:'#da79d8'}
} as const
export const defaultMix:Record<DwellingType,number>={'1B1P':5,'1B2P':35,'2B3P':20,'2B4P':25,'3B5P':10,'3B6P':5}
export const defaultTargets:Record<DwellingType,number>={'1B1P':39,'1B2P':55,'2B3P':65,'2B4P':75,'3B5P':99,'3B6P':108}

export const ndssCeiling={clearHeight:2.3,areaFraction:.75}
