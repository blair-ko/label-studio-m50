import {paths,shapes,templates,fonts,fontStacks} from './assets.mjs';
import {komameGroups} from './komame-icons.mjs';
import {normalize,round,clamp,esc,safeVector,iconName,iconSVG,graphic,transform,paperArtwork,svgFile,raster,
  DEFAULT_CORNER_RADIUS,maxCornerRadius,iconStrokeMm,ICON_STROKE_MIN,ICON_STROKE_MAX,
  usesRoundedFont,loadRoundedFont} from './art.mjs';
import {Printer,makeJob,PRINT_GUIDE_HEIGHT_MM} from './printer.mjs';
import {RESIZE_HANDLES,centeredPosition,resizeObject,rotateAroundSelection,dragRotation,resizeCursor} from './geometry.mjs';
import {createLabel,createWorkspace,readWorkspace} from './workspace.mjs';

const $ = id => document.getElementById(id);
const projectKey = 'label-studio-m50.project.v1';
const templateKey = 'label-studio-m50.templates.v1';
let workspace = createWorkspace(normalize(templates[0]));
let customTemplates = [];
try {
  const saved = localStorage.getItem(projectKey);
  if (saved) workspace = readWorkspace(JSON.parse(saved));
  const savedTemplates = JSON.parse(localStorage.getItem(templateKey) || '[]');
  if (Array.isArray(savedTemplates)) customTemplates = savedTemplates.slice(0,24).map(normalize);
} catch { announce('無法還原已儲存的資料。',true); }
const activeLabel = () => workspace.labels.find(label=>label.id===workspace.activeId);
let design = activeLabel().design;
let selected = null;
const selections = new Map();
let thumbnailSources = new WeakMap();
let tab = 'elements';
let iconCategory = komameGroups[0].id;
let iconQuery = '';
let zoom = 1;
let canvasScale = 1;
let drag;
let inlineEdit;
let roundedFontRequested = false;
let fontRedrawPending = false;
let printerInfo;
let connecting = false;
let connectionError = '';
let printing = false;
let pendingArt;
let localBridge = false;
const history = [];
const future = [];
const art = $('art');
const inlineText = $('inline-text');
const canvasHelp = $('canvas-help');
const defaultHelp = canvasHelp.textContent;
const centerTolerancePx = 5;
const guideHelp = () => design.height>PRINT_GUIDE_HEIGHT_MM ? `虛線標示預估列印範圍（${PRINT_GUIDE_HEIGHT_MM} mm）` : defaultHelp;

function announce(text,error=false) {
  $('status').textContent = text;
  $('status').classList.toggle('error',error);
}

function save(artworkChanged=true) {
  activeLabel().design=design;
  if (artworkChanged) {
    const button=$('sheet-tab-'+workspace.activeId);
    if (button) updateLabelThumbnail(button,design,true);
  }
  try {
    localStorage.setItem(projectKey,JSON.stringify(workspace));
    return true;
  } catch {
    announce('瀏覽器儲存空間不足。請下載整個專案保留修改。',true);
    return false;
  }
}
function snapshotWorkspace() {
  activeLabel().design=design;
  return structuredClone(workspace);
}
function checkpoint(snapshot=snapshotWorkspace()) {
  history.push(snapshot);
  if (history.length > 36) history.shift();
  future.length=0;
}
function edit(change, refresh=true) {
  checkpoint(); change(); const saved=save();
  if (refresh) render();
  return saved;
}
function restore(from,to) {
  if (!from.length) return;
  to.push(snapshotWorkspace());
  const before=workspace.activeId;
  const tabFocused=$('label-tabs').contains(document.activeElement);
  selections.set(before,selected);
  workspace=from.pop();
  loadActiveLabel();
  save(); render();
  if (before!==workspace.activeId) revealActiveTab(tabFocused);
}
const active = () => design.items.find(o=>o.id===selected);
const assetName = o => o.type==='text' ? (o.text.trim().split('\n')[0] || '空白文字框') :
  o.type==='icon' ? iconName(o.key) : o.type==='shape' ? shapes[o.key] : o.label || '自訂圖案';

