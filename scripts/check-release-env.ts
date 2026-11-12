import { releaseEnvironmentWarnings, validateReleaseEnvironment } from "./release-config";

const issues = validateReleaseEnvironment(process.env);
for (const warning of releaseEnvironmentWarnings(process.env)) console.warn(`Warning: ${warning}`);
if (issues.length) {
  console.error("Release configuration is incomplete:");
  for (const issue of issues) console.error(`- ${issue.key}: ${issue.reason}`);
  process.exitCode = 1;
} else {
  console.log("Required release settings are configured. Provider access, database permissions and authentication still require end-to-end verification.");
}