export interface Theme {
  id: string;
  name: string;
  statusBar: 'dark-content' | 'light-content';
  /** Page background. */
  bg: string;
  /** Card background. */
  surface: string;
  /** Nested block background, e.g. summary panels. */
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  accentOn: string;
  danger: string;
  dangerSoft: string;
}

export const THEMES: Theme[] = [
  {
    id: 'light',
    name: '라이트',
    statusBar: 'dark-content',
    bg: '#F4F6FA',
    surface: '#FFFFFF',
    surfaceAlt: '#F8FAFC',
    border: '#E4E7EC',
    text: '#0F1729',
    textMuted: '#667085',
    accent: '#1570EF',
    accentSoft: '#EAF2FE',
    accentOn: '#FFFFFF',
    danger: '#B42318',
    dangerSoft: '#FEF3F2',
  },
  {
    id: 'paper',
    name: '페이퍼',
    statusBar: 'dark-content',
    bg: '#FAF6EF',
    surface: '#FFFDF8',
    surfaceAlt: '#F6F0E5',
    border: '#E8DCC8',
    text: '#2A2118',
    textMuted: '#857665',
    accent: '#B4530A',
    accentSoft: '#FBEEE1',
    accentOn: '#FFFFFF',
    danger: '#9A2A1E',
    dangerSoft: '#FBEAE7',
  },
  {
    id: 'mint',
    name: '민트',
    statusBar: 'dark-content',
    bg: '#F0F7F4',
    surface: '#FFFFFF',
    surfaceAlt: '#F3FAF6',
    border: '#D2E7DD',
    text: '#0E2820',
    textMuted: '#5A7A6C',
    accent: '#0E9F6E',
    accentSoft: '#E4F6EE',
    accentOn: '#FFFFFF',
    danger: '#B42318',
    dangerSoft: '#FEF3F2',
  },
  {
    id: 'slate',
    name: '다크',
    statusBar: 'light-content',
    bg: '#0E141C',
    surface: '#19212C',
    surfaceAlt: '#141B24',
    border: '#2A3441',
    text: '#E7EEF7',
    textMuted: '#8FA0B5',
    accent: '#4A9DFF',
    accentSoft: '#1B2B3F',
    accentOn: '#06101C',
    danger: '#FF7B6B',
    dangerSoft: '#2E1A1A',
  },
];

export const DEFAULT_THEME = THEMES[0];

export function findTheme(id: string | null | undefined): Theme {
  return THEMES.find((theme) => theme.id === id) ?? DEFAULT_THEME;
}