function loadActiveLabel() {
  design=activeLabel().design;
  selected=selections.get(workspace.activeId)??null;
  if (!active()) selected=null;
}
function activateLabel(id) {
  selections.set(workspace.activeId,selected);
  workspace.activeId=id;
  loadActiveLabel();
}
function updateLabelThumbnail(button, doc, changed=false) {
  if (!changed && thumbnailSources.get(button)===doc) return;
  button.querySelector('.label-tab-preview').innerHTML=
    `<svg viewBox="0 0 ${doc.length} ${doc.height}">${paperArtwork(doc,'preview-cut-'+button.dataset.labelId)}</svg>`;
  thumbnailSources.set(button,doc);
}
function renderLabelTabs() {
  const list=$('label-tabs');
  const existing=new Map(Array.from(list.children,button=>[button.dataset.labelId,button]));
  workspace.labels.forEach((label,index)=>{
    let button=existing.get(label.id);
    if (!button) {
      button=document.createElement('button');
      button.className='label-tab';
      button.type='button';
      button.id='sheet-tab-'+label.id;
      button.dataset.labelId=label.id;
      button.setAttribute('role','tab');
      button.setAttribute('aria-controls','editing-area');
      button.innerHTML='<span class="label-tab-preview" aria-hidden="true"></span><span class="label-tab-title"></span>';
    }
    const isSelected=label.id===workspace.activeId;
    const doc=isSelected?design:label.design;
    if (button.title!==doc.title) {
      button.querySelector('.label-tab-title').textContent=doc.title;
      button.title=doc.title;
    }
    updateLabelThumbnail(button,doc);
    button.setAttribute('aria-selected',String(isSelected));
    button.tabIndex=isSelected?0:-1;
    if (list.children[index]!==button) list.insertBefore(button,list.children[index]||null);
    existing.delete(label.id);
  });
  existing.forEach(button=>button.remove());
  $('editing-area').setAttribute('aria-labelledby','sheet-tab-'+workspace.activeId);
  $('editing-area').tabIndex=design.items.length?-1:0;
  $('delete-label').disabled=workspace.labels.length<=1;
}
function revealActiveTab(focus=false) {
  const button=$('sheet-tab-'+workspace.activeId), list=$('label-tabs');
  if (!button) return;
  if (focus) button.focus({preventScroll:true});
  const view=list.getBoundingClientRect(), tab=button.getBoundingClientRect();
  if (tab.left<view.left) list.scrollLeft+=tab.left-view.left;
  else if (tab.right>view.right) list.scrollLeft+=tab.right-view.right;
}
function switchLabel(id) {
  if (drag || id===workspace.activeId || !workspace.labels.some(label=>label.id===id)) return;
  if (inlineEdit) finishInlineEdit(true);
  activeLabel().design=design;
  activateLabel(id);save(false);render();revealActiveTab(true);
}
function addLabels(labels, nextId) {
  const saved=edit(()=>{
    workspace.labels.splice(workspace.labels.findIndex(label=>label.id===workspace.activeId)+1,0,...labels);
    activateLabel(nextId);
  });
  revealActiveTab(true);
  return saved;
}
$('label-tabs').addEventListener('click',event=>{
  const button=event.target.closest('[data-label-id]');
  if (button) switchLabel(button.dataset.labelId);
});
$('label-tabs').addEventListener('keydown',event=>{
  const current=workspace.labels.findIndex(label=>label.id===workspace.activeId);
  const n=workspace.labels.length;
  const next={ArrowLeft:(current+n-1)%n,ArrowRight:(current+1)%n,Home:0,End:n-1}[event.key];
  if (next===undefined || event.altKey || event.metaKey || event.ctrlKey) return;
  event.preventDefault();
  switchLabel(workspace.labels[next].id);
});
$('add-label').onclick=()=>{
  if (drag) return;
  if (inlineEdit) finishInlineEdit(true);
  const names=new Set(workspace.labels.map(label=>label.design.title));
  let number=workspace.labels.length+1;
  while (names.has(`標籤 ${number}`)) number++;
  const blank=createLabel({...design,title:`標籤 ${number}`,items:[]});
  if (addLabels([blank],blank.id)) announce(`已新增「${blank.design.title}」。`);
};
$('duplicate-label').onclick=()=>{
  if (drag) return;
  if (inlineEdit) finishInlineEdit(true);
  const copy=createLabel({...structuredClone(design),title:design.title.slice(0,66)+'（副本）'});
  if (addLabels([copy],copy.id)) announce(`已新增「${copy.design.title}」。`);
};
$('delete-label').onclick=()=>{
  if (drag || workspace.labels.length<=1) return;
  if (inlineEdit) finishInlineEdit(true);
  const oldIndex=workspace.labels.findIndex(label=>label.id===workspace.activeId);
  const title=design.title;
  const saved=edit(()=>{
    workspace.labels.splice(oldIndex,1);
    activateLabel(workspace.labels[Math.min(oldIndex,workspace.labels.length-1)].id);
  });
  revealActiveTab(true);
  if (saved) announce(`已刪除「${title}」。可按復原取回。`);
};

function ensureRoundedFont() {
  if (roundedFontRequested ||
      (!workspace.labels.some(label=>usesRoundedFont(label.design)) &&
        (tab!=='templates' || ![...templates,...customTemplates].some(usesRoundedFont)))) return;
  roundedFontRequested=true;
  loadRoundedFont().then(()=>{
    thumbnailSources=new WeakMap();
    renderLabelTabs();
    if (drag) fontRedrawPending=true;
    else renderArt();
    if (tab==='templates') renderLibrary();
  }).catch(error=>announce(error.message,true));
}

function renderLibrary() {
  for (const button of document.querySelectorAll('[data-tab]')) button.setAttribute('aria-pressed',String(button.dataset.tab===tab));
  if (tab==='templates') {
    const gallery=[...templates,...customTemplates];
    $('assets').innerHTML=`<div class="template-grid">${gallery.map((entry,index)=>{
      const example=normalize(entry);
      return `<button class="template" data-template="${index}"><svg viewBox="0 0 ${example.length} ${example.height}" aria-hidden="true">${paperArtwork(example,'template-cut-'+index)}</svg>${esc(entry.title)}</button>`;
    }).join('')}</div><button id="save-template" class="button secondary save-template">儲存目前設計為樣板</button>`;
    ensureRoundedFont();
    return;
  }
  const group = Object.entries(shapes).map(([key,label])=>{
    const example=normalize({length:40,height:14,items:[{type:'shape',key,w:4,h:key==='line'?4:3}]}).items[0];
    return `<button class="asset" data-shape="${key}" title="${label}" aria-label="${label}"><svg viewBox="-.5 -.5 5 5" aria-hidden="true">${graphic(example)}</svg></button>`;
  }).join('');
  const categories=komameGroups.map(({id,label})=>`<option value="${id}">${esc(label)}</option>`).join('');
  $('assets').innerHTML=`<button class="button secondary add-text" id="add-text"><strong aria-hidden="true">T</strong>新增文字框</button>
    <h3 class="group-label">基本圖形</h3><div class="asset-grid">${group}</div>
    <h3 id="icon-heading" class="group-label">向量圖示</h3>
    <search class="icon-filters" aria-labelledby="icon-heading">
      <label for="icon-category">圖示主題</label>
      <select id="icon-category">${categories}<option value="">全部主題</option></select>
      <label for="search">搜尋圖示</label>
      <input id="search" type="search" placeholder="輸入中文或英文" autocorrect="off" autocapitalize="none" spellcheck="false">
    </search>
    <div id="icons" class="asset-grid komame-grid"></div>
    <p id="no-icons" class="muted" role="status"></p>`;
  const category=$('icon-category');
  const search=$('search');
  const grid=$('icons');
  category.value=iconCategory;
  search.value=iconQuery;
  const renderIcons=()=>{
    const query=iconQuery.trim().toLowerCase();
    const matches=komameGroups.filter(({id})=>!iconCategory || id===iconCategory)
      .flatMap(({icons})=>icons)
      .filter(([key,label])=>`${key.split('/').at(-1).replaceAll('-',' ')} ${label.toLowerCase()}`.includes(query));
    grid.innerHTML=matches.map(([key,label])=>`<button type="button" class="asset" data-symbol="${key}" title="${esc(label)}" aria-label="${esc(label)}">${iconSVG(key)}</button>`).join('');
    grid.scrollTop=0;
    $('no-icons').textContent=matches.length?'':'找不到符合的圖示。';
  };
  category.addEventListener('change',()=>{iconCategory=category.value;renderIcons();});
  search.addEventListener('input',()=>{iconQuery=search.value;renderIcons();});
  renderIcons();
}

