import type { SalesByEmployeeDto, SalesByProductDto } from '@greynote/contracts';

/** One donut: what was achieved against a target, and what is left. Pure and React-free so it is tested in Node. */
export interface AchievementSlices {
  achievedPaise: number;
  remainingPaise: number;
  /** Null when there is no target to measure against. */
  percent: number | null;
}

/** Achieved vs remaining. Over target the remainder is 0 (the donut is full); `percent` still shows the true figure, e.g. 130. */
export function achievementSlices(targetPaise: number, achievedPaise: number): AchievementSlices {
  const achieved = Math.max(0, achievedPaise);
  return {
    achievedPaise: achieved,
    remainingPaise: Math.max(0, targetPaise - achieved),
    percent: targetPaise > 0 ? Math.round((achieved / targetPaise) * 100) : null,
  };
}

export interface RankedRow {
  id: string;
  label: string;
  valuePaise: number;
}

export const TOP_N = 5;

const byValueDesc = (a: RankedRow, b: RankedRow) => b.valuePaise - a.valuePaise || a.label.localeCompare(b.label);

/** The top achievers: employees by what they achieved, highest first. Zero and negative rows are not achievers. */
export function topAchievers(report: SalesByEmployeeDto, n = TOP_N): RankedRow[] {
  return report.rows
    .map((r) => ({ id: r.employee.id, label: r.employee.name, valuePaise: r.achievedPaise }))
    .filter((r) => r.valuePaise > 0)
    .sort(byValueDesc)
    .slice(0, n);
}

/** The top products: by secondary sales value, highest first. */
export function topProducts(report: SalesByProductDto, n = TOP_N): RankedRow[] {
  return report.rows
    .map((r) => ({ id: r.product.id, label: r.product.name, valuePaise: r.secondaryPaise }))
    .filter((r) => r.valuePaise > 0)
    .sort(byValueDesc)
    .slice(0, n);
}

export interface TargetBar {
  id: string;
  label: string;
  targetPaise: number;
  achievedPaise: number;
  percent: number | null;
}

/** Rows that carry a target, largest target first, so the donut selector lists the people and products that matter. */
export function productTargets(report: SalesByProductDto): TargetBar[] {
  return report.rows
    .filter((r) => r.targetPaise > 0)
    .map((r) => ({ id: r.product.id, label: r.product.name, targetPaise: r.targetPaise, achievedPaise: r.secondaryPaise, percent: r.achievementPercent }))
    .sort((a, b) => b.targetPaise - a.targetPaise || a.label.localeCompare(b.label));
}

export function employeeTargets(report: SalesByEmployeeDto): TargetBar[] {
  return report.rows
    .filter((r) => r.targetPaise > 0)
    .map((r) => ({ id: r.employee.id, label: r.employee.name, targetPaise: r.targetPaise, achievedPaise: r.achievedPaise, percent: r.achievementPercent }))
    .sort((a, b) => b.targetPaise - a.targetPaise || a.label.localeCompare(b.label));
}

/** Every product, most secondary sales first (ties by name): the full ranking behind the top-products pie. */
export function rankedProducts(report: SalesByProductDto): RankedRow[] {
  return report.rows.map((r) => ({ id: r.product.id, label: r.product.name, valuePaise: r.secondaryPaise })).sort(byValueDesc);
}

/** Every employee, most achieved first (ties by name). */
export function rankedEmployees(report: SalesByEmployeeDto): RankedRow[] {
  return report.rows.map((r) => ({ id: r.employee.id, label: r.employee.name, valuePaise: r.achievedPaise })).sort(byValueDesc);
}

/** Pie slices: the top `n` rows with positive sales, the rest folded into one "Others" slice so the pie stays readable. */
export function pieSlices(ranked: readonly RankedRow[], n = TOP_N): RankedRow[] {
  const positive = ranked.filter((r) => r.valuePaise > 0);
  const head = positive.slice(0, n);
  const rest = positive.slice(n).reduce((sum, r) => sum + r.valuePaise, 0);
  return rest > 0 ? [...head, { id: 'others', label: 'Others', valuePaise: rest }] : head;
}
