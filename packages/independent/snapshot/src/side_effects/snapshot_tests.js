import { urlToFilename, urlToRelativeUrl } from "@jsenv/urls";
import {
  takeDirectorySnapshot,
  takeFileSnapshot,
} from "../filesystem_snapshot.js";
import { getCallerLocation } from "../get_caller_location.js";
import { createCaptureSideEffects } from "./create_capture_side_effects.js";
import { renderSideEffects, renderSmallLink } from "./render_side_effects.js";

/**
 * Generate a markdown file describing all test side effects. When executed in CI throw if there is a diff.
 * @param {Function} fnRegisteringTest
 * @param {URL} snapshotFileUrl
 * @param {Object} snapshotTestsOptions
 * @param {string|url} snapshotTestsOptions.sourceDirectoryUrl
 * @return {Array.<Object>} sideEffects
 */
export const snapshotTests = async (
  fnRegisteringTest,
  snapshotFileUrl,
  {
    rootDirectoryUrl,
    generatedBy = true,
    linkToSource = true,
    sourceFileUrl,
    linkToEachSource,
    errorStackHidden,
    logEffects,
    filesystemEffects,
    throwWhenDiff = process.env.CI,
  } = {},
) => {
  const testMap = new Map();
  const onlyTestMap = new Map();
  const test = (scenario, fn, options) => {
    testMap.set(scenario, { fn, options, callSite: getCallerLocation(2) });
  };
  test.ONLY = (scenario, fn, options) => {
    onlyTestMap.set(scenario, { fn, options, callSite: getCallerLocation(2) });
  };
  fnRegisteringTest({ test });

  const activeTestMap = onlyTestMap.size ? onlyTestMap : testMap;
  const captureSideEffects = createCaptureSideEffects({
    rootDirectoryUrl,
    logEffects,
    filesystemEffects,
  });
  let markdown = "";
  markdown += `# ${urlToFilename(snapshotFileUrl)}`;
  for (const [scenario, { fn, callSite }] of activeTestMap) {
    markdown += "\n\n";
    markdown += `## ${scenario}`;
    markdown += "\n\n";
    const sideEffects = await captureSideEffects(fn, {
      callSite: linkToEachSource ? callSite : undefined,
      baseDirectory: String(new URL("./", callSite.url)),
    });
    const outDirectoryUrl = new URL(
      `./${asValidFilename(scenario)}/`,
      snapshotFileUrl,
    );
    const outDirectorySnapshot = takeDirectorySnapshot(outDirectoryUrl);
    const sideEffectsMarkdown = renderSideEffects(sideEffects, {
      sideEffectFileUrl: snapshotFileUrl,
      outDirectoryUrl,
      generatedBy: false,
      titleLevel: 3,
      errorStackHidden,
    });
    outDirectorySnapshot.compare(throwWhenDiff);
    markdown += sideEffectsMarkdown;
  }
  const sideEffectFileSnapshot = takeFileSnapshot(snapshotFileUrl);
  if (generatedBy) {
    let generatedByLink = renderSmallLink(
      {
        text: "@jsenv/snapshot",
        href: "https://github.com/jsenv/core/tree/main/packages/independent/snapshot",
      },
      {
        prefix: "Generated by ",
        suffix:
          linkToSource && sourceFileUrl
            ? generateExecutingLink(sourceFileUrl, snapshotFileUrl)
            : "",
      },
    );
    markdown += "\n\n";
    markdown += generatedByLink;
  }
  sideEffectFileSnapshot.update(markdown, {
    mockFluctuatingValues: false,
    throwWhenDiff,
  });
};

const generateExecutingLink = (sourceFileUrl, snapshotFileUrl) => {
  const relativeUrl = urlToRelativeUrl(sourceFileUrl, snapshotFileUrl, {
    preferRelativeNotation: true,
  });
  const href = `${relativeUrl}`;
  const text = `${relativeUrl}`;
  return ` executing <a href="${href}">${text}</a>`;
};

// see https://github.com/parshap/node-sanitize-filename/blob/master/index.js
const asValidFilename = (string) => {
  return string
    .trim()
    .toLowerCase()
    .replace(/[ ,.]/g, "_")
    .replace(/["/?<>\\:*|]/g, "");
};