function scale() {
  const area=$('editing-area');
  const gutter=innerWidth<=760?36:65;
  const fit=Math.min(15,Math.max(2,(area.clientWidth-gutter)/design.length));
  const px=fit*zoom;
  canvasScale=px;
  $('paper').style.width=design.length*px+'px';
  $('paper').style.height=design.height*px+'px';
  $('paper').style.borderRadius=design.cornerRadius*px+'px';
  $('zoom-fit').textContent=Math.round(zoom*100)+'%';
  $('zoom-out').disabled=zoom<=.5; $('zoom-in').disabled=zoom>=2.5;
  updateSelectionGeometry();
  if (inlineEdit) positionInlineEditor();
}

function selectionBounds(object,ink) {
  const visible=object.type==='text' ? ink?.getBBox() : null;
  return visible?.width>0 && visible.height>0 ? visible : {x:0,y:0,width:object.w,height:object.h};
}
function updateSelectionGeometry() {
  const o=active(), outline=$('selection-outline');
  if (!o || !outline) return;
  const ink=art.querySelector(`[data-draw="${o.id}"] > .object-ink`);
  if (!ink) return;
  let bounds=selectionBounds(o,ink);
  if (o.type==='text' && drag?.id===o.id && drag.mode==='resize' &&
      !(drag.direction.x && drag.direction.y)) {
    // While pulling a text edge, show the changing box even before its lines wrap.
    const {frame,initial}=drag;
    bounds={...frame,width:Math.max(.5,frame.width+o.w-initial.w),height:Math.max(.5,frame.height+o.h-initial.h)};
  }
  const coarse=matchMedia('(pointer:coarse)').matches;
  const px=1/canvasScale, padding=1.5*px, minimum=(coarse?36:26)*px;
  const width=Math.max(bounds.width+2*padding,minimum),height=Math.max(bounds.height+2*padding,minimum);
  const cx=bounds.x+bounds.width/2,cy=bounds.y+bounds.height/2;
  const edge=outline.querySelector('.selection-edge');
  edge.setAttribute('x',cx-width/2);
  edge.setAttribute('y',cy-height/2);
  edge.setAttribute('width',width);
  edge.setAttribute('height',height);
  edge.setAttribute('rx',1.5*px);
  const hitRadius=Math.min(coarse?11:9,width/px/4,height/px/4);
  for (const handle of RESIZE_HANDLES) {
    const group=outline.querySelector(`[data-resize="${handle.id}"]`);
    group.setAttribute('transform',`translate(${cx+handle.x*width/2} ${cy+handle.y*height/2}) scale(${px})`);
    group.style.cursor=resizeCursor(handle,o.rotation);
    group.querySelector('.resize-hit').setAttribute('r',hitRadius);
  }
  outline.querySelector('.rotate-control').setAttribute('transform',`translate(${cx} ${cy-height/2}) scale(${px})`);
  outline.querySelector('.rotation-pivot').setAttribute('transform',`translate(${cx} ${cy}) scale(${px})`);
}

function printMarginGuides() {
  const {length,height,cornerRadius}=design;
  if (height<=PRINT_GUIDE_HEIGHT_MM) return '';
  const top=round((height-PRINT_GUIDE_HEIGHT_MM)/2);
  const lines=[top,top+PRINT_GUIDE_HEIGHT_MM].map(y=>
    `<line class="print-margin-guide" x1="0" x2="${length}" y1="${y}" y2="${y}" vector-effect="non-scaling-stroke"/>`
  ).join('');
  return `<defs><clipPath id="margin-guide-cut"><rect width="${length}" height="${height}" rx="${cornerRadius}"/></clipPath></defs>
    <g clip-path="url(#margin-guide-cut)" aria-hidden="true">${lines}</g>`;
}

function renderArt() {
  fontRedrawPending=false;
  ensureRoundedFont();
  art.setAttribute('viewBox',`0 0 ${design.length} ${design.height}`);
  const focusId=document.activeElement?.closest?.('[data-hit]')?.dataset.hit;
  const elements=design.items.map(o=>`<g data-draw="${o.id}" data-editing="${inlineEdit?.id===o.id}" transform="${transform(o)}"><g class="object-ink">${graphic(o)}</g><rect class="object-hit" data-hit="${o.id}" x="0" y="0" width="${o.w}" height="${o.h}" fill="transparent" vector-effect="non-scaling-stroke" tabindex="0" role="button" aria-pressed="${o.id===selected}" aria-label="${esc(assetName(o))}。使用方向鍵移動。${o.type==='text'?'按 Enter 編輯文字。':''}"/></g>`).join('');
  const o=active();
  const selection=o && !inlineEdit ? `<g id="selection-outline" aria-hidden="true" transform="${transform(o)}">
    <rect class="selection-edge" fill="none" vector-effect="non-scaling-stroke"/>
    <circle class="rotation-pivot" r="2.5" vector-effect="non-scaling-stroke"/>
    ${RESIZE_HANDLES.map(handle=>`<g class="resize-handle" data-resize="${handle.id}"><title>拖曳${handle.label}調整大小</title>
      <circle class="resize-hit" r="9" fill="transparent"/>
      <rect class="resize-mark" x="-2.5" y="-2.5" width="5" height="5" rx="1" vector-effect="non-scaling-stroke"/>
    </g>`).join('')}
    <g class="rotate-control">
      <path class="rotate-stem" d="M0-3V-20" fill="none" vector-effect="non-scaling-stroke"/>
      <g class="rotate-handle" data-rotate="true"><title>拖曳旋轉。按住 Shift 每 15 度對齊。</title>
        <circle class="rotate-hit" cy="-24" r="10" fill="transparent"/>
        <circle class="rotate-mark" cy="-24" r="4" vector-effect="non-scaling-stroke"/>
      </g>
    </g>
  </g>` : '';
  art.innerHTML=`${printMarginGuides()}${elements}${selection}<g aria-hidden="true">
    <line id="center-x" class="alignment-guide" x1="${design.length/2}" x2="${design.length/2}" y1="0" y2="${design.height}" vector-effect="non-scaling-stroke" visibility="hidden"/>
    <line id="center-y" class="alignment-guide" x1="0" x2="${design.length}" y1="${design.height/2}" y2="${design.height/2}" vector-effect="non-scaling-stroke" visibility="hidden"/>
  </g>`;
  canvasHelp.textContent=guideHelp();
  updateSelectionGeometry();
  if (focusId) {
    const focus=art.querySelector(`[data-hit="${focusId}"]`);
    if (focus) focus.focus({preventScroll:true});
  }
}

