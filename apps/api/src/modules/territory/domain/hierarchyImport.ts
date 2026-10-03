/** One CSV row, already shape-checked: a Zone, optionally an HQ in it. */
export interface HierarchyImportRow {
  /** 1-based line number in the file (the header is line 1), for error messages. */
  line: number;
  zone: string;
  hq?: string | undefined;
}

export interface HierarchyImportError {
  line: number;
  message: string;
}

export interface HierarchyImportResult {
  dryRun: boolean;
  rows: number;
  /** What was (or, in a dry run, would be) created, as readable paths like "West Bengal / SLG-1". */
  created: { zones: string[]; hqs: string[] };
  /** How many nodes the file names that already existed and were reused as-is. */
  existing: { zones: number; hqs: number };
}
