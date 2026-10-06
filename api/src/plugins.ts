import inputClassicManifest from "@rcade/input-classic/rcade.manifest.json";
import inputSpinnerV1Manifest from "@rcade/input-spinners/v1.manifest.json";
import inputSpinnerV2Manifest from "@rcade/input-spinners/v2.manifest.json";

export const pluginManifests = [
    inputClassicManifest,
    inputSpinnerV1Manifest,
    inputSpinnerV2Manifest,
] as const;
