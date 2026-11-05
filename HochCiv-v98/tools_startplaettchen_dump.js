const fs=require('fs'), vm=require('vm'), dir='.';
for (const f of ['js/data.js','js/hex.js','js/tiles.js'])
  vm.runInThisContext(fs.readFileSync(dir+'/'+f,'utf8'));
const cellOf={}; TRI_IJK.forEach((t,n)=>cellOf[t.join(',')]=n);
const midFood = (tile) => TRI_MIDDLE.map(n=>{
  const face=tileTerrain(tile), [i,j,k]=TRI_IJK[n];
  const nbs=[[i+1,j-1,k],[i-1,j+1,k],[i+1,j,k-1],[i-1,j,k+1],[i,j+1,k-1],[i,j-1,k+1]];
  let food=-1, coins=1;
  nbs.forEach(t=>{ const y=TERRAIN[face[cellOf[t.join(',')]]].yield; food+=y[1]; coins+=y[2]; });
  return food+Math.floor(coins/2);
});
const out={
  version: APP_VERSION,
  terrain: Object.values(TERRAIN).filter(t=>!t.off).map(t=>({k:t.key,n:t.name,y:t.yield,c:t.color,land:t.land})),
  middle: TRI_MIDDLE.map(n=>TRI_IJK[n]),
  tiles: TILE_POOL.map((t,i)=>({
    i, n:t.n, rows:t.a,
    cells: TRI_IJK.map((ijk,n)=>({ijk, t: tileTerrain(t)[n], mid: TRI_MIDDLE.includes(n)})),
    food: midFood(t),
    land: tileTerrain(t).filter(c=>TERRAIN[c].land).length,
  })),
  shapes: [2,3,4].map(n=>{
    const sh=TILE_SHAPES[n];
    const all=sh.slots.flatMap(slotCells).concat(sh.holes).map(cubeToRC);
    const r0=Math.min(...all.map(x=>x[0])), c0=Math.min(...all.map(x=>x[1]));
    return { n, name: sh.name, seats: sh.seatSets[0],
      seatSets: sh.seatSets,
      slots: sh.slots.map((sl,si)=>slotCells(sl).map(cu=>{const [r,c]=cubeToRC(cu);return [r-r0,c-c0];})),
      holes: sh.holes.map(h=>{const [r,c]=cubeToRC(h);return [r-r0,c-c0];}) };
  }),
};
fs.writeFileSync('tiles.json', JSON.stringify(out,null,1));
console.log('tiles.json', out.tiles.length, 'Plättchen,', out.shapes.length, 'Formen');
