/**
 * The Solarized theme family.
 *
 * Data only. The colour values come from the published Solarized
 * palette; the values that a contrast rule of this application required are
 * derived inside the palette and are listed in `THIRD_PARTY_LICENSES.md`.
 */
import type { Theme, ThemeFamily, ThemeSource } from '../theme.ts';

const source: ThemeSource = {
  project: 'Solarized by Ethan Schoonover',
  url: 'https://github.com/altercation/solarized',
  licence: 'MIT',
};

const variants: readonly Theme[] = [
  {
    id: 'solarized-light',
    family: 'solarized',
    name: 'Solarized Light',
    appearance: 'light',
    source,
    tokens: {
      background: '#fdf6e3',
      surface: '#eee8d5',
      surfaceCard: '#fefbf2',
      surfaceHover: '#f4efdd',
      surfaceActive: '#e9e6d7',
      text: '#5e747c',
      textStrong: '#073642',
      textMuted: '#596a6c',
      accentText: '#266d96',
      accentFill: '#267cb4',
      accentOnFill: '#ffffff',
      successText: '#5b6f00',
      dangerText: '#c62623',
      dangerFill: '#dc322f',
      onDanger: '#ffffff',
      border: '#788686',
      borderSubtle: '#eee8d5',
      focus: '#2689ce',
      scrim: '#002b36',
    },
    syntax: {
      keyword: '#5f7300',
      string: '#277775',
      comment: '#616f6f',
      number: '#c52c76',
      tag: '#2672a0',
      attribute: '#8b6600',
      heading: '#bd4416',
      link: '#6065b8',
      punctuation: '#5a7078',
    },
  },
  {
    id: 'solarized-dark',
    family: 'solarized',
    name: 'Solarized Dark',
    appearance: 'dark',
    source,
    tokens: {
      background: '#002b36',
      surface: '#00212b',
      surfaceCard: '#06303a',
      surfaceHover: '#0a333d',
      surfaceActive: '#0e3640',
      text: '#849597',
      textStrong: '#abb6b6',
      textMuted: '#869ca4',
      accentText: '#49a0d9',
      accentFill: '#268bd2',
      accentOnFill: '#000d10',
      successText: '#8fa300',
      dangerText: '#dc7e7b',
      dangerFill: '#e1514e',
      onDanger: '#000d10',
      border: '#687e85',
      borderSubtle: '#073642',
      focus: '#268bd2',
      scrim: '#001f27',
    },
    syntax: {
      keyword: '#8b9f00',
      string: '#2aa79e',
      comment: '#8399a0',
      number: '#d47aa4',
      tag: '#439dd9',
      attribute: '#bb8f00',
      heading: '#e97348',
      link: '#8e8fda',
      punctuation: '#88999b',
    },
  },
];

/** Solarized. */
export const solarized: ThemeFamily = {
  id: 'solarized',
  name: 'Solarized',
  source,
  variants,
};
