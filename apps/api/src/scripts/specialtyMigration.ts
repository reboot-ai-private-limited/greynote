/** The starting list: common medical specialities, so the dropdown is useful on day one. An Admin edits it afterwards. */
export const STARTER_SPECIALTIES = [
  'General Physician',
  'Consulting Physician',
  'Pediatrician',
  'Gynecologist / Obstetrician',
  'Cardiologist',
  'Diabetologist',
  'Endocrinologist',
  'Orthopedic',
  'Dermatologist',
  'ENT',
  'Ophthalmologist',
  'Neurologist',
  'Psychiatrist',
  'Pulmonologist / Chest Physician',
  'Gastroenterologist',
  'Nephrologist',
  'Urologist',
  'General Surgeon',
  'Oncologist',
  'Dentist',
  'Radiologist',
  'Ayurveda / AYUSH',
] as const;

export const keyOf = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();
const tidy = (name: string): string => name.trim().replace(/\s+/g, ' ');

export interface SpecialtyPlan {
  /** Every speciality the list should hold, one per key, A–Z. */
  specialties: string[];
  /** For a doctor's stored text (its key) the spelling it should have — only where it differs from what is stored. */
  respell: Array<{ from: string; to: string }>;
}

/**
 * The speciality list from what is already there: the starter names plus every distinct speciality the doctors carry, one per key
 * (ignoring case and spacing). The list's spelling is the starter's where there is one, otherwise the most used among the doctors
 * (ties: the first seen). Doctors whose text differs from the list's spelling only in case or spacing are to be respelled.
 */
export function planSpecialties(doctorSpecialties: readonly string[], starters: readonly string[] = STARTER_SPECIALTIES): SpecialtyPlan {
  const canonical = new Map<string, string>();
  for (const s of starters) canonical.set(keyOf(s), tidy(s));

  const spellings = new Map<string, Map<string, number>>();
  for (const raw of doctorSpecialties) {
    const text = tidy(raw);
    if (text === '') continue;
    const counts = spellings.get(keyOf(text)) ?? new Map<string, number>();
    counts.set(text, (counts.get(text) ?? 0) + 1);
    spellings.set(keyOf(text), counts);
  }
  for (const [key, counts] of spellings) {
    if (canonical.has(key)) continue;
    canonical.set(key, [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0]);
  }

  const respell: SpecialtyPlan['respell'] = [];
  const seen = new Set<string>();
  for (const raw of doctorSpecialties) {
    const to = canonical.get(keyOf(raw));
    if (to && raw !== to && !seen.has(raw)) {
      seen.add(raw);
      respell.push({ from: raw, to });
    }
  }
  return { specialties: [...canonical.values()].sort((a, b) => a.localeCompare(b)), respell };
}
