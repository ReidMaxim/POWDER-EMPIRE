import type { Heightmap } from '../terrain.ts';

type Vertex = { x: number; z: number; r: number; g: number; b: number };

function clip(vertices: Vertex[], nx: number, nz: number, limit: number) {
  const result: Vertex[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[(i + vertices.length - 1) % vertices.length], b = vertices[i];
    const da = limit - nx * a.x - nz * a.z, db = limit - nx * b.x - nz * b.z;
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da-db);
      result.push({ x: a.x + (b.x-a.x)*t, z: a.z + (b.z-a.z)*t,
        r: a.r + (b.r-a.r)*t, g: a.g + (b.g-a.g)*t, b: a.b + (b.b-a.b)*t });
    }
    if (db >= 0) result.push(b);
  }
  return result;
}

/** Subdivide the corridor at the exact edges used by the terrain mesh. */
export function conformSurface(map: Heightmap, source: number[], color: number[], triangles: number[], lift: number) {
  const positions: number[] = [], colors: number[] = [];
  const size = map.span / (map.size - 1), half = map.span/2;
  const index = (n: number) => Math.min(map.size-2,Math.max(0,Math.floor((n+half)/size)));
  const vertex = (i: number): Vertex => {
    const at = i*3;
    return {x:source[at],z:source[at+2],r:color[at],g:color[at+1],b:color[at+2]};
  };
  const emit = (polygon: Vertex[]) => {
    for (let i=1;i<polygon.length-1;i++) {
      const a=polygon[0],b=polygon[i],c=polygon[i+1];
      if (Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x)) < 1e-7) continue;
      for (const point of [a,b,c]) {
        positions.push(point.x,map.sample(point.x,point.z).elevation+lift,point.z);
        colors.push(point.r,point.g,point.b);
      }
    }
  };
  for (let i=0;i<triangles.length;i+=3) {
    const a=vertex(triangles[i]), b=vertex(triangles[i+1]), c=vertex(triangles[i+2]);
    for(let x=index(Math.min(a.x,b.x,c.x)); x<=index(Math.max(a.x,b.x,c.x)); x++){
      const left=x*size-half;
      const column=clip(clip([a,b,c],-1,0,-left),1,0,left+size);
      if (column.length<3) continue;
      for(let z=index(Math.min(a.z,b.z,c.z)); z<=index(Math.max(a.z,b.z,c.z)); z++){
        const top=z*size-half;
        const cell=clip(clip(column,0,-1,-top),0,1,top+size);
        if(cell.length<3) continue;
        const diagonal=left+top+size;
        emit(clip(cell,1,1,diagonal));
        emit(clip(cell,-1,-1,-diagonal));
      }
    }
  }
  return {positions,colors};
}
