import { spawn } from "node:child_process";

const env = { ...process.env };

// Fedora's packaged libraries can use RELR sections that the linuxdeploy
// strip binary bundled by Tauri's AppImage pipeline doesn't understand yet.
// Skipping that strip step still produces a valid AppImage.
if (process.platform === "linux" && env.NO_STRIP === undefined) {
  env.NO_STRIP = "1";
}

const child = spawn(process.execPath, ["x", "tauri", "build", ...process.argv.slice(2)], {
  env,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("close", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
