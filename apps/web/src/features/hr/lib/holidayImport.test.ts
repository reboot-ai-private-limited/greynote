import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/ApiError';
import { fileProblem, importProblems } from './holidayImport';

const apiError = (data: unknown) =>
  new ApiError({
    success: false,
    statusCode: 400,
    code: 'BAD_REQUEST',
    request: { requestId: 'r' } as never,
    message: 'The file has 1 problem(s); nothing was imported.',
    data,
  });

describe('importProblems', () => {
  it('lists the lines the API refused', () => {
    expect(
      importProblems(apiError({ errors: [{ line: 3, message: 'Zone "X" doesn’t exist.' }] })),
    ).toEqual([{ line: 3, message: 'Zone "X" doesn’t exist.' }]);
  });
  it('falls back to the message', () => {
    expect(importProblems(apiError(undefined))).toEqual([
      { line: 0, message: 'The file has 1 problem(s); nothing was imported.' },
    ]);
    expect(importProblems(new Error('Network down'))).toEqual([
      { line: 0, message: 'Network down' },
    ]);
  });
});

describe('fileProblem', () => {
  it('wants a small .csv', () => {
    expect(fileProblem(new File(['a'], 'h.csv'))).toBeNull();
    expect(fileProblem(new File(['a'], 'h.xlsx'))).toMatch(/csv/);
    expect(fileProblem(new File([new Uint8Array(1024 * 1024 + 1)], 'h.csv'))).toMatch(/1 MB/);
  });
});
