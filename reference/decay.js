function rng(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
function gauss(r){let u=0,v=0;while(!u)u=r();while(!v)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function electorate(V,C,F,spread,seed){const r=rng(seed);const fc=[...Array(F)].map((_,i)=>(i+0.5)/F);const fw=fc.map(()=>0.5+r());const fs=fw.reduce((a,b)=>a+b,0);
const pickF=()=>{let x=r()*fs;for(let i=0;i<F;i++){x-=fw[i];if(x<=0)return i;}return F-1;};
const cp=[...Array(C)].map(()=>fc[pickF()]+gauss(r)*0.06);const B=[];
for(let v=0;v<V;v++){const p=fc[pickF()]+gauss(r)*0.08;const u=cp.map((c,i)=>[i,-Math.abs(p-c)+gauss(r)*spread]);u.sort((a,b)=>b[1]-a[1]);B.push(u.map(x=>x[0]));}return B;}
// returns cross[d]: total vote weight that had to travel to rank d+1 or deeper
function decay(B,C,S){const V=B.length,q=Math.floor(V/(S+1))+1;const st=new Array(C).fill(0);const pile=[...Array(C)].map(()=>[]);const cross=new Array(C).fill(0);
const nx=(b,f)=>{const p=B[b];for(let i=f+1;i<p.length;i++)if(st[p[i]]===0)return i;return -1;};
B.forEach((p,b)=>{pile[p[0]].push({b,w:1,i:0});});cross[0]=V;
const tot=c=>{let s=0;for(const x of pile[c])s+=x.w;return s;};
const place=(b,w,f)=>{const j=nx(b,f);if(j<0)return;for(let d=f+1;d<=j;d++)cross[d]+=w;pile[B[b][j]].push({b,w,i:j});};
const el=[],qu=[];let g=0;
while(el.length<S&&g++<2000){const hop=[];for(let c=0;c<C;c++)if(st[c]===0)hop.push(c);const T={};hop.forEach(c=>T[c]=tot(c));
const reach=hop.filter(c=>T[c]>=q-1e-9).sort((a,b)=>T[b]-T[a]);if(reach.length)reach.forEach(c=>{st[c]=1;el.push(c);qu.push([c,T[c]]);});
if(el.length>=S)break;
if(qu.length){const [c,Tc]=qu.shift();const s=Tc-q;if(s>1e-9){const f=s/Tc,old=pile[c];pile[c]=[];for(const x of old){const mv=x.w*f;pile[c].push({b:x.b,w:x.w-mv,i:x.i});place(x.b,mv,x.i);}}continue;}
if(hop.length<=S-el.length){hop.forEach(c=>{st[c]=1;el.push(c);});break;}
let lo=hop[0];for(const c of hop)if(T[c]<T[lo])lo=c;st[lo]=2;const old=pile[lo];pile[lo]=[];for(const x of old)place(x.b,x.w,x.i);}
return cross.map(x=>100*x/V);}
if(typeof module!=="undefined")module.exports={electorate,decay};
