import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

export * from "./root";
export * from "./context";
export * from "./types";
export * from "./trpc";
