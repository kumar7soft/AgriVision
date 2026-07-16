import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AgriTwin",
    short_name: "AgriTwin",
    description: "Scan your farm with your phone camera and get an instant digital twin health report.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f5f4",
    theme_color: "#16a34a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
