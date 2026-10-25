/** Text files bundled by esbuild's text loader (build-server.js). */
declare module '*.txt' {
  const content: string
  export default content
}
