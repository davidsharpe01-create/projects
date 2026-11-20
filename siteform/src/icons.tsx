const icons:Record<string,string>={
  cube:'M12 2 3 7v10l9 5 9-5V7l-9-5ZM3 7l9 5 9-5m-9 5v10',
  mouse:'m5 3 15 9-7 1-3 7L5 3Z',
  boundary:'M6 4h12M4 6v12m16-12v12M6 20h12M2 2h4v4H2zm16 0h4v4h-4ZM2 18h4v4H2zm16 0h4v4h-4z',
  house:'m3 11 9-7 9 7m-2-2v11H5V9m5 11v-6h4v6',
  building:'M5 21V3h14v18M3 21h18M9 7h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1m-4 6v-3h2v3',
  move:'M12 3v18M3 12h18m-12-6 3-3 3 3m-6 12 3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3',
  rotate:'M20 10a8 8 0 1 0-2 8m2-14v6h-6',
  ruler:'m3 15 12-12 6 6L9 21l-6-6Zm4-4 3 3m1-7 3 3m1-7 3 3',
  undo:'M9 6l-5 5 5 5m-5-5h10a5 5 0 0 1 5 5v2',
  redo:'m15 6 5 5-5 5m5-5H10a5 5 0 0 0-5 5v2',
  layers:'m3 7 9-4 9 4-9 4-9-4Zm0 5 9 4 9-4M3 17l9 4 9-4',
  download:'M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4',
  chevron:'m6 9 6 6 6-6',right:'m9 6 6 6-6 6',
  check:'m5 12 4 4L19 6',
  chart:'M4 4v16h16M8 15v-3m5 3V8m5 7V5',
  warning:'M10.3 4 2.5 18a1 1 0 0 0 .9 1.5h17.2a1 1 0 0 0 .9-1.5L13.7 4a2 2 0 0 0-3.4 0ZM12 9v4m0 3v.2',
  plus:'M12 5v14M5 12h14',minus:'M5 12h14',
  target:'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6m-3-12v6m-3-3h6',
  plan:'M4 4h16v16H4zM4 12h16m-8-8v8',
  location:'M12 21s7-5 7-11a7 7 0 0 0-14 0c0 6 7 11 7 11zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  settings:'M4 6h16M4 12h16M4 18h16M8 4v4m8 2v4m-7 2v4',
  close:'m6 6 12 12M18 6 6 18',
  copy:'M8 8h12v12H8zM16 4H4v12',
  trash:'M4 6h16m-10 0V3h4v3M6 6l1 15h10l1-15m-8-11v6m4-6v6',
  help:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm-3-13a3 3 0 1 1 4 3c-1 .4-1 1-1 2m0 3v.1'
}
export function Icon({name,size=18}:{name:string;size?:number}){
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[name]}/></svg>
}
