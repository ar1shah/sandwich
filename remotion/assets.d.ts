// Font files are imported as modules (remotion/fonts.ts). Vite and the Remotion bundler
// both turn the import into the file's URL.
declare module "*.ttf" {
  const url: string;
  export default url;
}
