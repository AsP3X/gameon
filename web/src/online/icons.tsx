/* The icons the online screens use, drawn as the renderer draws them (ICON in tableview/art.ts). */
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
export const CheckIcon = () => (
  <svg {...stroke} strokeLinejoin="round">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
/** A bot in a seat: a head with an antenna, two eyes and two ears. */
export const BotIcon = () => (
  <svg {...stroke} strokeWidth={2.5} strokeLinejoin="round">
    <path d="M12 8V4H8M6 8h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM2 14h2M20 14h2M9 13v2M15 13v2" />
  </svg>
);
