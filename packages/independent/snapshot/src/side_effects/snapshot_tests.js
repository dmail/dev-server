/*
 * TODO: ajouter la possibilité de faire un .gif avec les logs
 * TODO: faire des cas ou la comparison fail (parce que le comportement de la fonction change)
 * et voir ce qu'on récupere dans ce cas
 *
 */

import {
  fileSystemPathToUrl,
  isFileSystemPath,
  urlToFilename,
  urlToRelativeUrl,
} from "@jsenv/urls";
import {
  takeDirectorySnapshot,
  takeFileSnapshot,
} from "../filesystem_snapshot.js";
import { createCaptureSideEffects } from "./create_capture_side_effects.js";
import { renderSideEffects, renderSmallLink } from "./render_side_effects.js";

export const snapshotTests = async (
  fnRegisteringTest,
  snapshotFileUrl,
  {
    rootDirectoryUrl,
    generatedBy = true,
    linkToSource = true,
    linkToEachSource,
    errorStackHidden,
    logEffects,
  } = {},
) => {
  const callSite = getTestCallSite();
  const testMap = new Map();
  const onlyTestMap = new Map();
  const test = (scenario, fn, options) => {
    testMap.set(scenario, { fn, options, callSite: getTestCallSite() });
  };
  test.ONLY = (scenario, fn, options) => {
    onlyTestMap.set(scenario, { fn, options, callSite: getTestCallSite() });
  };
  fnRegisteringTest({ test });

  const activeTestMap = onlyTestMap.size ? onlyTestMap : testMap;
  const captureSideEffects = createCaptureSideEffects({
    rootDirectoryUrl,
  });
  let markdown = "";
  markdown += `# ${urlToFilename(snapshotFileUrl)}`;
  for (const [scenario, { fn, callSite }] of activeTestMap) {
    markdown += "\n\n";
    markdown += `## ${scenario}`;
    markdown += "\n\n";
    const sideEffects = await captureSideEffects(fn, {
      callSite: linkToEachSource ? callSite : undefined,
      logEffects,
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
    outDirectorySnapshot.compare();
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
        suffix: linkToSource
          ? generateExecutingLink(callSite, snapshotFileUrl)
          : "",
      },
    );
    markdown += "\n\n";
    markdown += generatedByLink;
  }
  sideEffectFileSnapshot.update(markdown, { mockFluctuatingValues: false });
};

const generateExecutingLink = (callSite, snapshotFileUrl) => {
  const relativeUrl = urlToRelativeUrl(callSite.url, snapshotFileUrl, {
    preferRelativeNotation: true,
  });
  const href = `${relativeUrl}#L${callSite.line}`;
  const text = `${relativeUrl}:${callSite.line}:${callSite.column}`;
  return ` executing <a href="${href}">${text}</a>`;
};

const getTestCallSite = () => {
  const { prepareStackTrace } = Error;
  Error.prepareStackTrace = (error, stack) => {
    Error.prepareStackTrace = prepareStackTrace;
    return stack;
  };
  const { stack } = new Error();
  Error.prepareStackTrace = prepareStackTrace;
  const callerCallsite = stack[2];
  const fileName = callerCallsite.getFileName();
  const testCallSite = {
    url:
      fileName && isFileSystemPath(fileName)
        ? fileSystemPathToUrl(fileName)
        : fileName,
    line: callerCallsite.getLineNumber(),
    column: callerCallsite.getColumnNumber(),
  };
  return testCallSite;
};

// see https://github.com/parshap/node-sanitize-filename/blob/master/index.js
const asValidFilename = (string) => {
  return string
    .trim()
    .toLowerCase()
    .replace(/[ ,.]/g, "_")
    .replace(/["/?<>\\:*|]/g, "");
};
