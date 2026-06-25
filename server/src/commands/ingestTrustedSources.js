import { ingestTrustedSources } from "../services/trustedSourceIngestion.js";

function parseArgs(argv) {
  const options = {};
  for (const arg of argv) {
    if (arg.startsWith("--source=")) {
      options.source = arg.slice("--source=".length);
    }
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));

ingestTrustedSources(options)
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
    if (summary.sourcesChecked === 0) {
      console.warn("No enabled trusted sources matched the command.");
    }
    if (summary.downloaded === 0) {
      console.warn("No documents were downloaded. Sources may be unavailable, unchanged, or may not expose direct document links.");
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
