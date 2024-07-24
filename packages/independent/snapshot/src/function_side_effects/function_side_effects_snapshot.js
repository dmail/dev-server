import { writeFileSync } from "@jsenv/filesystem";
import {
  ensurePathnameTrailingSlash,
  urlToFilename,
  urlToRelativeUrl,
} from "@jsenv/urls";
import { takeDirectorySnapshot } from "../filesystem_snapshot.js";
import { replaceFluctuatingValues } from "../replace_fluctuating_values.js";
import { collectFunctionSideEffects } from "./function_side_effects_collector.js";
import { renderSideEffects } from "./function_side_effects_renderer.js";
import { spyConsoleCalls } from "./spy_console_calls.js";
import { spyFilesystemCalls } from "./spy_filesystem_calls.js";

let filesystemSideEffectInstalled;

export const snapshotFunctionSideEffects = (
  fn,
  fnFileUrl,
  sideEffectDirectoryRelativeUrl = "./",
  {
    rootDirectoryUrl = new URL("./", fnFileUrl),
    filesystemEffectsDirectory,
    preventConsoleSideEffects = true,
    undoFilesystemSideEffects = true,
  } = {},
) => {
  if (filesystemEffectsDirectory === true) {
    filesystemEffectsDirectory = "./fs/";
  }
  const sideEffectDirectoryUrl = new URL(
    sideEffectDirectoryRelativeUrl,
    fnFileUrl,
  );
  const sideEffectDirectorySnapshot = takeDirectorySnapshot(
    sideEffectDirectoryUrl,
  );
  const sideEffectFilename = `${urlToFilename(sideEffectDirectoryUrl)}_side_effects.txt`;
  const sideEffectFileUrl = new URL(sideEffectFilename, sideEffectDirectoryUrl);
  const callbackSet = new Set();
  const sideEffectDetectors = [
    {
      name: "console",
      install: (addSideEffect) => {
        const onConsole = (methodName, message) => {
          addSideEffect({
            type: `console:${methodName}`,
            value: message,
            label: `console.${methodName}`,
            text: replaceFluctuatingValues(message, {
              stringType: "console",
              rootDirectoryUrl,
            }),
          });
        };
        const consoleSpy = spyConsoleCalls(
          {
            error: (message) => {
              onConsole("error", message);
            },
            warn: (message) => {
              onConsole("warn", message);
            },
            info: (message) => {
              onConsole("info", message);
            },
            log: (message) => {
              onConsole("log", message);
            },
          },
          {
            preventConsoleSideEffects,
          },
        );
        return () => {
          consoleSpy.restore();
        };
      },
    },
    {
      name: "filesystem",
      install: (addSideEffect) => {
        if (filesystemSideEffectInstalled) {
          throw new Error(
            "cannot collect filesystem side effects concurrently (already collecting side effect for an other function)",
          );
        }
        filesystemSideEffectInstalled = true;
        const fsSideEffectDirectoryUrl = ensurePathnameTrailingSlash(
          new URL(filesystemEffectsDirectory, sideEffectDirectoryUrl),
        );
        const fsSideEffectsDirectoryRelativeUrl = urlToRelativeUrl(
          fsSideEffectDirectoryUrl,
          sideEffectFileUrl,
        );
        const filesystemSpy = spyFilesystemCalls(
          {
            writeFile: (url, content) => {
              const relativeUrl = urlToRelativeUrl(url, fnFileUrl);
              const toUrl = new URL(relativeUrl, fsSideEffectDirectoryUrl);
              if (filesystemEffectsDirectory) {
                callbackSet.add(() => {
                  writeFileSync(toUrl, content);
                });
                addSideEffect({
                  type: "fs:write_file",
                  value: { relativeUrl, content },
                  label: `write file "${relativeUrl}" (see ./${fsSideEffectsDirectoryRelativeUrl}${relativeUrl})`,
                  text: null,
                });
              } else {
                addSideEffect({
                  type: "fs:write_file",
                  value: { relativeUrl, content },
                  label: `write file "${relativeUrl}"`,
                  text: content,
                });
              }
            },
            writeDirectory: (url) => {
              const relativeUrl = urlToRelativeUrl(url, fnFileUrl);
              addSideEffect({
                type: "fs:write_directory",
                value: { relativeUrl },
                label: `write directory "${relativeUrl}"`,
                text: null,
              });
            },
          },
          {
            undoFilesystemSideEffects,
          },
        );
        return () => {
          filesystemSpy.restore();
          filesystemSideEffectInstalled = false;
        };
      },
    },
  ];

  const onSideEffectsCollected = (sideEffects) => {
    for (const callback of callbackSet) {
      callback();
    }
    callbackSet.clear();
    writeFileSync(sideEffectFileUrl, renderSideEffects(sideEffects));
    sideEffectDirectorySnapshot.compare();
  };

  const returnValue = collectFunctionSideEffects(fn, sideEffectDetectors, {
    rootDirectoryUrl,
  });
  if (returnValue && typeof returnValue.then === "function") {
    return returnValue.then((sideEffects) => {
      onSideEffectsCollected(sideEffects);
    });
  }
  onSideEffectsCollected(returnValue);
  return undefined;
};
