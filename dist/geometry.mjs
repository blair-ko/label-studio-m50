export const RESIZE_HANDLES = [
  {id:'nw',x:-1,y:-1,label:'左上角'}, {id:'n',x:0,y:-1,label:'上邊'},
  {id:'ne',x:1,y:-1,label:'右上角'}, {id:'e',x:1,y:0,label:'右邊'},
  {id:'se',x:1,y:1,label:'右下角'}, {id:'s',x:0,y:1,label:'下邊'},
  {id:'sw',x:-1,y:1,label:'左下角'}, {id:'w',x:-1,y:0,label:'左邊'},
];

const radians = degrees => degrees*Math.PI/180;
const clamp = (value,min,max) => Math.min(max,Math.max(min,value));

function rotated(x,y,angle) {
  return [x*Math.cos(angle)-y*Math.sin(angle),x*Math.sin(angle)+y*Math.cos(angle)];
}

function worldPoint(object,localX,localY) {
  const [dx,dy]=rotated(localX-object.w/2,localY-object.h/2,radians(object.rotation));
  return [object.x+object.w/2+dx,object.y+object.h/2+dy];
}

function selectionCenterOffset(object,frame) {
  const [dx,dy]=rotated(frame.x+(frame.width-object.w)/2,frame.y+(frame.height-object.h)/2,radians(object.rotation));
  return [object.w/2+dx,object.h/2+dy];
}

export function centeredPosition(object,frame,paperWidth,paperHeight) {
  const [cx,cy]=selectionCenterOffset(object,frame);
  return [paperWidth/2-cx,paperHeight/2-cy];
}

export function rotateAroundSelection(object,frame,rotation) {
  const [beforeX,beforeY]=selectionCenterOffset(object,frame);
  const [afterX,afterY]=selectionCenterOffset({...object,rotation},frame);
  return {x:object.x+beforeX-afterX,y:object.y+beforeY-afterY,rotation};
}

export function resizeObject(object,handle,dx,dy,frame) {
  const [localX,localY]=rotated(dx,dy,-radians(object.rotation));
  const sx=handle.x, sy=handle.y;
  let next={...object};
  let anchorX=sx<0?object.w:sx>0?0:object.w/2;
  let anchorY=sy<0?object.h:sy>0?0:object.h/2;
  let nextAnchorX,nextAnchorY;

  if (object.type==='text' && sx && sy) {
    // Corners scale the text proportionally around the opposite visible corner.
    const width=frame.width,height=frame.height;
    const requested=1+(sx*localX*width+sy*localY*height)/(width*width+height*height);
    const factor=clamp(requested,
      Math.max(.5/object.w,.5/object.h,.5/object.size),
      Math.min(100/object.w,60/object.h,20/object.size));
    next.w=object.w*factor;
    next.h=object.h*factor;
    next.size=object.size*factor;
    anchorX=frame.x+(sx<0?width:0);
    anchorY=frame.y+(sy<0?height:0);
    nextAnchorX=anchorX*factor;
    nextAnchorY=anchorY*factor;
  } else {
    next.w=sx?clamp(object.w+sx*localX,.5,100):object.w;
    next.h=sy?clamp(object.h+sy*localY,.5,60):object.h;
    nextAnchorX=sx<0?next.w:sx>0?0:next.w/2;
    nextAnchorY=sy<0?next.h:sy>0?0:next.h/2;
  }

  const [fixedX,fixedY]=worldPoint(object,anchorX,anchorY);
  const [movedX,movedY]=worldPoint(next,nextAnchorX,nextAnchorY);
  next.x+=fixedX-movedX;
  next.y+=fixedY-movedY;
  return next;
}

export function dragRotation(object,frame,startX,startY,x,y,snap) {
  const [offsetX,offsetY]=selectionCenterOffset(object,frame);
  const cx=object.x+offsetX,cy=object.y+offsetY;
  if (Math.hypot(x-cx,y-cy)<.01) return object.rotation;
  const start=Math.atan2(startY-cy,startX-cx);
  const current=Math.atan2(y-cy,x-cx);
  let degrees=object.rotation+(current-start)*180/Math.PI;
  if (snap) degrees=Math.round(degrees/15)*15;
  return ((degrees+180)%360+360)%360-180;
}

export function resizeCursor(handle,rotation) {
  const axis=Math.round((Math.atan2(handle.y,handle.x)*180/Math.PI+rotation)/45);
  const directions=['ew-resize','nwse-resize','ns-resize','nesw-resize'];
  return directions[(axis%4+4)%4];
}
