'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { columnLetters, readSheets, type SheetCell, type SheetData } from '../lib/readSheet';

const ROW_H = 28;
const GUTTER_W = 44;

/** One sheet as an Excel-style grid: row numbers, column letters, frozen header rows and first columns, and its own horizontal and vertical scroll. */
function Grid({ sheet }: { sheet: SheetData }) {
  const lefts: number[] = [];
  let acc = GUTTER_W;
  sheet.widths.forEach((w, i) => {
    lefts[i] = acc;
    acc += w;
  });
  const letters = sheet.widths.map((_, i) => columnLetters(i + 1));
  const headTop = ROW_H; // the column-letter strip
  return (
    <div className="max-h-[70vh] overflow-auto rounded-md border border-border bg-surface">
      <table className="border-separate border-spacing-0 text-xs" style={{ width: acc, tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: GUTTER_W }} />
          {letters.map((l, i) => (
            <col key={l} style={{ width: sheet.widths[i] }} />
          ))}
        </colgroup>
        <thead>
          <tr style={{ height: ROW_H }}>
            <th className="sticky left-0 top-0 z-30 border-b border-r border-border bg-surface-subtle" />
            {letters.map((l, i) => (
              <th
                key={l}
                className="sticky top-0 z-20 border-b border-r border-border bg-surface-subtle font-normal text-text-muted"
                style={i < sheet.frozenCols ? { left: lefts[i], zIndex: 25 } : undefined}
              >
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((row, r) => (
            <tr key={r} style={{ height: ROW_H }}>
              <td
                className="sticky left-0 z-10 border-b border-r border-border bg-surface-subtle text-center text-text-muted"
                style={r < sheet.frozenRows ? { top: headTop + r * ROW_H, zIndex: 20 } : undefined}
              >
                {r + 1}
              </td>
              {row.map((cell, c) => (cell.covered ? null : <Cell key={c} cell={cell} frozenRow={r < sheet.frozenRows} frozenCol={c < sheet.frozenCols} top={headTop + r * ROW_H} left={lefts[c] ?? 0} />))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ cell, frozenRow, frozenCol, top, left }: { cell: SheetCell; frozenRow: boolean; frozenCol: boolean; top: number; left: number }) {
  const sticky = frozenRow || frozenCol;
  const style: CSSProperties = { backgroundColor: cell.bg ?? undefined, color: cell.color ?? undefined };
  if (frozenRow) style.top = top;
  if (frozenCol) style.left = left;
  if (sticky) style.zIndex = frozenRow && frozenCol ? 15 : 5;
  return (
    <td
      colSpan={cell.colSpan}
      rowSpan={cell.rowSpan}
      title={cell.text}
      style={style}
      className={`overflow-hidden text-ellipsis whitespace-nowrap border-b border-r border-border px-2 ${cell.isNumber ? 'text-right tabular-nums' : ''} ${cell.bold ? 'font-semibold' : ''} ${sticky && !cell.bg ? 'bg-surface' : ''} ${sticky ? 'sticky' : ''}`}
    >
      {cell.text}
    </td>
  );
}

/** The Excel file the server made, shown as a scrollable sheet (one tab per sheet in the file). */
export function SheetViewer({ file }: { file: Blob }) {
  const [sheets, setSheets] = useState<SheetData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setSheets(null);
    setError(null);
    readSheets(file).then(
      (s) => live && setSheets(s),
      () => live && setError('Could not show this file here. Use Download Excel instead.'),
    );
    return () => {
      live = false;
    };
  }, [file]);

  if (error) return <p role="alert" className="text-sm text-danger">{error}</p>;
  if (!sheets) return <Skeleton className="h-96 w-full" />;
  if (sheets.length === 1 && sheets[0]) return <Grid sheet={sheets[0]} />;
  return (
    <Tabs defaultValue={sheets[0]?.name ?? ''} className="grid gap-3">
      <TabsList>
        {sheets.map((s) => (
          <TabsTrigger key={s.name} value={s.name}>
            {s.name}
          </TabsTrigger>
        ))}
      </TabsList>
      {sheets.map((s) => (
        <TabsContent key={s.name} value={s.name}>
          <Grid sheet={s} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
