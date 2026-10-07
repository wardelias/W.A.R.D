import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "W.A.R.D.",
    short_name: "W.A.R.D.",
    description: "Plan the day, focus, shut down.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    background_color: "#111317",
    theme_color: "#111317",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
