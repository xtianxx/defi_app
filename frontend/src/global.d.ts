// Global ambient declarations for the Next.js + TS 6 toolchain.
// Declares the asset side-effect imports used by the layout/UI primitives.

declare module "*.css";
declare module "*.svg" {
  const src: string;
  export default src;
}
declare module "*.png" {
  const src: string;
  export default src;
}
declare module "*.jpg" {
  const src: string;
  export default src;
}
