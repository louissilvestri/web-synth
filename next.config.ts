import type { NextConfig } from "next";

// Static export — the synth is fully client-side. GITHUB_PAGES=true (set by the
// deploy workflow) adds the project-page basePath.
const isGitHubPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  output: "export",
  basePath: isGitHubPages ? "/web-synth" : "",
  images: { unoptimized: true },
};

export default nextConfig;