const numeric = (k,label,value,min,max,step=.1)=>`<label>${label}<input data-property="${k}" type="number" value="${value}"${min===undefined?'':` min="${min}" max="${max}"`} step="${step}"></label>`;
const selectInput = (k,label,items,current)=>`<label class="wide-field">${label}<select data-property="${k}">${Object.entries(items).map(([value,name])=>`<option value="${value}"${value===current?' selected':''}>${name}</option>`).join('')}</select></label>`;
const propButton = (id,icon,label,danger='')=>`<button id="${id}" class="icon-button ${danger}" title="${label}" aria-label="${label}">${iconSVG(icon)}</button>`;

function renderProperties() {
  const o=active();
  $('object-type').textContent=o ? ({text:'文字框',icon:'向量圖示',shape:'圖形',image:'圖片',vector:'SVG'})[o.type] : '';
  if (!o) { $('properties').innerHTML='<p class="muted">在畫布或圖層點選要編輯的物件。</p>'; return; }
  let extra='';
  if (o.type==='text') {
    extra=`<label>內容<textarea maxlength="500" class="props-text" data-property="text">${esc(o.text)}</textarea></label>
      ${selectInput('font','字型',fonts,o.font)}
      <div class="fields">${numeric('size','字級（mm）',o.size,.5,20)}${selectInput('align','對齊',{left:'靠左',center:'置中',right:'靠右'},o.align)}</div>
      <div class="fields"><label class="check"><input type="checkbox" data-property="bold"${o.bold?' checked':''}>粗體</label><label class="check"><input type="checkbox" data-property="italic"${o.italic?' checked':''}>斜體</label></div>`;
  } else if (o.type==='shape') {
    extra=`<div class="fields">${numeric('stroke','線寬（mm）',o.stroke,.08,2,.01)}
      <label class="check"><input type="checkbox" data-property="${o.key==='line'?'vertical':'fill'}"${(o.key==='line'?o.vertical:o.fill)?' checked':''}>${o.key==='line'?'垂直':'黑色填滿'}</label></div>`;
  } else if (o.type==='icon') {
    extra=`<div class="fields">${numeric('iconStroke','線寬（mm）',iconStrokeMm(o),ICON_STROKE_MIN,ICON_STROKE_MAX,.01)}</div>`;
  }
  $('properties').innerHTML=`${extra}
    <div class="fields">${numeric('x','X 位置（mm）',o.x,undefined,undefined,.01)}${numeric('y','Y 位置（mm）',o.y,undefined,undefined,.01)}</div>
    <div class="fields">${numeric('w','寬（mm）',o.w,.5,100)}${numeric('h','高（mm）',o.h,.5,60)}</div>
    <div class="fields">${numeric('rotation','旋轉（°）',o.rotation,-180,180,1)}</div>
    <div class="props-actions">${propButton('duplicate','duplicate','複製圖層')}${propButton('bring-up','up','上移一層')}${propButton('send-down','down','下移一層')}${propButton('remove','trash','刪除圖層','danger')}</div>`;
  const i=design.items.indexOf(o);
  $('bring-up').disabled=i===design.items.length-1;
  $('send-down').disabled=i===0;
}
function renderLayers() {
  $('layers').innerHTML=design.items.slice().reverse().map(o=>`<button class="layer-row" data-layer="${o.id}" aria-pressed="${selected===o.id}"><span class="layer-icon" aria-hidden="true">${o.type==='text'?'T':iconSVG(o.type==='icon'?o.key:o.type==='shape'?'box':'image')}</span><span class="layer-label">${esc(assetName(o))}</span></button>`).join('') || '<p class="muted">還沒有物件。</p>';
}
function render() {
  renderLabelTabs();
  $('title').value=design.title; renderSizeFields();
  const size=`${design.length} × ${design.height} mm`;
  $('ruler').textContent=size; $('summary-size').textContent=size;
  $('presets').innerHTML=[30,40,50].map(length=>`<button data-length="${length}" aria-pressed="${design.length===length && design.height===14 && design.cornerRadius===DEFAULT_CORNER_RADIUS}">${length} × 14</button>`).join('');
  $('undo').disabled=!history.length; $('redo').disabled=!future.length;
  scale(); renderArt(); renderProperties(); renderLayers();
}
function select(itemId) {
  selected=itemId; renderArt(); renderProperties(); renderLayers();
}
function add(item) {
  if (design.items.length >= 120) {announce('一個標籤最多可放 120 個物件。',true); return;}
  const x=round(Math.max(0,(design.length-item.w)/2));
  const y=round(Math.max(0,(design.height-item.h)/2));
  const added=normalize({...design,items:[{x,y,...item}]}).items[0];
  edit(()=>{design.items.push(added);selected=added.id;});
}
function renderSizeFields() {
  $('length').value=design.length;
  $('height').value=design.height;
  $('corner-radius').max=maxCornerRadius(design.length,design.height);
  $('corner-radius').value=design.cornerRadius;
}
function setSize(length,height,cornerRadius=design.cornerRadius) {
  length=Number.isFinite(length)?round(clamp(length,10,100)):design.length;
  height=Number.isFinite(height)?round(clamp(height,5,14)):design.height;
  const radius=round(clamp(Number.isFinite(cornerRadius)?cornerRadius:design.cornerRadius,0,maxCornerRadius(length,height)));
  if (length===design.length && height===design.height && radius===design.cornerRadius) {
    renderSizeFields();
    return;
  }
  edit(()=>{
    design.length=length; design.height=height; design.cornerRadius=radius;
  });
}
function order(direction) {
  const from=design.items.indexOf(active()), to=from+direction;
  if (from<0 || to<0 || to>=design.items.length) return;
  edit(()=>{[design.items[from],design.items[to]]=[design.items[to],design.items[from]];});
}
function remove() {
  if (!active()) return;
  edit(()=>{design.items=design.items.filter(o=>o.id!==selected);selected=null;});
}
function duplicate() {
  const o=active();
  if (!o) return;
  add({...o,id:undefined,x:o.x+.8,y:o.y+.6});
}

