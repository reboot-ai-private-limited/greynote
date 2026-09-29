import type { FieldMasterDataPublicContract } from '@/modules/field-master-data/field-master-data.public.js';

/** What Field Activity uses of Field Master Data: who and where a call is to, and the samples it draws down. */
export type FieldMasterDataPort = Pick<
  FieldMasterDataPublicContract,
  'getDoctor' | 'getChemist' | 'getProduct' | 'getDoctorLocation' | 'getChemistLocation' | 'isAssignedToDoctor' | 'getSampleAllocation' | 'decrementRemaining'
>;
