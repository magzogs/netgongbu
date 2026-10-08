import type { ReactElement } from 'react';

const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'currentColor',
  'aria-hidden': true,
} as const;

export const PlayIcon = (): ReactElement => (
  <svg {...base}>
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
  </svg>
);

export const PauseIcon = (): ReactElement => (
  <svg {...base}>
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
);

export const ReplayIcon = (): ReactElement => (
  <svg {...base} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 4v4.5h4.5" />
  </svg>
);

export const PrevIcon = (): ReactElement => (
  <svg {...base}>
    <rect x="5" y="5" width="2.5" height="14" rx="1" />
    <path d="M19 6.2v11.6a1 1 0 0 1-1.55.83l-8.4-5.8a1 1 0 0 1 0-1.66l8.4-5.8A1 1 0 0 1 19 6.2Z" />
  </svg>
);

export const NextIcon = (): ReactElement => (
  <svg {...base}>
    <rect x="16.5" y="5" width="2.5" height="14" rx="1" />
    <path d="M5 6.2v11.6a1 1 0 0 0 1.55.83l8.4-5.8a1 1 0 0 0 0-1.66l-8.4-5.8A1 1 0 0 0 5 6.2Z" />
  </svg>
);

/** Arrows pointing out to the corners: a folded zone opens into its devices. */
export const ExpandIcon = (): ReactElement => (
  <svg
    {...base}
    width={12}
    height={12}
    fill="none"
    stroke="currentColor"
    strokeWidth={2.6}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5" />
  </svg>
);

/** Arrows pointing in from the corners: an open zone folds into one again. */
export const CollapseIcon = (): ReactElement => (
  <svg
    {...base}
    width={12}
    height={12}
    fill="none"
    stroke="currentColor"
    strokeWidth={2.6}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 10h-6V4M4 14h6v6M14 10l6.5-6.5M10 14l-6.5 6.5" />
  </svg>
);
