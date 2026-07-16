/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces a minimal self-contained server bundle in .next/standalone,
  // which is what the Dockerfile copies into the final image.
  output: "standalone",
};

export default nextConfig;