$('assets').addEventListener('click',event=>{
  const button=event.target.closest('button');
  if (!button) return;
  const d=button.dataset;
  if (button.id==='add-text') {
    add({type:'text',text:'新增文字',w:Math.min(design.length-2,24),h:Math.min(design.height-1,7),size:3.1,bold:true});
    startInlineEdit(active());
  } else if (d.shape) {
    add({type:'shape',key:d.shape,w:d.shape==='line'?12:8,h:Math.min(design.height-1,d.shape==='line'?1:6)});
  } else if (d.symbol) {
    const s=Math.min(7.5,design.height-1);
    add({type:'icon',key:d.symbol,w:s,h:s});
  } else if (d.template!==undefined) {
    const entry=[...templates,...customTemplates][Number(d.template)];
    edit(()=>{design=normalize({...entry,items:entry.items.map(o=>({...o,id:undefined}))});selected=null;});
    announce(`已套用「${entry.title}」。可按復原回到原設計。`);
  } else if (button.id==='save-template') {
    try {
      const next=[...customTemplates.slice(-23),structuredClone(design)];
      localStorage.setItem(templateKey,JSON.stringify(next));
      customTemplates=next; renderLibrary(); announce('已儲存到這個瀏覽器的樣板庫。');
    } catch { announce('樣板無法儲存。請改為下載設計檔。',true); }
  }
});
document.querySelector('.tabs').addEventListener('click',event=>{
  if (!event.target.dataset.tab) return;
  tab=event.target.dataset.tab; renderLibrary();
});
$('presets').addEventListener('click',event=>{
  const value=Number(event.target.dataset.length);
  if (value) setSize(value,14,DEFAULT_CORNER_RADIUS);
});
function commitSize(event) {
  const cornerField=$('corner-radius');
  const entered=cornerField.valueAsNumber;
  const isCorner=event.target===cornerField;
  const corrected=isCorner && (entered<0 || entered>+cornerField.max);
  setSize($('length').valueAsNumber,$('height').valueAsNumber,entered);
  if (corrected) announce(`圓角已調整為 ${design.cornerRadius} mm，可用範圍是 0 至 ${cornerField.max} mm。`);
}
for (const id of ['length','height','corner-radius']) {
  const input=$(id);
  input.addEventListener('change',commitSize);
  input.addEventListener('blur',commitSize);
  input.addEventListener('keydown',event=>{
    if (event.key==='Enter') {event.preventDefault();commitSize(event);}
  });
}
function commitTitle() {
  const value=$('title').value.trim()||'未命名標籤';
  if (value!==design.title) edit(()=>{design.title=value;});
  else $('title').value=value;
}
$('title').addEventListener('change',commitTitle);
$('title').addEventListener('blur',commitTitle);
$('title').addEventListener('keydown',event=>{
  if (event.key==='Enter') {event.preventDefault();commitTitle();}
});
$('layers').addEventListener('click',event=>{
  const button=event.target.closest('[data-layer]');
  if (!button) return;
  select(button.dataset.layer);
  $('layers').querySelector(`[data-layer="${selected}"]`)?.focus({preventScroll:true});
});
let textCheckpoint;
$('properties').addEventListener('focusout',event=>{
  const input=event.target;
  if (input.dataset.property==='text') textCheckpoint=undefined;
  if (input.type==='number') commitProperty(input);
});
$('properties').addEventListener('input',event=>{
  const input=event.target,o=active();
  if (input.dataset.property!=='text' || o?.type!=='text' || input.value===o.text) return;
  if (textCheckpoint!==input) {
    checkpoint();
    textCheckpoint=input;
  }
  o.text=input.value;
  save();renderArt();renderLayers();
  $('undo').disabled=false;$('redo').disabled=true;
});
function commitProperty(input) {
  const k=input.dataset.property,o=active();
  if (!k || !o) return;
  const previous=k==='iconStroke' ? iconStrokeMm(o) : o[k];
  const value=input.type==='checkbox'?input.checked:input.type==='number'?
    (Number.isFinite(input.valueAsNumber)?round(input.hasAttribute('min')?clamp(input.valueAsNumber,+input.min,+input.max):input.valueAsNumber):previous):input.value;
  if (value===previous) { if (input.type==='number') input.value=value; return; }
  if (k==='rotation') {
    const ink=art.querySelector(`[data-draw="${o.id}"] .object-ink`);
    const frame=selectionBounds(o,ink);
    edit(()=>applyRotation(o,o,frame,value),false);
    for (const axis of ['x','y']) $('properties').querySelector(`[data-property="${axis}"]`).value=o[axis];
  } else edit(()=>{o[k]=value;},false);
  if (input.type==='number') input.value=value;
  renderArt();renderLayers();
  $('undo').disabled=false;$('redo').disabled=true;
}
$('properties').addEventListener('change',event=>commitProperty(event.target));
$('properties').addEventListener('keydown',event=>{
  if (event.key==='Enter' && event.target.type==='number') {
    event.preventDefault();
    commitProperty(event.target);
  }
});
$('properties').addEventListener('click',event=>{
  const id=event.target.closest('button')?.id;
  if (id==='bring-up') order(1);
  if (id==='send-down') order(-1);
  if (id==='remove') remove();
  if (id==='duplicate') duplicate();
});
$('zoom-out').onclick=()=>{zoom=round(Math.max(.5,zoom-.25));scale();};
$('zoom-in').onclick=()=>{zoom=round(Math.min(2.5,zoom+.25));scale();};
$('zoom-fit').onclick=()=>{zoom=1;scale();};
$('undo').onclick=()=>restore(history,future);
$('redo').onclick=()=>restore(future,history);
new ResizeObserver(scale).observe($('editing-area'));

function position(o,x,y) {
  o.x=round(x);
  o.y=round(y);
}
function applyRotation(object,initial,frame,rotation) {
  // Compensate for the stored frame origin so existing designs still render in place.
  const next=rotateAroundSelection(initial,frame,round(rotation));
  object.rotation=next.rotation;
  position(object,next.x,next.y);
}
function alignmentMessage(x,y) {
  if (x && y) return '已水平與垂直置中';
  if (x) return '已水平置中';
  if (y) return '已垂直置中';
  return '';
}
function showAlignment(x,y) {
  $('center-x').setAttribute('visibility',x?'visible':'hidden');
  $('center-y').setAttribute('visibility',y?'visible':'hidden');
  const message=alignmentMessage(x,y);
  canvasHelp.classList.toggle('aligned',Boolean(message));
  canvasHelp.textContent=message||guideHelp();
}
function point(event,bounds) {
  return [(event.clientX-bounds.left)*design.length/bounds.width,(event.clientY-bounds.top)*design.height/bounds.height];
}

