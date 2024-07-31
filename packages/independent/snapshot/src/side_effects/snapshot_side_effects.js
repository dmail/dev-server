import { urlToBasename } from "@jsenv/urls";
import {
  takeDirectorySnapshot,
  takeFileSnapshot,
} from "../filesystem_snapshot.js";
import { createCaptureSideEffects } from "./create_capture_side_effects.js";
import { renderSideEffects } from "./render_side_effects.js";

export const snapshotSideEffects = (
  sourceFileUrl,
  fn,
  {
    sideEffectFileUrl,
    sideEffectFilePattern = "./output/[basename].md",
    outDirectoryPattern = "./output/[basename]/",
    outFilePattern = "./output/[basename]/[filename]",
    generateOutFileUrl,
    outDirectoryUrl,
    errorStackHidden,
    ...captureOptions
  } = {},
) => {
  const basename = urlToBasename(sourceFileUrl, true);
  if (sideEffectFileUrl === undefined) {
    const sideEffectFileRelativeUrl = sideEffectFilePattern.replaceAll(
      "[basename]",
      basename,
    );
    sideEffectFileUrl = new URL(sideEffectFileRelativeUrl, sourceFileUrl);
  } else {
    sideEffectFileUrl = new URL(sideEffectFileUrl, sourceFileUrl);
  }

  const captureSideEffects = createCaptureSideEffects(captureOptions);
  if (outDirectoryUrl === undefined) {
    const outDirectoryRelativeUrl = outDirectoryPattern.replaceAll(
      "[basename]",
      basename,
    );
    outDirectoryUrl = new URL(outDirectoryRelativeUrl, sideEffectFileUrl);
  }
  if (generateOutFileUrl === undefined) {
    generateOutFileUrl = (filename) => {
      const outRelativeUrl = outFilePattern
        .replaceAll("[basename]", basename)
        .replaceAll("[filename]", filename);
      const outFileUrl = new URL(outRelativeUrl, new URL("./", sourceFileUrl))
        .href;
      return outFileUrl;
    };
  }

  const sideEffectFileSnapshot = takeFileSnapshot(sideEffectFileUrl);
  const outDirectorySnapshot = takeDirectorySnapshot(outDirectoryUrl);
  const onSideEffects = (sideEffects) => {
    const sideEffectFileContent = renderSideEffects(sideEffects, {
      sideEffectFileUrl,
      outDirectoryUrl,
      generateOutFileUrl,
      errorStackHidden,
    });
    sideEffectFileSnapshot.update(sideEffectFileContent, {
      mockFluctuatingValues: false,
    });
    outDirectorySnapshot.compare();
  };
  const returnValue = captureSideEffects(fn);
  if (returnValue && typeof returnValue.then === "function") {
    return returnValue.then((sideEffects) => {
      onSideEffects(sideEffects);
      return sideEffects;
    });
  }
  onSideEffects(returnValue);
  return returnValue;
};
