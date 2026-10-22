const [major, minor, patch] = process.versions.node.split('.').map(Number);
console.log(`CI Node runtime: ${process.version}`);
if (major !== 26 || minor < 12 || (minor === 12 && patch < 1)) {
  throw new Error('CI requires Node 26.x at or above the security floor 26.12.1.');
}
