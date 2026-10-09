'use client';

import { useMemo } from 'react';
import { buildPreview, buildStructure, editorRows, type StructureDraft } from '../lib/ctcStructure';
import { useCtcPreview, usePayComponents } from './useCtc';

/**
 * Everything the CTC editor and the screen around it need from one CTC and one structure draft: the org components, the
 * rows the table shows, the live breakdown, and whether the form can be saved (the server accepted the numbers).
 */
export function useCtcEditor(ctc: string, structure: StructureDraft) {
  const components = usePayComponents();
  const org = useMemo(() => components.data ?? [], [components.data]);
  const orgCodes = useMemo(() => org.map((c) => c.code), [org]);
  const preview = useCtcPreview(buildPreview(ctc, structure, orgCodes));
  const rows = useMemo(() => editorRows(org, structure), [org, structure]);
  const structureErrors = useMemo(
    () => buildStructure(structure, orgCodes).errors,
    [structure, orgCodes],
  );
  const previewError = preview.error instanceof Error ? preview.error.message : undefined;
  // `placeholderData` keeps the last result on screen while a new one loads: do not save against a stale one.
  const settled = Boolean(preview.data) && !preview.isFetching && !previewError;
  return {
    components,
    org,
    orgCodes,
    rows,
    preview,
    previewError,
    structureErrors,
    canSave: settled && Object.keys(structureErrors).length === 0,
  };
}

export type CtcEditorState = ReturnType<typeof useCtcEditor>;