function positionInlineEditor() {
  const o=design.items.find(item=>item.id===inlineEdit.id);
  if (!o) return;
  Object.assign(inlineText.style,{
    left:o.x*canvasScale+'px',
    top:o.y*canvasScale+'px',
    width:Math.max(40,o.w*canvasScale)+'px',
    height:Math.max(26,o.h*canvasScale,o.size*canvasScale*1.16+3)+'px',
    transformOrigin:`${o.w*canvasScale/2}px ${o.h*canvasScale/2}px`,
    transform:`rotate(${o.rotation}deg)`,
    fontFamily:o.font==='rounded' ? `"Huninn Editor", ${fontStacks.rounded}` : fontStacks[o.font],
    fontSize:Math.max(10,o.size*canvasScale)+'px',
    fontStyle:o.italic?'italic':'normal',
    fontWeight:o.bold?'700':'400',
    textAlign:o.align,
  });
}
function startInlineEdit(object) {
  if (!object || object.type!=='text' || drag || inlineEdit) return;
  selected=object.id;
  inlineEdit={id:object.id};
  inlineText.value=object.text;
  renderArt();renderProperties();renderLayers();
  positionInlineEditor();
  inlineText.hidden=false;
  inlineText.focus({preventScroll:true});
  inlineText.select();
}
function finishInlineEdit(commit,refocus=false) {
  if (!inlineEdit) return;
  const {id}=inlineEdit;
  const object=design.items.find(item=>item.id===id);
  const text=inlineText.value;
  inlineEdit=null;
  inlineText.hidden=true;
  if (commit && object && text!==object.text) edit(()=>{object.text=text;});
  else renderArt();
  if (refocus) art.querySelector(`[data-hit="${id}"]`)?.focus({preventScroll:true});
}
inlineText.addEventListener('blur',()=>finishInlineEdit(true));
inlineText.addEventListener('keydown',event=>{
  if (event.isComposing || event.keyCode===229) return;
  if (event.key==='Escape' || (event.key==='Enter' && (event.metaKey || event.ctrlKey))) {
    event.preventDefault();
    finishInlineEdit(event.key!=='Escape',true);
  }
});

art.addEventListener('pointerdown',event=>{
  if (event.button!==0 || !event.isPrimary) return;
  const handle=event.target.closest('[data-hit], [data-resize], [data-rotate]');
  if (inlineEdit) finishInlineEdit(true);
  if (!handle) { select(null); return; }
  const direction=RESIZE_HANDLES.find(h=>h.id===handle.dataset.resize);
  const mode=direction?'resize':handle.dataset.rotate?'rotate':'move';
  const id=handle.dataset.hit || selected;
  const object=design.items.find(o=>o.id===id);
  if (!object) return;
  event.preventDefault();
  if (document.activeElement?.matches('#properties input[type="number"]')) document.activeElement.blur();
  if (selected!==id) select(id);
  const bounds=art.getBoundingClientRect();
  const [x,y]=point(event,bounds);
  const drawing=art.querySelector(`[data-draw="${id}"]`);
  const frame=selectionBounds(object,drawing.querySelector('.object-ink'));
  drag={pointer:event.pointerId,id,mode,direction,frame,x,y,clientX:event.clientX,clientY:event.clientY,
    scaleX:bounds.width/design.length,scaleY:bounds.height/design.height,
    centerTarget:centeredPosition(object,frame,design.length,design.height),
    initial:{...object},old:snapshotWorkspace(),drawing,
    outline:$('selection-outline'),moved:false,snapX:false,snapY:false};
  drawing.querySelector('[data-hit]').focus({preventScroll:true});
  art.setPointerCapture(event.pointerId);
});
function updateDrag(event) {
  if (!drag || event.pointerId!==drag.pointer) return;
  const object=active();
  if (!object || object.id!==drag.id) return;
  const screenX=event.clientX-drag.clientX,screenY=event.clientY-drag.clientY;
  if (!drag.moved && Math.hypot(screenX,screenY)<3) return;
  const {scaleX,scaleY}=drag;
  const dx=screenX/scaleX,dy=screenY/scaleY;
  const x=drag.x+dx,y=drag.y+dy;
  drag.moved=true;
  if (drag.mode==='resize') {
    const next=resizeObject(drag.initial,drag.direction,dx,dy,drag.frame);
    position(object,next.x,next.y);
    object.w=round(next.w);object.h=round(next.h);
    if (object.type==='text') object.size=round(next.size);
    renderArt();
    return;
  }
  if (drag.mode==='rotate') {
    const angle=dragRotation(drag.initial,drag.frame,drag.x,drag.y,x,y,event.shiftKey);
    applyRotation(object,drag.initial,drag.frame,angle);
    const placement=transform(object);
    drag.drawing.setAttribute('transform',placement);
    drag.outline.setAttribute('transform',placement);
    updateSelectionGeometry();
    art.classList.add('is-rotating');
    return;
  }
  const nextX=drag.initial.x+dx,nextY=drag.initial.y+dy;
  const [middleX,middleY]=drag.centerTarget;
  const snapX=!event.altKey && Math.abs(nextX-middleX)*scaleX<=centerTolerancePx;
  const snapY=!event.altKey && Math.abs(nextY-middleY)*scaleY<=centerTolerancePx;
  position(object,snapX?middleX:nextX,snapY?middleY:nextY);
  const placement=transform(object);
  drag.drawing.setAttribute('transform',placement);
  drag.outline.setAttribute('transform',placement);
  art.classList.add('is-moving');
  if (snapX!==drag.snapX || snapY!==drag.snapY) {
    drag.snapX=snapX; drag.snapY=snapY;
    showAlignment(snapX,snapY);
  }
}
art.addEventListener('pointermove',updateDrag);
function finishDrag(event) {
  if (!drag || event.pointerId!==drag.pointer) return;
  if (event.type==='pointerup') updateDrag(event);
  const ended=drag;
  drag=null;
  art.classList.remove('is-moving','is-rotating');
  showAlignment(false,false);
  if (!ended.moved) {
    if (fontRedrawPending) renderArt();
    return;
  }
  if (event.type!=='pointerup') {
    workspace=ended.old;
    design=activeLabel().design;
  }
  else {
    if (fontRedrawPending && ended.mode==='move' && (ended.snapX || ended.snapY)) {
      // A font that finished loading mid-drag can change the visible text bounds.
      renderArt();
      const object=active();
      const ink=art.querySelector(`[data-draw="${ended.id}"] .object-ink`);
      const [x,y]=centeredPosition(object,selectionBounds(object,ink),design.length,design.height);
      position(object,ended.snapX?x:object.x,ended.snapY?y:object.y);
    }
    checkpoint(ended.old);save();
    const alignment=alignmentMessage(ended.snapX,ended.snapY);
    if (ended.mode==='resize') announce('已調整物件大小。');
    else if (ended.mode==='rotate') announce(`已旋轉至 ${active().rotation}°。`);
    else announce(`${alignment||'已移動物件'}。`);
  }
  render();
}
for (const name of ['pointerup','pointercancel','lostpointercapture']) art.addEventListener(name,finishDrag);
art.addEventListener('dblclick',event=>{
  if (event.target.closest('[data-resize], [data-rotate]')) return;
  const id=event.target.closest('[data-hit]')?.dataset.hit || selected;
  startInlineEdit(design.items.find(item=>item.id===id));
});
art.addEventListener('keydown',event=>{
  if (drag) {
    event.preventDefault();
    if (event.key==='Escape' && art.hasPointerCapture(drag.pointer)) art.releasePointerCapture(drag.pointer);
    return;
  }
  const id=event.target.dataset.hit;
  if (!id) return;
  const o=design.items.find(item=>item.id===id);
  if (event.key==='Enter' && o?.type==='text') {event.preventDefault();startInlineEdit(o);return;}
  if (['Enter',' '].includes(event.key)) {event.preventDefault();select(id);return;}
  const moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  if (!moves[event.key]) return;
  event.preventDefault();
  const [x,y]=moves[event.key], step=event.shiftKey?1:.25;
  edit(()=>{selected=id;position(o,o.x+x*step,o.y+y*step);});
  announce(`已移動「${assetName(o)}」。`);
});
document.addEventListener('keydown',event=>{
  if (drag || event.target.matches('input,textarea,select') || document.querySelector('dialog[open]')) return;
  const command=event.metaKey||event.ctrlKey;
  const key=event.key.toLowerCase();
  if (command && key==='z') {
    event.preventDefault(); if (event.shiftKey) restore(future,history); else restore(history,future);
  }
  if (event.target.closest('[role="tab"]')) return;
  if (command && key==='d' && active()) {event.preventDefault();duplicate();}
  if (['Delete','Backspace'].includes(event.key) && active()) {event.preventDefault();remove();}
});

