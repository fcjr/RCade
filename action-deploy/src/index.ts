import * as core from "@actions/core";
import { Manifest } from "@rcade/api";
import * as fs from "fs";
import * as tar from "tar";
import { resolve, basename, dirname, join } from 'path';
import { RCadeDeployClient } from "./api-client";

const TOKEN_AUDIENCE = "https://rcade.recurse.com";

async function getIdToken(): Promise<string> {
  try {
    // This uses the built-in GitHub Actions function to get OIDC token
    const idToken = await core.getIDToken(TOKEN_AUDIENCE);
    return idToken;
  } catch (error) {
    throw new Error(`Failed to get ID token: ${error}`);
  }
}

export async function run(): Promise<void> {
  try {
    core.info("Aquiring id token");
    const idToken = await getIdToken();

    const manifestPath = core.getInput("manifestPath", { required: true });
    core.info(`Checking for manifest file at ${manifestPath}...`);
    const rawManifest = fs.readFileSync(manifestPath, "utf-8");
    const manifest = Manifest.parse(JSON.parse(rawManifest));

    core.startGroup("💡 Manifest");
    core.info(`Found manifest for app ${manifest.name}`);
    core.info(JSON.stringify(manifest, null, 2));
    core.endGroup();

    const artifactPath = core.getInput("artifactPath", { required: true });
    const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
    const absoluteArtifactPath = resolve(workspace, artifactPath);

    // ensure artfact folder has an index.html
    if (!fs.existsSync(`${absoluteArtifactPath}/index.html`)) {
      throw new Error(
        `Artifact folder ${artifactPath} does not contain an index.html file`
      );
    }

    const outputFile = `${basename(artifactPath)}.tar.gz`;
    const outputPath = join(workspace, outputFile);

    core.startGroup("📦 Creating tar.gz archive");
    core.info(`Source: ${absoluteArtifactPath}`);
    core.info(`Output: ${outputPath}`);

    // Create tar.gz
    await tar.create(
      {
        gzip: true,
        file: outputPath,
        cwd: dirname(absoluteArtifactPath),
      },
      [basename(absoluteArtifactPath)]
    );

    core.info(`✅ Created: ${outputFile}`);
    core.endGroup();

    core.startGroup("🔥 Creating Deployment Intent");
    const client = new RCadeDeployClient(idToken);
    const intent = await client.createDeploymentIntent(manifest);
    core.info(`✅ Created deployment intent: ${intent.upload_url}`);
    core.endGroup();

    core.startGroup("🚀 Uploading Artifact");
    await uploadFileStream(outputPath, intent.upload_url);
    core.info(`✅ Uploaded artifact`);
    core.endGroup();


    core.startGroup(`✨ Deployment complete! ✨`);
    core.info("Your game is now available on the RCade!");
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message);
  }
}

run();

function uploadFileStream(outputPath: string, upload_url: string) {
  throw new Error("Function not implemented.");
}
