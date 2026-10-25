import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAppearance, matchesPerson } from '../src/lib/card-appearance.ts';
import { addReferenceCards } from '../src/lib/reference-cards.ts';
import { validateState, snapshot } from '../src/lib/model.ts';
import type { State } from '../src/lib/types.ts';

test('appearance rejects stale arbitrary ratios and normalizes missing settings', () => {
  assert.deepEqual(normalizeAppearance({ratio:'7:10',frame:'bad'}),{ratio:'3:4',frame:'thin'});
  assert.deepEqual(normalizeAppearance({ratio:'16:9',frame:'none'}),{ratio:'16:9',frame:'none'});
});
test('reference addition is immutable, idempotent and preserves user edits/deletions', () => {
  const original: State = {cards:[],categories:[],albums:[]};
  const next=addReferenceCards(original);
  assert.equal(original.cards.length,0);
  assert.equal(next.cards.length,30);
  next.cards[0].deleted=true; next.cards[1].title='用户修改';
  const again=addReferenceCards(next);
  assert.equal(again.cards.length,30); assert.equal(again.cards[0].deleted,true);
  assert.equal(again.cards[1].title,'用户修改');
  assert.equal(validateState(again),true);
});
test('gender and style filtering compose, and old cards remain unclassified', () => {
  const s=addReferenceCards({cards:[],categories:[],albums:[]});
  assert.equal(s.cards.filter(c=>c.id.startsWith('style-reference-') && matchesPerson(c,'男性','全部')).length,3);
  assert.equal(s.cards.filter(c=>matchesPerson(c,'女性','优雅')).length,1);
  const old={...s.cards[0],gender:undefined,styles:undefined};
  assert.equal(matchesPerson(old,'未分类','未分类'),true);
  assert.equal(matchesPerson(old,'女性','全部'),false);
});
test('sharing preserves classification and sprite panel, omits private notes', () => {
  const s=addReferenceCards({cards:[],categories:[],albums:[]});
  s.cards[5].privateNote='私人';
  const pub=snapshot(s,{id:'album',name:'测试',description:'',cardIds:[s.cards[5].id]});
  assert.equal(pub.cards[0].gender,'男性');
  assert.deepEqual(pub.cards[0].styles,['成熟']);
  assert.equal(pub.cards[0].images[0].panel,5);
  assert.equal(pub.cards[0].privateNote,undefined);
  s.cards[0].gender='invalid'; assert.throws(()=>validateState(s));
});
