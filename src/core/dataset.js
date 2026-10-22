// Datasets inside a story spec are column-major tables:
//   { "index": [1960, 1961, ...], "columns": ["India", ...], "values": [[...], ...] }
// values[j][k] is column j at index[k]; null means "no data" (NaN).

export class Dataset {
  constructor(raw, id = '') {
    if (!raw || !Array.isArray(raw.index) || !Array.isArray(raw.columns) || !Array.isArray(raw.values)) {
      throw new Error(`Dataset "${id}" needs "index", "columns" and "values" arrays`);
    }
    if (raw.values.length !== raw.columns.length) {
      throw new Error(`Dataset "${id}": ${raw.columns.length} columns but ${raw.values.length} value arrays`);
    }
    this.id = id;
    this.columns = raw.columns.map(String);
    const order = raw.index.map((v, k) => [Number(v), k]);
    // Keep data sorted by time (DataFrame.sort_index()).
    const sorted = order.every((o, k) => k === 0 || order[k - 1][0] <= o[0]);
    if (!sorted) order.sort((a, b) => a[0] - b[0]);
    this.index = Float64Array.from(order.map((o) => o[0]));
    this._cols = new Map();
    raw.values.forEach((arr, j) => {
      const col = new Float64Array(order.length);
      for (let k = 0; k < order.length; k++) {
        const v = arr[order[k][1]];
        col[k] = v == null || v === '' ? NaN : Number(v);
      }
      this._cols.set(this.columns[j], col);
    });
  }

  has(name) {
    return this._cols.has(name);
  }

  /** Column values (NaN for missing). */
  col(name) {
    const c = this._cols.get(name);
    if (!c) throw new Error(`Dataset "${this.id}" has no column "${name}"`);
    return c;
  }

  /** Column with missing values as 0 (pandas fillna(0)). */
  colFilled(name) {
    return this.col(name).map((v) => (Number.isNaN(v) ? 0 : v));
  }

  get first() {
    return this.index[0];
  }

  get last() {
    return this.index[this.index.length - 1];
  }
}

export function datasetFromRows(index, columns, rowsByColumn) {
  return { index, columns, values: rowsByColumn };
}
