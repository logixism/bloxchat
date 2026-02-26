import { env } from "./env";

export type VerificationConfig = {
  placeId: string;
};

const verificationConfig: VerificationConfig = {
  placeId: env.VERIFICATION_PLACE_ID,
};

export const getVerificationConfig = (): VerificationConfig =>
  verificationConfig;
