import * as core from "@actions/core";
import { GameManifest, PluginDetector } from "@rcade/api";
import * as fs from "fs";
import * as tar from "tar";
import { stat } from "fs/promises";
import { resolve, basename, dirname, join } from "path";
import { RCadeDeployClient } from "./api-client";
import { uploadFileStream } from "./bucket";

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
    const manifest = GameManifest.parse(JSON.parse(rawManifest));

    const artifactPath = core.getInput("artifactPath", { required: true });
    const workspace = process.env.GITHUB_WORKSPACE || process.cwd();

    core.startGroup("🔌 Detecting plugins");
    const detector = new PluginDetector();
    const detectedDeps = detector.generateDependencies(workspace);
    if (detectedDeps.length > 0) {
      core.info(`Detected ${detectedDeps.length} plugin(s):`);
      for (const dep of detectedDeps) {
        core.info(`  - ${dep.name}@${dep.version}`);
      }
      // Merge detected dependencies with existing ones
      const existingDeps = manifest.dependencies ?? [];
      const existingNames = new Set(existingDeps.map(d => d.name));
      const newDeps = detectedDeps.filter(d => !existingNames.has(d.name));
      manifest.dependencies = [...existingDeps, ...newDeps];
    } else {
      core.info("No plugins detected");
    }
    core.endGroup();

    core.startGroup("💡 Manifest");
    core.info(`Found manifest for app ${manifest.name}`);
    core.info(JSON.stringify(manifest, null, 2));
    core.endGroup();

    // Check deployment restrictions
    if (manifest.deployment) {
      const githubRepo = process.env.GITHUB_REPOSITORY || "";
      const [actualOwner, actualRepo] = githubRepo.split("/");

      if (manifest.deployment.github_owner && manifest.deployment.github_owner !== actualOwner) {
        core.info(`⏭️ Deployment skipped: github_owner '${manifest.deployment.github_owner}' does not match '${actualOwner}'`);
        return;
      }

      if (manifest.deployment.github_repo && manifest.deployment.github_repo !== actualRepo) {
        core.info(`⏭️ Deployment skipped: github_repo '${manifest.deployment.github_repo}' does not match '${actualRepo}'`);
        return;
      }
    }

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

    const stats = await stat(absoluteArtifactPath);
    if (!stats.isDirectory()) {
      throw new Error(`Artifact path ${artifactPath} is not a directory`);
    }

    // Create tar.gz
    await tar.create(
      {
        gzip: true,
        file: outputPath,
        cwd: absoluteArtifactPath,
      },
      ["."]
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

    core.startGroup("📢 Publishing Version");
    await client.publishVersion(manifest.name, intent.version);
    core.info(`✅ Published version ${intent.version}`);
    core.endGroup();

    core.startGroup(`✨ Deployment complete! ✨`);
    core.info("Your game is now available on the RCade!");
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message);
  }
}

run();
