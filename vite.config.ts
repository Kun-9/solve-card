import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages 배포 시 DEPLOY_BASE=/<repo>/ 로 빌드한다.
// 로컬 개발에서는 빈 값이라 루트로 동작.
const base = process.env.DEPLOY_BASE ?? "/";

export default defineConfig({
  plugins: [react()],
  base,
  server: {
    host: true,
    port: 5173,
  },
});
