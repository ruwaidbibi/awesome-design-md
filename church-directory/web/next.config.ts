import type { NextConfig } from "next";

const config: NextConfig = {
  // The dataset is a build-time import, so the whole directory can ship as
  // static files. Drop `output` if you add the submission API route below.
  output: process.env.STATIC_EXPORT === "1" ? "export" : undefined,
  images: { unoptimized: true },
};

export default config;
