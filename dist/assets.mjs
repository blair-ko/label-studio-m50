import {PRINT_GUIDE_HEIGHT_MM} from './printer.mjs?v=20261125-5';

export const paths = {
  box:'M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10 M7.5 5l9 4',
  tools:'M14 6l4 4 3-3a6 6 0 0 1-8 7l-6 6a2 2 0 0 1-3-3l6-6a6 6 0 0 1 7-8z',
  screw:'M7 4h10v5H7z M10 9v11h4V9 M9 12l6-2m-6 5 6-2m-6 5 6-2',
  bolt:'M9 3L4 11h7l-1 10 10-12h-8l1-6z',
  plug:'M8 3v5m8-5v5M5 8h14v3a7 7 0 0 1-14 0z M12 18v4',
  usb:'M12 21V3m-3 3 3-3 3 3M12 17l6-5v-3h-3v3h3M12 14L6 10V8 M4 6h4v2H4z',
  battery:'M2 7h17v10H2z M21 10v4 M6 12h4m-2-2v4m5-2h3',
  chip:'M6 6h12v12H6z M9 9h6v6H9z M8 3v3m4-3v3m4-3v3M8 18v3m4-3v3m4-3v3M3 8h3m-3 4h3m-3 4h3m12-8h3m-3 4h3m-3 4h3',
  mug:'M4 5h13v9a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z M17 7h2a2 2 0 0 1 2 2v2a3 3 0 0 1-3 3h-1 M3 22h16',
  bean:'M19 5c4 4 1 10-3 13S7 23 4 19C1 15 3 9 7 6s9-5 12-1z M6 19c0-6 10-8 12-14',
  jar:'M7 3h10v4H7z M7 7l-2 4v9h14v-9l-2-4z M5 12h14m-14 5h14',
  utensils:'M4 3v6a3 3 0 0 0 6 0V3 M7 3v18 M18 3c-3 3-4 6-4 10h4m0-10v18',
  leaf:'M3 18C5 8 9 5 21 3c-1 10-3 15-11 15H3z M3 21l12-11',
  flower:'M12 9c-4-7 4-9 4-4l-1 4c6-3 9 3 3 4l-3 1c4 4-1 8-3 4l-1-3c-4 5-9 1-5-2l4-1c-7 0-7-6-2-5z',
  water:'M12 3C8 8 5 12 5 15a7 7 0 0 0 14 0c0-3-3-7-7-12z M8 15c0 2 1 3 3 3',
  snow:'M12 2v20 M3 7l18 10M3 17 21 7M9 4l3 3 3-3m-6 16 3-3 3 3M4 10l4-1-1-4m10 14-1-4 4-1M7 19l1-4-4-1m16-4-4-1 1-4',
  sun:'M16 12a4 4 0 1 0-8 0 4 4 0 1 0 8 0z M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
  heart:'M12 20 4 12C-1 7 6 1 12 7c6-6 13 0 8 5z',
  star:'m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
  gift:'M3 7h18v5H3z M5 12v9h14v-9 M12 7v14 M12 7C2 7 7-2 12 7c5-9 10 0 0 0z',
  bag:'M4 8h16l1 13H3z M8 9V6a4 4 0 0 1 8 0v3',
  shirt:'m8 3-6 4 3 5 3-2v11h8V10l3 2 3-5-6-4c0 4-8 4-8 0z',
  hanger:'M10 6a2 2 0 1 1 3 2l-1 2v2l9 5v2H3v-2l9-5',
  house:'m2 11 10-8 10 8 M5 10v11h14V10 M10 21v-6h4v6',
  key:'M14 14a5 5 0 1 0-4-4l-7 7v4h4v-3h3v-3z M16 8h.1',
  folder:'M3 5h7l2 2h9v12H3z',
  book:'M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3z M12 6v15',
  calendar:'M3 5h18v16H3z M3 10h18m-13-7v5m8-5v5 M8 15h3m2 0h3',
  clock:'M21 12a9 9 0 1 0-18 0 9 9 0 1 0 18 0z M12 6v6l4 2',
  camera:'M3 7h4l2-3h6l2 3h4v13H3z M16 13a4 4 0 1 0-8 0 4 4 0 1 0 8 0z',
  mountain:'m2 19 7-13 5 8 3-5 5 10z M6 11l3 2 3-2',
  pin:'M12 22c6-7 8-10 8-13A8 8 0 0 0 4 9c0 3 2 6 8 13z M15 9a3 3 0 1 0-6 0 3 3 0 1 0 6 0z',
  warning:'m12 3 10 18H2z M12 9v5m0 3h.1',
  recycle:'M8 7l4-5 4 6m-4 0 4 .5 1-4 M18 11l3 6h-7m2-3-3 3 3 3 M9 19H3l3-6m2 3-2-3-4 1',
  check:'m4 12 5 5L20 6',
  cross:'m6 6 12 12M18 6 6 18',
  arrow:'M3 12h18m-7-7 7 7-7 7',
  sparkle:'M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z',
  dog:'M8 4l-5 6 2 4 3-2v4a4 4 0 0 0 8 0v-4l3 2 2-4-5-6z M9 11h.1m6 0h.1M11 15h2l-1 2z',
  paw:'M5 10c-3 0-3 5 0 5s3-5 0-5zm4-6c-3 0-3 6 0 6s3-6 0-6zm6 0c-3 0-3 6 0 6s3-6 0-6zm4 6c-3 0-3 5 0 5s3-5 0-5z M12 12c-2 0-6 3-6 6s3 3 6 2c3 1 6 1 6-2s-4-6-6-6z',
  print:'M6 9V3h12v6M6 18H3v-9h18v9h-3 M6 14h12v8H6z M17 12h1',
  upload:'M12 16V3M7 8l5-5 5 5M4 15v6h16v-6',
  download:'M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5',
  undo:'M9 4 3 10l6 6 M3 10h11a6 6 0 1 1 0 12',
  redo:'m15 4 6 6-6 6m6-6H10a6 6 0 1 0 0 12',
  ruler:'M2 8h20v8H2z M6 8v4m4-4v3m4-3v4m4-4v3',
  duplicate:'M8 8h13v13H8z M16 4H4v12',
  up:'M12 20V4m-5 5 5-5 5 5',
  down:'M12 4v16m-5-5 5 5 5-5',
  trash:'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
  image:'M3 4h18v16H3z M3 18l6-7 4 4 3-3 5 5 M16 8h.1',
};
export const symbols = {
  box:'收納箱 收納',tools:'扳手 工具',screw:'螺絲 零件',bolt:'閃電 電器',plug:'插頭 電源',usb:'USB 傳輸線',battery:'電池 電量',chip:'電路 晶片',
  mug:'杯子 茶',bean:'咖啡 咖啡豆',jar:'罐子 調味料',utensils:'餐具 食品',leaf:'植物 葉子',flower:'花朵 園藝',water:'水滴',snow:'雪花 冷凍',
  sun:'太陽',heart:'愛心',star:'星星',gift:'禮物',bag:'提袋',shirt:'衣服',hanger:'衣架',house:'房子 家用',key:'鑰匙',folder:'資料夾 文件',
  book:'書本',calendar:'日期 行事曆',clock:'時鐘',camera:'相機',mountain:'山峰',pin:'地點',warning:'警告',recycle:'回收',
  check:'勾選 完成',cross:'叉叉',arrow:'箭頭',sparkle:'亮光',dog:'狗 寵物',paw:'腳印 寵物',
};
export const shapes = {
  rect:'矩形',rounded:'圓角矩形',ellipse:'橢圓',line:'直線',triangle:'三角形',diamond:'菱形',hexagon:'六角形',burst:'星形',
};

