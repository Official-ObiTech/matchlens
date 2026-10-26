type P = { size?: number };
const s = (size = 20) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true });

export const HomeIcon = ({ size }: P) => (<svg {...s(size)}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>);
export const BallIcon = ({ size }: P) => (<svg {...s(size)}><circle cx="12" cy="12" r="9" /><path d="m12 7 4 3-1.5 4.5h-5L8 10z" /><path d="M12 3v4M21 10l-5 0M3 10h5M7 20l2.5-5.5M17 20l-2.5-5.5" /></svg>);
export const ChartIcon = ({ size }: P) => (<svg {...s(size)}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>);
export const SlipIcon = ({ size }: P) => (<svg {...s(size)}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></svg>);
export const UserIcon = ({ size }: P) => (<svg {...s(size)}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>);
export const PlusIcon = ({ size }: P) => (<svg {...s(size)}><path d="M12 5v14M5 12h14" /></svg>);
export const CheckIcon = ({ size }: P) => (<svg {...s(size)}><path d="m5 12 5 5 9-10" /></svg>);
export const XIcon = ({ size }: P) => (<svg {...s(size)}><path d="M6 6l12 12M18 6 6 18" /></svg>);
export const SearchIcon = ({ size }: P) => (<svg {...s(size)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>);
export const LogoMark = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M4 18 9 12l4 3 7-9" /><circle cx="20" cy="6" r="1.2" fill="currentColor" /></svg>);
