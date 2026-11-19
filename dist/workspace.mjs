import {normalize} from './art.mjs';

const newId = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
export const createLabel = design => ({id:newId(),design});
export function createWorkspace(design) {
  const label=createLabel(design);
  return {version:2,activeId:label.id,labels:[label]};
}

export function readWorkspace(input) {
  if (input?.version!==2) return createWorkspace(normalize(input));
  if (!Array.isArray(input.labels) || input.labels.length===0) throw Error('專案檔至少要有一張標籤。');

  const ids=new Set();
  const labels=input.labels.map(record=>{
    const label=createLabel(normalize(record?.design));
    if (typeof record.id==='string' && /^[a-z0-9-]{1,70}$/i.test(record.id) && !ids.has(record.id)) {
      label.id=record.id;
    }
    ids.add(label.id);
    return label;
  });
  return {version:2,activeId:ids.has(input.activeId)?input.activeId:labels[0].id,labels};
}
