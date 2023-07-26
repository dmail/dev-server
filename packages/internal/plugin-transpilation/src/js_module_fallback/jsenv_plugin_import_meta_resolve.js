import { createMagicSource } from "@jsenv/sourcemap";

export const jsenvPluginImportMetaResolve = ({ needJsModuleFallback }) => {
  return {
    name: "jsenv:import_meta_resolve",
    appliesDuring: "*",
    init: (context) => {
      if (context.isSupportedOnCurrentClients("import_meta_resolve")) {
        return false;
      }
      if (needJsModuleFallback(context)) {
        // will be handled by systemjs, keep it untouched
        return false;
      }
      return true;
    },
    transformUrlContent: {
      js_module: async (urlInfo) => {
        const magicSource = createMagicSource(urlInfo.content);
        for (const referenceToOther of urlInfo.referenceToOthersSet) {
          if (referenceToOther.subtype === "import_meta_resolve") {
            const originalSpecifierLength = Buffer.byteLength(
              referenceToOther.specifier,
            );
            const specifierLength = Buffer.byteLength(
              referenceToOther.generatedSpecifier.slice(1, -1), // remove `"` around
            );
            const specifierLengthDiff =
              specifierLength - originalSpecifierLength;
            const { node } = referenceToOther.astInfo;
            const end = node.end + specifierLengthDiff;
            magicSource.replace({
              start: node.start,
              end,
              replacement: `new URL(${referenceToOther.generatedSpecifier}, import.meta.url).href`,
            });
            const currentLengthBeforeSpecifier = "import.meta.resolve(".length;
            const newLengthBeforeSpecifier = "new URL(".length;
            const lengthDiff =
              currentLengthBeforeSpecifier - newLengthBeforeSpecifier;
            referenceToOther.specifierColumn -= lengthDiff;
            referenceToOther.specifierStart -= lengthDiff;
            referenceToOther.specifierEnd =
              referenceToOther.specifierStart +
              Buffer.byteLength(referenceToOther.generatedSpecifier);
          }
        }
        return magicSource.toContentAndSourcemap();
      },
    },
  };
};