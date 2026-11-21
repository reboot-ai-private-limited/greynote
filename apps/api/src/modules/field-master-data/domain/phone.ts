/**
 * A phone number is the same number however it was typed: `9433231829`, `+919433231829` and `09433231829` are one phone.
 * Compared by its last ten digits (an Indian mobile number without the country code or the leading 0).
 */
export const phoneKey = (phone: string): string => phone.replace(/\D/g, '').slice(-10);

/** Matches a stored phone that ends in `phone`'s ten digits, whatever prefix it carries. */
export const samePhoneRegex = (phone: string): RegExp => new RegExp(`^\\+?\\d*${phoneKey(phone)}$`);
