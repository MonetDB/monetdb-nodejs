// next.config.js
const withNextra = require('nextra')({
  theme: 'nextra-theme-docs',
  themeConfig: './theme.config.js',
})

const nextConfig = {
  output: "export",
  distDir: 'dist',
  images: {
    unoptimized: true,
  }
}

module.exports = {
  ... withNextra(),
  ...nextConfig
}
