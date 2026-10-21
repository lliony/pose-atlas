import type { State, Card } from './types.ts';
const rows = [
 ['女性','甜美','迎着阳光，轻轻走来','花园','放松肩膀，向镜头自然走来，手臂轻摆。','把人物放在绿植之间，让背景与人物保持距离。'],
 ['女性','优雅','坐下来，留一点从容','美术馆','侧身坐下，双腿自然收拢，手轻放膝上。','用建筑线条衬托坐姿，给视线方向留白。'],
 ['女性','御姐','站稳，让目光有力量','城市','身体微侧，重心落在一侧，目光平视镜头。','保持建筑竖线稳定，干净背景突出人物气场。'],
 ['男性','清爽','迈开步子，轻松一点','林荫路','自然向前走，微微侧头，保持轻快步幅。','利用树荫形成柔光，避免面部出现斑驳强光。'],
 ['男性','斯文','翻一页书，停一会儿','图书馆','手持打开的书，视线自然落下，肩颈放松。','让窗光从侧面进入，保留书本与手部细节。'],
 ['男性','成熟','望向远处，迎着海风','海边','身体微侧，一手自然放松，视线越过镜头。','保持海平线水平，让环境衬托沉稳的状态。'],
];
export function addReferenceCards(state: State): State {
 const categoryId='reference-styles-2026';
 const existing=new Set(state.cards.map(c=>c.id));
 const cards:Card[]=rows.map(([gender,style,title,scene,pose,composition],panel)=>({
  id:`style-reference-${panel+1}`,categoryId,code:`REF-00${panel+1}`,title,gender,styles:[style],tags:[scene,style],
  notes:{pose,composition,camera:'保持自然视角，观察人物与背景的关系。',light:'优先选择柔和自然光，留意面部与背景的亮度差。',cautions:'参考姿势按现场调整，注意拍摄环境安全。'},
  images:[{id:`style-reference-image-${panel+1}`,src:'/images/pose-reference-styles.png',panel,ai:true,notes:{}}],
 })).filter(c=>!existing.has(c.id));
 if(!cards.length)return state;
 if(state.cards.length+cards.length>2000||(!state.categories.some(c=>c.id===categoryId)&&state.categories.length>=200))return state;
 return {...state,categories:state.categories.some(c=>c.id===categoryId)?state.categories:[...state.categories,{id:categoryId,name:'人物气质参考',code:'REF'}],cards:[...state.cards,...cards]};
}
