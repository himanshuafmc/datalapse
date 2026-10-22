// The story being edited, with undo/redo. Edits mutate a working copy and
// notify listeners. Undo snapshots leave out datasets unless the edit
// changes data ({ data: true }), which keeps typing fast on big tables.

import { clone } from './dom.js';

const LIMIT = 80;

function snapshot(spec, withData) {
  if (withData) return { json: JSON.stringify(spec), data: true };
  const { datasets, ...rest } = spec;
  return { json: JSON.stringify(rest), data: false };
}

export class Store {
  constructor() {
    this.spec = null;
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
    this.lastKey = null;
    this.lastTime = 0;
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(reason) {
    for (const fn of this.listeners) fn(this.spec, reason);
  }

  /** Replace the whole story (import, sample, JSON apply). */
  load(spec, reason = 'load') {
    this.spec = clone(spec);
    this.undoStack = [];
    this.redoStack = [];
    this.lastKey = null;
    this.emit(reason);
  }

  /**
   * Edit the story. `key` groups rapid edits of the same field (typing)
   * into one undo step. opts.data: the edit changes datasets.
   */
  update(fn, key = null, opts = {}) {
    const now = performance.now();
    const coalesce = key && key === this.lastKey && now - this.lastTime < 1200 && !opts.data;
    if (!coalesce) {
      this.undoStack.push(snapshot(this.spec, !!opts.data));
      if (this.undoStack.length > LIMIT) this.undoStack.shift();
      this.redoStack = [];
    }
    this.lastKey = key;
    this.lastTime = now;
    fn(this.spec);
    this.emit(opts.data ? 'data' : 'edit');
  }

  restore(snap) {
    if (snap.data) this.spec = JSON.parse(snap.json);
    else this.spec = { ...JSON.parse(snap.json), datasets: this.spec.datasets };
  }

  undo() {
    const snap = this.undoStack.pop();
    if (!snap) return false;
    this.redoStack.push(snapshot(this.spec, snap.data));
    this.restore(snap);
    this.lastKey = null;
    this.emit('undo');
    return true;
  }

  redo() {
    const snap = this.redoStack.pop();
    if (!snap) return false;
    this.undoStack.push(snapshot(this.spec, snap.data));
    this.restore(snap);
    this.lastKey = null;
    this.emit('redo');
    return true;
  }
}
