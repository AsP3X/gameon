/* The two icons the online screens use, drawn as the renderer draws them (ICON in tableview/art.ts). */
const stroke = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3,
  strokeLinecap: 'round',
  'aria-hidden': true,
} as const;

export const BackIcon = () => (
  <svg {...stroke} strokeLinejoin="round">
    <path d="M15 5l-7 7 7 7" />
  </svg>
);
export const CloseIcon = () => (
  <svg {...stroke}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
