import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't auto-generate agent-rule markdown files on dev startup.
  agentRules: false,
};

export default nextConfig;
