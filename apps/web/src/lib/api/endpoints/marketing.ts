import { request } from '../client';

export interface SetTargetBody {
  userId: string;
  /** `YYYY-MM`, a month of the current financial year. */
  month: string;
  targetAmountPaise: number;
}

export interface SetAchievementBody {
  userId: string;
  month: string;
  achievedAmountPaise: number;
}

export const marketingApi = {
  /** The general monthly target (no product, no campaign); setting it again replaces it. */
  setTarget: (token: string, body: SetTargetBody) =>
    request<unknown>('/marketing/targets', { method: 'POST', token, body }),
  /** What the employee sold in the month, entered by hand; setting it again replaces it. */
  setAchievement: (token: string, body: SetAchievementBody) =>
    request<unknown>('/marketing/achievements', { method: 'POST', token, body }),
};
