import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { addReferenceCards } from '../src/lib/reference-cards.ts';
import { validateState } from '../src/lib/model.ts';
import type { State } from '../src/lib/types.ts';

const empty = (): State => ({ categories: [], cards: [], albums: [] });
test('adds 24 individual scene cards and four albums alongside existing references', () => {
  const state = addReferenceCards(empty());
  const cards = state.cards.filter(c => c.id.startsWith('scene-20261025-'));
  assert.equal(cards.length, 24);
  assert.equal(state.albums.length, 4);
  assert.equal(validateState(state), true);
  for (const card of cards) {
    assert.equal(card.images.length, 1);
    const image = card.images[0];
    assert.equal(image.panel, undefined);
    assert.ok(image.width && image.height);
    assert.ok(existsSync(new URL('../public' + image.src, import.meta.url)));
    assert.ok(Object.values(card.notes).every(Boolean));
  }
});
test('reloading preserves edits, deletions and existing album contents', () => {
  const state = addReferenceCards(empty());
  const card = state.cards.find(c => c.id.startsWith('scene-20261025-'))!;
  assert.ok(card);
  card.title = '我的标题';
  card.deleted = true;
  state.albums[0].cardIds = [];
  assert.equal(addReferenceCards(state), state);
  assert.equal(card.title, '我的标题');
  assert.equal(card.deleted, true);
  assert.deepEqual(state.albums[0].cardIds, []);
});
test('does not exceed category or album capacity', () => {
  const state = empty();
  state.categories = Array.from({ length: 200 }, (_, i) => ({id: `cat-${i}`, code: `${i}`, name: `${i}`}));
  state.albums = Array.from({ length: 200 }, (_, i) => ({id: `album-${i}`, name: `${i}`, description: '', cardIds: []}));
  const result = addReferenceCards(state);
  assert.equal(result.categories.length, 200);
  assert.equal(result.albums.length, 200);
  assert.equal(validateState(result), true);
});
