// next.config.js
const withNextra = require('nextra')({
  theme: 'nextra-theme-docs',
  themeConfig: './theme.config.js',
})

const isProduction = process.env.NODE_ENV === "production";
const assetPrefix = isProduction ? "/monetdb-nodejs" : "";

const nextConfig = {
  output: "export",
  distDir: 'dist',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  assetPrefix,
  basePath: assetPrefix,
}

module.exports = {
  ... withNextra(),
  ...nextConfig
}
