/** `<what>-<employee code>-<which>.csv`, lowercase; an unknown sender reads `unknown`. */
export const requestCsvFilename = (what: string, employeeCode: string | null | undefined, which: string): string =>
  `${what}-${(employeeCode ?? 'unknown').toLowerCase()}-${which}.csv`;
