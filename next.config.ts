import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // pptxgenjs v4 uses `import("node:fs")` etc. Webpack 5 treats `node:` as
      // a URI scheme (not a module name) so resolve.alias/fallback won't catch it.
      // NormalModuleReplacementPlugin fires before the scheme handler and strips
      // the prefix, turning `node:fs` into `fs`, which resolve.fallback can stub.
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^node:/,
          (resource: { request: string }) => {
            resource.request = resource.request.replace(/^node:/, '')
          }
        )
      )
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        https: false,
        http: false,
        path: false,
        zlib: false,
        stream: false,
        util: false,
        buffer: false,
        os: false,
      }
    }
    return config
  },
};
export default nextConfig;
