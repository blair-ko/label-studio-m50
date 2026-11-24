import {fontStacks,paths,shapes,symbols} from './assets.mjs?v=20261125-5';
import {komameIcons} from './komame-icons.mjs';
import {DOTS_PER_MM,PRINT_GUIDE_HEIGHT_MM,bitmapFromImage} from './printer.mjs?v=20261125-5';

export const round = value => Number(value.toFixed(2));
export const clamp = (value,min,max) => Math.min(max,Math.max(min,value));
export const DEFAULT_CORNER_RADIUS = 2;
export const maxCornerRadius = (length,height) => Math.floor(Math.round(Math.min(length,height)*100)/2)/100;
const legacyIconStyle = {viewBox:24,stroke:1.8,previewStroke:1.65,ink:'#161916'};
const komameIconStyle = {viewBox:48,stroke:3.2,previewStroke:3.2,ink:'#000'};
const getKomameIcon = key => Object.hasOwn(komameIcons,key) ? komameIcons[key] : undefined;
const iconStyle = key => getKomameIcon(key) ? komameIconStyle : legacyIconStyle;
export const iconName = key => getKomameIcon(key)?.label ??
  (Object.hasOwn(symbols,key) ? symbols[key].split(' ')[0] : undefined);
export const ICON_STROKE_MIN = .04;
export const ICON_STROKE_MAX = 5;
export function iconStrokeMm(o) {
  const {stroke,viewBox}=iconStyle(o.key);
  return o.iconStroke ?? round(stroke*Math.min(o.w,o.h)/viewBox);
}
const num = (value,fallback,min=-Infinity,max=Infinity) => Number.isFinite(value) ? round(clamp(value,min,max)) : fallback;
export const esc = value => String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
const id = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
export const allowedImage = /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i;
const allowedTag = new Set(['svg','g','path','polygon','polyline','line','circle','ellipse','rect']);
const allowedAttr = new Set(['viewBox','d','points','transform','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','fill-rule','clip-rule','opacity','fill-opacity','stroke-opacity','x','y','width','height','cx','cy','r','rx','ry','x1','x2','y1','y2','preserveAspectRatio','vector-effect']);

