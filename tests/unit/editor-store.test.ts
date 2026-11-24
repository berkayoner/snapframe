import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '@/src/editor/store/editorStore';
import type { EditorObject } from '@/src/shared/types';

const store = () => useEditorStore.getState();

const image: EditorObject = { id: 'img', type: 'image', x: 0, y: 0, width: 1000, height: 600 };
const rect = (id: string, x = 10, y = 10): EditorObject => ({
  id,
  type: 'shape',
  x,
  y,
  width: 100,
  height: 50,
  style: { stroke: '#ff3b30', strokeWidth: 4, fillMode: 'none', cornerRadius: 0 },
});

beforeEach(() => {
  store().initObjects([image], { width: 1000, height: 600 }, 2);
});

describe('history', () => {
  it('adds, undoes and redoes as single steps', () => {
    store().addObject(rect('a'));
    store().addObject(rect('b'));
    expect(store().objects.map((o) => o.id)).toEqual(['img', 'a', 'b']);
    store().undo();
    expect(store().objects.map((o) => o.id)).toEqual(['img', 'a']);
    store().redo();
    expect(store().objects.map((o) => o.id)).toEqual(['img', 'a', 'b']);
  });

  it('a new edit clears the redo stack', () => {
    store().addObject(rect('a'));
    store().undo();
    store().addObject(rect('b'));
    expect(store().future).toHaveLength(0);
  });

  it('coalesces continuous edits (slider drags) into one undo step', () => {
    store().addObject(rect('a'));
    const steps = store().past.length;
    for (const width of [2, 4, 6, 8]) {
      store().updateObjects([{ id: 'a', patch: { style: { strokeWidth: width } } }], { coalesce: 'a:stroke' });
    }
    expect(store().past.length).toBe(steps + 1);
    store().endCoalesce();
    store().updateObjects([{ id: 'a', patch: { x: 50 } }], { coalesce: 'a:stroke' });
    expect(store().past.length).toBe(steps + 2);
  });

  it('erases an abandoned new label from history entirely', () => {
    const steps = store().past.length;
    store().addObject({ id: 't', type: 'text', x: 0, y: 0, width: 10, height: 10 }, { coalesce: 'text:t' });
    store().removeObject('t', { coalesce: 'text:t' });
    expect(store().objects.some((o) => o.id === 't')).toBe(false);
    expect(store().past.length).toBe(steps);
  });
});

describe('locked base screenshot', () => {
  it('cannot be selected, deleted, nudged or copied', () => {
    store().select('img');
    expect(store().selectedIds).toEqual([]);
    store().selectAll();
    expect(store().selectedIds).toEqual([]);

    store().addObject(rect('a'));
    store().selectMany(['img', 'a']);
    expect(store().selectedIds).toEqual(['a']);
    store().deleteSelection();
    expect(store().objects.map((o) => o.id)).toEqual(['img']);
  });

  it('stays at the bottom when annotations are sent to back', () => {
    store().addObject(rect('a'));
    store().addObject(rect('b'));
    store().select('b');
    store().sendToBack();
    expect(store().objects.map((o) => o.id)).toEqual(['img', 'b', 'a']);
    store().select('b');
    store().bringToFront();
    expect(store().objects.map((o) => o.id)).toEqual(['img', 'a', 'b']);
  });
});

describe('crop', () => {
  it('re-bases every object and shrinks the canvas, undoably', () => {
    store().addObject(rect('a', 300, 200));
    store().applyCrop({ x: 100, y: 50, width: 400, height: 300 });
    const state = store();
    expect([state.canvasWidth, state.canvasHeight]).toEqual([400, 300]);
    expect(state.objects.find((o) => o.id === 'img')).toMatchObject({ x: -100, y: -50 });
    expect(state.objects.find((o) => o.id === 'a')).toMatchObject({ x: 200, y: 150 });
    store().undo();
    expect([store().canvasWidth, store().canvasHeight]).toEqual([1000, 600]);
  });

  it('ignores degenerate crops', () => {
    const before = store().past.length;
    store().applyCrop({ x: 0, y: 0, width: 0, height: 10 });
    expect(store().past.length).toBe(before);
  });
});

describe('clipboard', () => {
  it('pastes copies offset by the capture pixel ratio and cascades', () => {
    store().addObject(rect('a', 10, 10));
    store().select('a');
    store().copySelection();
    store().paste();
    store().paste();
    const pasted = store().objects.slice(-2);
    expect(pasted.map((o) => [o.x, o.y])).toEqual([
      [42, 42],
      [74, 74],
    ]);
    expect(new Set(store().objects.map((o) => o.id)).size).toBe(store().objects.length);
  });
});

describe('styling', () => {
  it('recolors the selection and scales stroke width by the capture unit', () => {
    store().addObject(rect('a'));
    store().select('a');
    store().applyColor('#007aff');
    store().applyStrokeWidth(6);
    const a = store().objects.find((o) => o.id === 'a');
    expect(a?.style).toMatchObject({ stroke: '#007aff', strokeWidth: 12 });
  });

  it('recolors a text label background and keeps the text readable', () => {
    store().addObject({
      id: 't',
      type: 'text',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      style: { text: 'Hi', backgroundColor: '#ff3b30', color: '#ffffff' },
    });
    store().select('t');
    store().applyColor('#ffcc00');
    expect(store().objects.find((o) => o.id === 't')?.style).toMatchObject({
      backgroundColor: '#ffcc00',
      color: '#111111',
    });
  });
});
