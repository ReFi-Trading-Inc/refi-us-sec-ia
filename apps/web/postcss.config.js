// CommonJS: `@refi/web` no longer declares "type": "module" (that made Vercel's
// CommonJS serverless launcher fail to require() the ESM-typed route.js output
// with ERR_REQUIRE_ESM). PostCSS config uses module.exports so it loads as CJS.
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