export function safeVector(xml) {
  const root = new DOMParser().parseFromString(xml,'image/svg+xml').documentElement;
  if (root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg' || root.querySelector('parsererror')) {
    throw Error('請選擇有效的 SVG 檔。');
  }
  const viewBox = root.getAttribute('viewBox') || ('0 0 '+(parseFloat(root.getAttribute('width'))||24)+' '+(parseFloat(root.getAttribute('height'))||24));
  const dimensions = viewBox.trim().split(/[ ,]+/).map(Number);
  if (dimensions.length !== 4 || dimensions.some(n=>!Number.isFinite(n)) || dimensions[2] <= 0 || dimensions[3] <= 0) throw Error('SVG 的尺寸無效。');
  let count = 0;
  function clean(node) {
    if (node.nodeType !== Node.ELEMENT_NODE || !allowedTag.has(node.localName) || ++count > 1200) return '';
    const attrs = [...node.attributes].filter(a=>allowedAttr.has(a.name) && !/url\s*\(|[\\;]/i.test(a.value))
      .map(a=>` ${a.name}="${esc(a.value)}"`).join('');
    return `<${node.localName}${attrs}>${[...node.children].map(clean).join('')}</${node.localName}>`;
  }
  const vector = [...root.children].map(clean).join('');
  if (!vector) throw Error('這個 SVG 沒有可匯入的基本向量圖形。');
  const inheritance=[...root.attributes].filter(a=>['fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','fill-rule','opacity'].includes(a.name) && !/url\s*\(|[\\;]/i.test(a.value))
    .map(a=>` ${a.name}="${esc(a.value)}"`).join('');
  return {viewBox:dimensions.join(' '),vector:`<g${inheritance}>${vector}</g>`,ratio:dimensions[2]/dimensions[3]};
}

export function normalize(input) {
  if (!input || !Array.isArray(input.items) || !Number.isFinite(input.length) || !Number.isFinite(input.height)) throw Error('設計檔缺少有效的標籤尺寸或圖層。');
  const length = num(input.length,40,10,100);
  const height = num(input.height,14,5,14);
  const ids = new Set();
  return {
    title: String(input.title ?? '未命名標籤').slice(0,70), length, height,
    cornerRadius: num(input.cornerRadius,DEFAULT_CORNER_RADIUS,0,maxCornerRadius(length,height)),
    items: input.items.slice(0,120).flatMap(o=>{
      if (!o || !['shape','icon','text','image','vector'].includes(o.type)) return [];
      const type=o.type;
      if ((type==='shape' && !Object.hasOwn(shapes,o.key)) || (type==='icon' && !iconName(o.key))) return [];
      let itemId=typeof o.id === 'string' && /^[a-z0-9-]{1,70}$/i.test(o.id) && !ids.has(o.id) ? o.id : id();
      ids.add(itemId);
      const item={id:itemId,type,key:o.key,w:num(o.w,5,.5,100),h:num(o.h,5,.5,60),
        x:num(o.x,0),y:num(o.y,0),rotation:num(o.rotation,0,-180,180),
        fill:o.fill === true,stroke:num(o.stroke,.25,.08,2),vertical:o.vertical===true,
        label:typeof o.label==='string'?o.label.slice(0,70):undefined};
      if (type==='text') Object.assign(item,{text:String(o.text ?? '新增文字').slice(0,500),size:num(o.size,2.8,.5,20),
        font:Object.hasOwn(fontStacks,o.font)?o.font:'sans',bold:o.bold===true,italic:o.italic===true,
        align:['left','center','right'].includes(o.align)?o.align:'left'});
      if (type==='icon' && Number.isFinite(o.iconStroke)) {
        item.iconStroke=num(o.iconStroke,undefined,ICON_STROKE_MIN,ICON_STROKE_MAX);
      }
      if (type==='image') {
        if (typeof o.src!=='string' || o.src.length > 1400000 || !allowedImage.test(o.src)) return [];
        item.src=o.src;
      }
      if (type==='vector') {
        if (typeof o.vector!=='string' || o.vector.length > 170000) return [];
        const safe=safeVector(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${esc(o.viewBox)}">${o.vector}</svg>`);
        Object.assign(item,{vector:safe.vector,viewBox:safe.viewBox});
      }
      return [item];
    }),
  };
}

export function iconSVG(key) {
  const icon=getKomameIcon(key);
  const {viewBox,previewStroke}=iconStyle(key);
  return `<svg viewBox="0 0 ${viewBox} ${viewBox}" aria-hidden="true" fill="none" stroke="${icon?'#000':'currentColor'}" stroke-width="${previewStroke}" stroke-linecap="round" stroke-linejoin="round"><path d="${icon?.path ?? paths[key]}"/></svg>`;
}

const measure = document.createElement('canvas').getContext('2d');
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('zh-Hant',{granularity:'grapheme'}) : null;
const graphemes = text => segmenter ? Array.from(segmenter.segment(text),part=>part.segment) : [...text];
export const usesRoundedFont = doc => doc.items.some(o=>o.type==='text' && o.font==='rounded' && o.text.trim());

let roundedFace;
let roundedFontLoad;
export function loadRoundedFont() {
  roundedFontLoad ??= Promise.all([
    import('./font-assets/opentype.mjs'),
    fetch(new URL('./font-assets/Huninn-Regular.ttf',import.meta.url)).then(response=>{
      if (!response.ok) throw Error('Font download failed');
      return response.arrayBuffer();
    }),
  ]).then(([{parse},fontBytes])=>{
    roundedFace=parse(fontBytes);
  }).catch(error=>{
    throw Error('無法載入粉圓字型，請重新載入頁面後再試。',{cause:error});
  });
  return roundedFontLoad;
}

function wrappedLines(text, width, widthOf) {
  const lines=[];
  for (const paragraph of text.split('\n')) {
    const tokens=paragraph.match(/\s+|[A-Za-z0-9_.@&/-]+|[^\s]/gu) ?? [];
    let line='';
    for (const token of tokens) {
      if (line && widthOf(line+token)>width) {
        lines.push(line.trimEnd());
        line='';
      }
      if (!line && /^\s+$/u.test(token)) continue;
      if (widthOf(token)>width) {
        for (const piece of graphemes(token)) {
          if (line && widthOf(line+piece)>width) { lines.push(line); line=''; }
          line+=piece;
        }
      } else line+=token;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

function layoutRoundedLine(line,size,measureFallback,draw=false) {
  const unit=size/roundedFace.unitsPerEm;
  let width=0, missing='', previous;
  const paths=[], fallback=[];
  function flushFallback() {
    if (!missing) return;
    if (draw) fallback.push(`<text x="${width}">${esc(missing)}</text>`);
    width+=measureFallback(missing);
    missing='';
  }
  for (const letter of graphemes(line)) {
    const glyph=[...letter].length===1 ? roundedFace.charToGlyph(letter) : null;
    if (!glyph?.index) {
      missing+=letter;
      previous=undefined;
      continue;
    }
    flushFallback();
    if (previous) width+=roundedFace.getKerningValue(previous,glyph)*unit;
    if (draw) paths.push(glyph.getPath(width,0,size).toPathData(3));
    width+=glyph.advanceWidth*unit;
    previous=glyph;
  }
  flushFallback();
  return {width,path:paths.join(''),fallback:fallback.join('')};
}

export function graphic(o) {
  const {w,h}=o;
  if (o.type==='text') {
    const anchor={left:'start',center:'middle',right:'end'}[o.align];
    const x={left:0,center:w/2,right:w}[o.align];
    const family=fontStacks[o.font];
    const outlined=o.font==='rounded' && roundedFace;
    measure.font=`${o.italic&&!outlined?'italic':'normal'} ${o.bold?700:400} ${o.size*12}px ${family}`;
    const systemWidth=text=>measure.measureText(text).width/12;
    const lines=wrappedLines(o.text,w,outlined ? text=>layoutRoundedLine(text,o.size,systemWidth).width : systemWidth);
    if (outlined) {
      const bold=o.bold ? ` stroke="#161916" stroke-width="${o.size*.05}" stroke-linejoin="round"` : '';
      const rows=lines.map((line,i)=>{
        const baseline=o.size*(.87+1.16*i);
        if (baseline>h+.05) return '';
        const {width,path,fallback}=layoutRoundedLine(line,o.size,systemWidth,true);
        const left=o.align==='center' ? x-width/2 : o.align==='right' ? x-width : x;
        return `<g transform="translate(${left} ${baseline})${o.italic?' skewX(-12)':''}">${path?`<path d="${path}"${bold}/>`:''}${fallback}</g>`;
      }).join('');
      return `<g data-font-outline="huninn" fill="#161916" font-family="${esc(family)}" font-size="${o.size}" font-weight="${o.bold?700:400}" xml:space="preserve"><title>${esc(o.text)}</title>${rows}</g>`;
    }
    const rendered=lines.map((line,i)=>{
      const baseline=o.size*(.87+1.16*i);
      return baseline<=h+.05 ? `<tspan x="${x}" y="${baseline}">${esc(line)}</tspan>` : '';
    }).join('');
    return `<text fill="#161916" font-family="${esc(family)}" font-size="${o.size}" font-weight="${o.bold?700:400}" font-style="${o.italic?'italic':'normal'}" text-anchor="${anchor}" xml:space="preserve">${rendered}</text>`;
  }
  if (o.type==='image') return `<image width="${w}" height="${h}" href="${o.src}" preserveAspectRatio="xMidYMid meet"/>`;
  if (o.type==='vector') return `<svg width="${w}" height="${h}" viewBox="${o.viewBox}">${o.vector}</svg>`;
  if (o.type==='icon') {
    const {viewBox,stroke:defaultStroke,ink}=iconStyle(o.key);
    const stroke=o.iconStroke===undefined ? defaultStroke : o.iconStroke*viewBox/Math.min(w,h);
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${viewBox} ${viewBox}" overflow="visible" fill="none" stroke="${ink}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"><path d="${getKomameIcon(o.key)?.path ?? paths[o.key]}"/></svg>`;
  }
  const [cx,cy]=[w/2,h/2];
  const fill=o.fill?'#161916':'none';
  let body;
  switch(o.key) {
    case 'rect': case 'rounded': body=`<rect width="${w}" height="${h}" rx="${o.key==='rounded'?Math.min(1.4,h*.2,w*.2):0}"/>`; break;
    case 'ellipse': body=`<ellipse cx="${cx}" cy="${cy}" rx="${cx}" ry="${cy}"/>`; break;
    case 'line': body=o.vertical?`<path d="M${cx} 0v${h}"/>`:`<path d="M0 ${cy}h${w}"/>`; break;
    case 'triangle': body=`<polygon points="${cx},0 ${w},${h} 0,${h}"/>`; break;
    case 'diamond': body=`<polygon points="${cx},0 ${w},${cy} ${cx},${h} 0,${cy}"/>`; break;
    case 'hexagon': body=`<polygon points="${w*.25},0 ${w*.75},0 ${w},${cy} ${w*.75},${h} ${w*.25},${h} 0,${cy}"/>`; break;
    case 'burst': {
      const points=Array.from({length:10},(_,i)=>{
        const angle=i*Math.PI/5-Math.PI/2, r=i%2===0?1:.44;
        return `${cx+Math.cos(angle)*r*cx},${cy+Math.sin(angle)*r*cy}`;
      }).join(' ');
      body=`<polygon points="${points}"/>`; break;
    }
  }
  return `<g fill="${fill}" stroke="#161916" stroke-width="${o.stroke}" stroke-linecap="round" stroke-linejoin="round">${body}</g>`;
}

export const transform = o => `translate(${o.x} ${o.y}) rotate(${o.rotation} ${o.w/2} ${o.h/2})`;
const paperOutline = doc => `width="${doc.length}" height="${doc.height}" rx="${doc.cornerRadius}"`;
export function printArea(doc) {
  const height=Math.min(doc.height,PRINT_GUIDE_HEIGHT_MM);
  return {y:(doc.height-height)/2,height};
}
export function clipPaperArtwork(doc, id, artwork, area) {
  const outline=`<clipPath id="${id}"><rect ${paperOutline(doc)}/></clipPath>`;
  if (!area) return `<defs>${outline}</defs><g clip-path="url(#${id})">${artwork}</g>`;

  const printId=`${id}-printable`;
  const printable=`<clipPath id="${printId}"><rect y="${area.y}" width="${doc.length}" height="${area.height}"/></clipPath>`;
  // WebKit can trim strokes to the artwork's geometry bounds when a clipPath references another clipPath.
  return `<defs>${outline}${printable}</defs><g clip-path="url(#${id})"><g clip-path="url(#${printId})">${artwork}</g></g>`;
}
export function paperArtwork(doc, clipId, area) {
  const artwork = doc.items.map(o=>`<g transform="${transform(o)}">${graphic(o)}</g>`).join('');
  return `<rect ${paperOutline(doc)} fill="white"/>${clipPaperArtwork(doc,clipId,artwork,area)}`;
}
export async function svgFile(doc, area) {
  if (usesRoundedFont(doc)) await loadRoundedFont();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${doc.length}mm" height="${doc.height}mm" viewBox="0 0 ${doc.length} ${doc.height}" overflow="hidden">${paperArtwork(doc,'label-cut',area)}</svg>`;
}

export async function raster(doc, area) {
  await document.fonts.ready;
  const width=Math.round(doc.length*DOTS_PER_MM), height=Math.round(doc.height*DOTS_PER_MM);
  const url=URL.createObjectURL(new Blob([await svgFile(doc,area)],{type:'image/svg+xml;charset=utf-8'}));
  const image=new Image();
  try {
    image.src=url;
    await image.decode();
    const canvas=document.createElement('canvas');
    canvas.width=width; canvas.height=height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(image,0,0,width,height);
    const imageData=ctx.getImageData(0,0,width,height);
    const {data}=imageData;
    for (let i=0;i<data.length;i+=4) {
      const luminance=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];
      // Interpret transparent pixels as white paper when deciding whether to fire a dot.
      const onWhite=255+(luminance-255)*data[i+3]/255;
      const v=onWhite<151?0:255;
      data[i]=data[i+1]=data[i+2]=v;
    }
    ctx.putImageData(imageData,0,0);
    return {canvas,bytes:bitmapFromImage(imageData)};
  } finally {
    URL.revokeObjectURL(url);
  }
}
