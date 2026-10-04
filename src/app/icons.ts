const icon = (paths: string) =>
  `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const ICONS = {
  menu: icon('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  plus: icon('<path d="M12 5v14M5 12h14"/>'),
  search: icon('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  pin: icon('<path d="M12 17v5"/><path d="M9 10.76V6h6v4.76l2 3.24H7z"/><path d="M8 3h8"/>'),
  trash: icon('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  restore: icon('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  share: icon(
    '<path d="M10 14 21 3M21 3h-6M21 3v6"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
  ),
  download: icon('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  upload: icon('<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>'),
  close: icon('<path d="M6 6l12 12M18 6 6 18"/>'),
};
