import { fileURLToPath } from "node:url";
export default {
  optimizeDeps: { include: ["three", "three/addons/geometries/RoundedBoxGeometry.js", "three/addons/postprocessing/EffectComposer.js", "three/addons/postprocessing/RenderPass.js", "three/addons/postprocessing/UnrealBloomPass.js", "three/addons/postprocessing/OutputPass.js", "three/addons/postprocessing/SMAAPass.js"] },
  esbuild: { jsx: "automatic" as const },
  resolve: { alias: {
    "next/image": fileURLToPath(new URL("./image.tsx", import.meta.url)),
    "next/link": fileURLToPath(new URL("./link.tsx", import.meta.url)),
    "next/navigation": fileURLToPath(new URL("./navigation.ts", import.meta.url)),
    "@clerk/nextjs": fileURLToPath(new URL("./clerk.ts", import.meta.url)),
  } },
  define: { "process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY": '""' },
};