export const fonts = {
  sans:'系統黑體', serif:'宋體／明體', rounded:'粉圓體（繁中）', mono:'等寬體', condensed:'窄體（英數）',
};
export const fontStacks = {
  sans:'Arial, "PingFang TC", "Microsoft JhengHei", sans-serif',
  serif:'Georgia, "Songti TC", "PMingLiU", serif',
  rounded:'"Arial Rounded MT Bold", "PingFang TC", sans-serif',
  mono:'Menlo, Consolas, "PingFang TC", monospace',
  condensed:'"Arial Narrow", "Helvetica Neue", "PingFang TC", sans-serif',
};

const txt = (text,x,y,w,h,size,extra={}) => ({type:'text',text,x,y,w,h,size,...extra});
const icon = (key,x,y,w,h) => ({type:'icon',key,x,y,w,h});
const shape = (key,x,y,w,h,extra={}) => ({type:'shape',key,x,y,w,h,...extra});
const templateHeight = 14;
function templateBorder(length, stroke) {
  // Keep the stroke clear of the measured print limits and center the frame on the paper.
  const sideInset = 1;
  const verticalInset = (templateHeight - PRINT_GUIDE_HEIGHT_MM) / 2 + .5;
  return shape('rounded',sideInset,verticalInset,length-2*sideInset,templateHeight-2*verticalInset,{stroke});
}
function split(title, main, sub, symbol, length=40) {
  return {title,length,height:templateHeight,items:[
    templateBorder(length,.25),
    icon(symbol,2.2,3.5,7,7),
    shape('line',11,1.9,.1,10.2,{vertical:true,stroke:.23}),
    txt(main,13,2.4,length-15,5.4,3.6,{bold:true}),
    txt(sub,13,8.65,length-15,3.5,1.62,{font:'mono',bold:true}),
  ]};
}
export const templates = [
  split('工具收納','零件收納','PARTS & TOOLS','komame/workshop/toolbox'),
  split('咖啡罐','深焙咖啡','DARK ROAST','komame/kitchen/coffee'),
  split('冷凍食品','冷凍保存','FREEZER /  DATE ___','komame/parcel/frozen',50),
  split('電子零件','電源線材','POWER CABLES','komame/electronics/power'),
  split('盆栽識別','迷迭香','ROSEMARY','komame/pets/sprout',30),
  {title:'圓角姓名貼',length:30,height:templateHeight,items:[
    templateBorder(30,.33),
    txt('你的姓名',2,2.2,26,5,3.5,{bold:true,align:'center'}),
    txt('NAME LABEL',2,8,26,3,1.65,{font:'mono',align:'center'}),
  ]},
  {title:'線材識別',length:30,height:templateHeight,items:[
    icon('komame/electronics/usb',2,3.6,6.8,6.8),
    txt('USB-C',10.5,3,18,5,3.8,{bold:true}),
    txt('DATA & POWER',10.5,8.65,18,3.4,1.4,{font:'mono'}),
  ]},
  {title:'空白標籤',length:40,height:templateHeight,items:[]},
];
