/**
 * Reads an .xlsx the server made (the very file the Download button saves) into plain rows for the on-screen grid, so the screen and the file can never
 * disagree. exceljs is loaded on demand: it is large and only the sheet screens need it.
 */
export type SheetCell = {
  text: string;
  isNumber: boolean;
  bold: boolean;
  bg: string | null;
  color: string | null;
  colSpan: number;
  rowSpan: number;
  /** Covered by a merged cell that starts elsewhere: not drawn. */
  covered: boolean;
};

export type SheetData = {
  name: string;
  columns: number;
  /** Column widths in pixels. */
  widths: number[];
  rows: SheetCell[][];
  frozenRows: number;
  frozenCols: number;
};

const EMPTY: SheetCell = { text: '', isNumber: false, bold: false, bg: null, color: null, colSpan: 1, rowSpan: 1, covered: false };

const argbToCss = (argb: string | undefined): string | null => (argb && /^[0-9A-Fa-f]{8}$/.test(argb) ? `#${argb.slice(2)}` : null);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Letters for a 1-based column number: 1 → A, 27 → AA. */
export function columnLetters(n: number): string {
  let s = '';
  for (let c = n; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + ((c - 1) % 26)) + s;
  return s;
}

/** How a figure is shown, from the cell's Excel number format: its decimals ("0.00" → 2) and whether it groups thousands. */
function formatNumber(n: number, numFmt: string | undefined): string {
  if (!Number.isFinite(n)) return '—';
  const decimals = /0\.(0+)/.exec(numFmt ?? '')?.[1]?.length;
  return n.toLocaleString('en-IN', decimals === undefined ? { maximumFractionDigits: 2 } : { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Excel's own answer, kept in the file beside a formula; null when the file did not store one. */
function cachedResult(value: object): { has: boolean; result: unknown } {
  return 'result' in value && (value as { result: unknown }).result !== undefined ? { has: true, result: (value as { result: unknown }).result } : { has: false, result: undefined };
}

type Raw = (row: number, col: number) => unknown;

const COL = /^([A-Z]{1,3})(\d{1,6})$/;
const colNumber = (letters: string): number => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

/**
 * Works out the few formulas the server writes (SUM over a range, + - * / ( ), IF, a cell reference, = < > comparisons) for a cell the file stored no answer
 * for. Anything else, or any error, is null. It is a small parser over the formula's own characters: nothing from the file is ever run as code.
 */
export function evaluateFormula(formula: string, raw: Raw, depth = 0): number | null {
  if (depth > 20 || !/^[A-Z0-9:+\-*/().,=<> $]+$/.test(formula)) return null;
  const src = formula.replace(/\$/g, '').replace(/\s+/g, '');
  let i = 0;
  const cellNumber = (ref: string): number => {
    const m = COL.exec(ref);
    if (!m) throw new Error('ref');
    return numberAt(raw, Number(m[2]), colNumber(m[1]!), depth + 1);
  };
  const eat = (t: string): boolean => (src.startsWith(t, i) ? ((i += t.length), true) : false);
  type V = number | number[];
  const scalar = (v: V): number => (Array.isArray(v) ? (v[0] ?? 0) : v);
  const cmp = (): V => {
    const left = add();
    for (const op of ['<>', '<=', '>=', '=', '<', '>']) {
      if (eat(op)) {
        const l = scalar(left);
        const r = scalar(add());
        return Number(op === '<>' ? l !== r : op === '<=' ? l <= r : op === '>=' ? l >= r : op === '=' ? l === r : op === '<' ? l < r : l > r);
      }
    }
    return left;
  };
  const add = (): V => {
    let v = mul();
    for (;;) {
      if (eat('+')) v = scalar(v) + scalar(mul());
      else if (eat('-')) v = scalar(v) - scalar(mul());
      else return v;
    }
  };
  const mul = (): V => {
    let v = unary();
    for (;;) {
      if (eat('*')) v = scalar(v) * scalar(unary());
      else if (eat('/')) {
        // Not an error here: an IF may not pick this branch. A NaN that reaches the end is shown as a dash.
        v = scalar(v) / scalar(unary());
      } else return v;
    }
  };
  const unary = (): V => (eat('-') ? -scalar(unary()) : primary());
  const primary = (): V => {
    if (eat('(')) {
      const v = cmp();
      if (!eat(')')) throw new Error('paren');
      return v;
    }
    const num = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (num) {
      i += num[0].length;
      return Number(num[0]);
    }
    const word = /^[A-Z]+\d*/.exec(src.slice(i));
    if (!word) throw new Error('token');
    const isCall = src[i + word[0].length] === '(';
    if (!isCall && !COL.test(word[0])) throw new Error('word');
    if (!isCall) {
      i += word[0].length;
      if (!eat(':')) return cellNumber(word[0]);
      const end = /^[A-Z]{1,3}\d{1,6}/.exec(src.slice(i));
      if (!end) throw new Error('range');
      i += end[0].length;
      const a = COL.exec(word[0])!;
      const b = COL.exec(end[0])!;
      const out: number[] = [];
      for (let r = Number(a[2]); r <= Number(b[2]); r++) for (let c = colNumber(a[1]!); c <= colNumber(b[1]!); c++) out.push(numberAt(raw, r, c, depth + 1));
      return out;
    }
    i += word[0].length;
    if (!eat('(')) throw new Error('fn');
    const args: V[] = [];
    if (!eat(')')) {
      do args.push(cmp());
      while (eat(','));
      if (!eat(')')) throw new Error('paren');
    }
    if (word[0] === 'SUM') return args.flat().reduce((n, v) => n + v, 0);
    if (word[0] === 'IF') return scalar(args[0] ?? 0) ? scalar(args[1] ?? 0) : scalar(args[2] ?? 0);
    throw new Error('fn');
  };
  try {
    const v = scalar(cmp());
    return i === src.length && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/** The number a cell stands for, 0 for blank or text (as a spreadsheet adds it). */
function numberAt(raw: Raw, row: number, col: number, depth: number): number {
  const v = raw(row, col);
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o = v as { formula?: string; sharedFormula?: string };
    const cached = cachedResult(o);
    if (cached.has && typeof cached.result === 'number') return cached.result;
    if (o.formula) return evaluateFormula(o.formula, raw, depth) ?? 0;
  }
  return 0;
}

/** What a cell shows, from its stored value. Never an object: what cannot be read is shown blank. */
export function plainValue(value: unknown, numFmt?: string, raw?: Raw, depth = 0): { text: string; isNumber: boolean } {
  if (value === null || value === undefined) return { text: '', isNumber: false };
  if (typeof value === 'number') return { text: formatNumber(value, numFmt), isNumber: true };
  if (typeof value === 'string') return { text: value, isNumber: false };
  if (typeof value === 'boolean') return { text: value ? 'Yes' : 'No', isNumber: false };
  if (value instanceof Date) return { text: `${String(value.getUTCDate()).padStart(2, '0')}-${MONTHS[value.getUTCMonth()]}-${value.getUTCFullYear()}`, isNumber: false };
  if (typeof value === 'object' && depth < 5) {
    const v = value as { richText?: { text: string }[]; text?: unknown; error?: string; formula?: string; sharedFormula?: string; hyperlink?: string };
    if (v.richText) return { text: v.richText.map((r) => r.text).join(''), isNumber: false };
    if (v.error) return { text: v.error, isNumber: false };
    const cached = cachedResult(v);
    if (cached.has) return plainValue(cached.result, numFmt, raw, depth + 1);
    if (typeof v.formula === 'string') {
      const n = raw ? evaluateFormula(v.formula, raw) : null;
      return n === null ? { text: '—', isNumber: false } : { text: formatNumber(n, numFmt), isNumber: true };
    }
    if (v.sharedFormula !== undefined) return { text: '—', isNumber: false };
    if (v.text !== undefined) return plainValue(v.text, numFmt, raw, depth + 1);
    if (typeof v.hyperlink === 'string') return { text: v.hyperlink, isNumber: false };
  }
  return { text: '', isNumber: false };
}

export async function readSheets(file: Blob): Promise<SheetData[]> {
  const ExcelJS = (await import('exceljs')).default;
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await file.arrayBuffer());
  const sheets: SheetData[] = [];
  book.eachSheet((ws) => {
    const columns = Math.max(ws.columnCount, 1);
    const rowCount = Math.max(ws.rowCount, 1);
    const raw: Raw = (row, col) => ws.getCell(row, col).value;
    const rows: SheetCell[][] = [];
    for (let r = 1; r <= rowCount; r++) {
      const row: SheetCell[] = [];
      for (let c = 1; c <= columns; c++) {
        const cell = ws.getCell(r, c);
        const { text, isNumber } = plainValue(cell.value, cell.numFmt, raw);
        const fill = cell.fill as { type?: string; fgColor?: { argb?: string } } | undefined;
        row.push({
          ...EMPTY,
          text,
          isNumber,
          bold: Boolean(cell.font?.bold),
          bg: fill?.type === 'pattern' ? argbToCss(fill.fgColor?.argb) : null,
          color: argbToCss(cell.font?.color?.argb),
        });
      }
      rows.push(row);
    }
    // Merged ranges ("A1:C1"): the first cell spans, the others are covered.
    const merges = ((ws.model as unknown as { merges?: string[] }).merges ?? []);
    for (const range of merges) {
      const [from, to] = range.split(':');
      if (!from || !to) continue;
      const a = ws.getCell(from);
      const b = ws.getCell(to);
      const first = rows[Number(a.row) - 1]?.[Number(a.col) - 1];
      if (!first) continue;
      first.colSpan = Number(b.col) - Number(a.col) + 1;
      first.rowSpan = Number(b.row) - Number(a.row) + 1;
      for (let r = Number(a.row); r <= Number(b.row); r++) {
        for (let c = Number(a.col); c <= Number(b.col); c++) {
          if (r === Number(a.row) && c === Number(a.col)) continue;
          const covered = rows[r - 1]?.[c - 1];
          if (covered) covered.covered = true;
        }
      }
    }
    const widths = Array.from({ length: columns }, (_, i) => Math.round(Math.min(Math.max(ws.getColumn(i + 1).width ?? 10, 6), 60) * 7 + 10));
    const view = ws.views?.[0] as { state?: string; xSplit?: number; ySplit?: number } | undefined;
    const frozen = view?.state === 'frozen';
    sheets.push({ name: ws.name, columns, widths, rows, frozenRows: frozen ? (view?.ySplit ?? 0) : 0, frozenCols: frozen ? (view?.xSplit ?? 0) : 0 });
  });
  return sheets;
}
