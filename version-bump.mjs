import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.env.npm_package_version;

// Read minAppVersion from manifest.json and bump version to target version
let manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));

// Update versions.json if present
let versions = {};
try {
    versions = JSON.parse(readFileSync("versions.json", "utf8"));
} catch (_e) {
    // no versions.json yet
}
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t"));
