import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b7a53" }}>
        <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 18 9 12l4 3 7-9" />
          <circle cx="20" cy="6" r="1.2" fill="#fff" />
        </svg>
      </div>
    ),
    size,
  );
}
