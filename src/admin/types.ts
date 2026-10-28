/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type AdminSection =
  | 'overview'
  | 'players'
  | 'sessions'
  | 'branding'
  | 'wallpapers'
  | 'sound'
  | 'crackers'
  | 'bombs'
  | 'wishes'
  | 'settings'
  | 'reports';

export interface AdminNavItem {
  id: AdminSection;
  label: string;
  iconName: string;
  description: string;
  badge?: string;
}
