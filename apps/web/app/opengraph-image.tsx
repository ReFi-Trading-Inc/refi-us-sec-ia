import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { usBrand } from "./us/_content/brand";
import { landingCopy } from "./us/_content/landing";

/**
 * Open Graph card for shared links, in the shell register: the mark and
 * wordmark on the authoritative charcoal, no retro styling. Copy reuses the
 * counsel-confirmed hero headline and regulatory status verbatim.
 */
export const alt = usBrand.productSurface;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const logo = await readFile(join(process.cwd(), "public/refi-logo.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
        backgroundColor: "#0A0F14",
        backgroundImage:
          "radial-gradient(circle at 1px 1px, rgba(12, 212, 160, 0.12) 1px, transparent 0)",
        backgroundSize: "24px 24px",
        padding: 80,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <img src={logoSrc} alt="" width={96} height={96} />
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700 }}>
          <span style={{ color: "#0CD4A0" }}>ReFi</span>
          <span style={{ color: "#EDF1F5" }}>.Trading</span>
        </div>
      </div>
      <div
        style={{
          color: "#C7D0D9",
          fontSize: 36,
          textAlign: "center",
          maxWidth: 900,
        }}
      >
        {landingCopy.hero.headline}
      </div>
      <div
        style={{
          color: "#0CD4A0",
          fontSize: 22,
          letterSpacing: 4,
          textTransform: "uppercase",
        }}
      >
        {usBrand.regulatoryStatus}
      </div>
    </div>,
    size,
  );
}
