import { ImageResponse } from "next/og";

// The app icon is plain text: a "W" on the dark background.
export function generateImageMetadata() {
  return [
    { id: "192", size: { width: 192, height: 192 }, contentType: "image/png" },
    { id: "512", size: { width: 512, height: 512 }, contentType: "image/png" },
  ];
}

export default async function Icon({ id }: { id: Promise<string> }) {
  const size = Number(await id);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#111317",
        color: "#e8eaee",
        fontSize: size * 0.5,
        fontWeight: 700,
      }}
    >
      W
    </div>,
    { width: size, height: size },
  );
}