function download(href,ext,title) {
  const a=document.createElement('a');
  a.href=href;
  a.download=(title.trim().replace(/[^\p{L}\p{N}_ -]/gu,'_')||'label')+'.'+ext;
  a.click();
}
function downloadBlob(blob,ext,title) {
  const url=URL.createObjectURL(blob);
  download(url,ext,title);
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function downloadDesign(doc) {
  downloadBlob(new Blob([JSON.stringify(doc,null,2)],{type:'application/json'}),'json',doc.title);
}

$('export').onclick=()=>$('export-dialog').showModal();
$('export-dialog').addEventListener('click',async event=>{
  const ext=event.target.dataset.file;
  if (!ext) return;
  try {
    const current=structuredClone(design);
    if (ext==='svg') downloadBlob(new Blob([await svgFile(current)],{type:'image/svg+xml'}),'svg',current.title);
    if (ext==='json') downloadDesign(current);
    if (ext==='project') {
      const projectFile=new Blob([JSON.stringify(snapshotWorkspace(),null,2)],{type:'application/json'});
      downloadBlob(projectFile,'json',current.title+'-標籤專案');
    }
    if (ext==='png') download((await raster(current)).canvas.toDataURL('image/png'),'png',current.title);
    $('export-dialog').close();
  } catch (error) {announce(error.message,true);$('export-dialog').close();}
});
$('open-project').onclick=()=>$('project-file').click();
$('project-file').onchange=async event=>{
  const file=event.target.files[0];
  event.target.value='';
  if (!file) return;
  try {
    if (file.size>32_000_000) throw Error('設計檔過大。');
    const imported=readWorkspace(JSON.parse(await file.text()));
    const activeIndex=imported.labels.findIndex(label=>label.id===imported.activeId);
    const labels=imported.labels.map(label=>createLabel(label.design));
    $('export-dialog').close();
    if (addLabels(labels,labels[activeIndex].id)) announce(`已匯入 ${labels.length} 張標籤。`);
  } catch (error) { $('export-dialog').close();announce(error.message,true); }
};

$('import-graphic').onclick=()=>$('graphic-file').click();
$('graphic-file').onchange=async event=>{
  const file=event.target.files[0];
  event.target.value='';
  if (!file) return;
  const labelId=workspace.activeId;
  const ensureCurrentLabel=()=>{
    if (workspace.activeId!==labelId) throw Error('已切換標籤。請在要匯入的標籤重試。');
  };
  try {
    if (file.size>1_000_000) throw Error('請選擇 1 MB 以下的圖片。');
    const label=file.name.slice(0,70);
    if (file.name.toLowerCase().endsWith('.svg')) {
      const vector=safeVector(await file.text());
      if (vector.vector.length>170000) throw Error('SVG 過於複雜，請簡化後再匯入。');
      ensureCurrentLabel();
      const h=Math.min(design.height-1,8,Math.max(.5,design.length*.7/vector.ratio));
      add({type:'vector',...vector,label,w:Math.min(design.length*.7,Math.max(.5,h*vector.ratio)),h});
    } else {
      if (!['image/png','image/jpeg','image/webp'].includes(file.type)) throw Error('請選擇 SVG、PNG、JPEG 或 WebP。');
      const reader=new FileReader();
      const src=await new Promise((resolve,reject)=>{reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
      const image=new Image(); image.src=src; await image.decode();
      ensureCurrentLabel();
      const ratio=image.naturalWidth/image.naturalHeight;
      const h=Math.min(design.height-1,8,Math.max(.5,design.length*.7/ratio));
      add({type:'image',src,label,w:Math.min(design.length*.7,Math.max(.5,h*ratio)),h});
    }
    announce('已匯入圖案。');
  } catch (error) {announce(error.message||'圖案無法匯入。',true);}
};

function changePrinter(state) {
  printerInfo=state;
  $('device-dot').classList.toggle('connected',Boolean(state));
  $('connection').textContent=state?(localBridge?'M50 已偵測':'M50 已連線'):'連接 M50';
  if (!state) announce('M50 已中斷連線。');
  updatePrinterControls();
}
const printer=new Printer(changePrinter);
const isConnected=()=>localBridge ? Boolean(printerInfo) : printer.connected;
const webBluetooth=typeof navigator.bluetooth?.requestDevice==='function';
const printDialog=$('print-dialog');
const connectionDialog=$('connection-dialog');

async function bridgeRequest(path, options={}) {
  const response=await fetch('/api/'+path,{cache:'no-store',...options});
  const data=await response.json();
  if (!response.ok || data.error) throw Error(data.error||'本機列印失敗。');
  return data;
}
if (location.hostname==='127.0.0.1') {
  bridgeRequest('bridge').then(data=>{
    localBridge=data.available===true;
    updatePrinterControls();
  }).catch(()=>{});
}

const webBluetoothUnavailable='此瀏覽器無法直接使用網頁藍牙。可改用電腦版 Chrome、Edge，或使用 Mac 本機版。';
function updatePrinterControls() {
  const canConnect=localBridge || webBluetooth;
  $('connect').disabled=printing || (localBridge && connecting);
  $('web-bluetooth-options').hidden=!webBluetooth;
  $('search-printer').disabled=connecting || printing;
  $('search-printer').textContent=connecting?'等待裝置選擇…':'搜尋附近的 M50';
  $('connection-message').textContent=connecting
    ? '請在瀏覽器的裝置選單選擇 M50。若沒有選單，可開啟 Mac 本機版。'
    : connectionError || (webBluetooth?'搜尋後，請在瀏覽器的裝置選單選擇 M50。':webBluetoothUnavailable);
  $('print-connection-options').hidden=localBridge;
  $('print-connection-help').disabled=printing;
  $('print-now').disabled=printing || connecting || !canConnect || !pendingArt;
  $('print-now').textContent=printing?'列印中…':isConnected()?'送出 1 張':'連線並列印';
  const details=printerInfo?`M50 · 電量 ${printerInfo.battery}% · ${printerInfo.stock==='Continuous'?'連續紙':printerInfo.stock}。`:'';
  $('print-note').textContent=connecting&&!localBridge ? '等待瀏覽器選擇標籤機。若沒有出現選單，可查看連線方式。' :
    connectionError || (canConnect ?
    `${details}請確認紙卷尺寸與畫布相符。每次送出 1 張，請以實際出紙為準。` :
    webBluetoothUnavailable);
}
function openConnectionOptions() {
  if (printDialog.open) printDialog.close();
  updatePrinterControls();
  connectionDialog.showModal();
}
async function connect() {
  if (connecting || (!localBridge && !webBluetooth)) return false;
  connecting=true; connectionError=''; updatePrinterControls();
  try {
    if (localBridge) changePrinter(await bridgeRequest('status'));
    else await printer.connect();
    announce(`已連線到 ${printerInfo.name}。電量 ${printerInfo.battery}%。`);
    return true;
  } catch (error) {
    connectionError=!localBridge && error.name==='NotFoundError'
      ? '未選到 M50。請確認電源、距離及手機 App 是否已中斷連線。'
      : error.message;
    announce(connectionError,true);
    return false;
  } finally {connecting=false;updatePrinterControls();}
}
$('connect').onclick=()=>{
  if (localBridge) void connect();
  else if (printer.connected) printer.close();
  else openConnectionOptions();
};
$('search-printer').onclick=async ()=>{
  if (await connect() && connectionDialog.open) connectionDialog.close();
};
$('download-for-local').onclick=()=>downloadDesign(design);
$('print-connection-help').onclick=openConnectionOptions;
let previewing=false;
$('print').onclick=async ()=>{
  if (printing || previewing) return;
  if (!design.items.length) {announce('先在畫布加入要列印的內容。',true);return;}
  const labelId=workspace.activeId;
  const current=structuredClone(design);
  previewing=true;
  try {
    const preview=await raster(current);
    if (workspace.activeId!==labelId || document.querySelector('dialog[open]')) return;
    if (!preview.bytes.some(Boolean)) throw Error('目前的標籤沒有可列印的黑色內容。');
    pendingArt={...preview,title:current.title};
    $('print-heading').textContent=`列印「${current.title}」`;
    $('print-preview').src=pendingArt.canvas.toDataURL('image/png');
    updatePrinterControls(); printDialog.showModal();
  } catch (error) {announce(error.message,true);}
  finally {previewing=false;}
};
$('print-png').onclick=()=>{if (pendingArt) download(pendingArt.canvas.toDataURL('image/png'),'png',pendingArt.title);};
$('print-now').onclick=async ()=>{
  if (!pendingArt || printing || connecting) return;
  const job=pendingArt;
  if (!localBridge && !printer.connected && !await connect()) return;
  if (!printDialog.open || pendingArt!==job) return;
  printing=true; connectionError=''; updatePrinterControls();
  try {
    $('print-note').textContent='正在傳送點陣資料並等候 M50 完成。';
    let confirmed;
    if (localBridge) {
      const result=await bridgeRequest('print',{
        method:'POST',
        headers:{'Content-Type':'application/octet-stream','X-Print-Id':crypto.randomUUID()},
        body:makeJob(job.bytes),
      });
      if (result.sent!==true) throw Error('無法確認 M50 收到完整資料。');
      confirmed=result.printed===true;
    } else confirmed=await printer.print(job.bytes);
    printDialog.close();
    announce(confirmed?'M50 已確認這張標籤列印完成。':'資料已送達 M50，請確認標籤是否已出紙。');
  } catch (error) {
    announce(error.message,true);printDialog.close();
  } finally {printing=false;updatePrinterControls();}
};

for (const span of document.querySelectorAll('[data-ui-icon]')) if (Object.hasOwn(paths,span.dataset.uiIcon)) span.innerHTML=iconSVG(span.dataset.uiIcon);
renderLibrary();render();revealActiveTab();updatePrinterControls();
