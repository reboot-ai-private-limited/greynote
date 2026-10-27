/**
 * The seller block printed at the head of every Tax Invoice, as on the invoice the office issues today (Sale 3452, 26-10-2026). Hard-coded: the app
 * keeps no company settings, and nothing about the printout is stored. Change it here when the company's details change.
 */
export const COMPANY = {
  name: 'GREYNOTE HEALTH CARE',
  addressLines: ['BANESHWAR MORE ,NEAR EKTIASHAL BAZAR, BOT TOLA SILIGURI', 'WEST BENGAL 734006 FSSAI NO -12823006000035.', 'Licence No. WB/JPG/NBO/W/792716', 'office Number-035320155569.'],
  phone: '+917363858862',
  email: 'greynotehealthcare@gmail.com',
  gstin: '19CZEPR0951E1ZA',
  state: '19-West Bengal',
} as const;

/** The state code that starts a GSTIN (`19` = West Bengal). A buyer whose GSTIN starts with it is taxed SGST + CGST; any other (or none on file) IGST. */
export const SELLER_STATE_CODE = COMPANY.gstin.slice(0, 2);
