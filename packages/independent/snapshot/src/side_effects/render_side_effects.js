import { createException } from "@jsenv/exception";
import { urlToExtension } from "@jsenv/urls";
import { replaceFluctuatingValues } from "../replace_fluctuating_values.js";

export const createDetailsOnMaxLineCondition =
  (maxLines) => (sideEffect, text) => {
    if (text.split("\n").length > maxLines) {
      return {
        open: false,
      };
    }
    return null;
  };

export const renderSideEffects = (
  sideEffects,
  {
    generatedBy = true,
    titleLevel = 1,
    shouldUseDetails = createDetailsOnMaxLineCondition(5),
  } = {},
) => {
  const { rootDirectoryUrl, replaceFilesystemWellKnownValues } =
    sideEffects.options;

  const replace = (value, options) => {
    return replaceFluctuatingValues(value, {
      replaceFilesystemWellKnownValues,
      rootDirectoryUrl,
      ...options,
    });
  };

  let markdown = "";
  let sideEffectNumber = 0;
  let sideEffectNumberMap = new Map();
  for (const sideEffect of sideEffects) {
    if (sideEffect.skippable) {
      continue;
    }
    if (sideEffect.type === "source_code") {
      continue;
    }
    sideEffectNumber++;
    sideEffectNumberMap.set(sideEffect, sideEffectNumber);
  }
  const lastSideEffectNumber = sideEffectNumber;

  for (const sideEffect of sideEffects) {
    if (sideEffect.skippable) {
      continue;
    }
    if (markdown) {
      markdown += "\n\n";
    }
    const { render } = sideEffect;
    if (typeof render !== "object") {
      throw new TypeError(
        `sideEffect.render should be an object, got ${render} on side effect with type "${sideEffect.type}"`,
      );
    }
    const { md } = sideEffect.render;
    let { label, text } = md({ replace, rootDirectoryUrl });
    if (text) {
      text = renderText(text, { replace, rootDirectoryUrl });
    }
    if (sideEffect.type === "source_code") {
      markdown += text;
      continue;
    }
    if (label) {
      label = replace(label);
      const sideEffectNumber = sideEffectNumberMap.get(sideEffect);
      const stepTitle = `${"#".repeat(titleLevel)} ${sideEffectNumber}/${lastSideEffectNumber} ${label}`;
      markdown += stepTitle;
      if (text) {
        const shouldUseDetailsResult = shouldUseDetails(sideEffect, text);
        if (shouldUseDetailsResult) {
          const { open } = shouldUseDetailsResult;
          markdown += "\n\n";
          markdown += renderMarkdownDetails(text, {
            open,
            summary: "details",
          });
        } else {
          markdown += "\n\n";
          markdown += text;
        }
      }
    } else {
      markdown += text;
    }
  }
  if (generatedBy) {
    let generatedByLink = `Generated by [@jsenv/snapshot](https://github.com/jsenv/core/tree/main/packages/independent/snapshot)`;
    markdown += "\n\n";
    markdown += generatedByLink;
  }
  return markdown;
};

const renderText = (text, { replace, rootDirectoryUrl }) => {
  if (text && typeof text === "object") {
    if (text.type === "source_code") {
      return wrapIntoMarkdownBlock(text.value, "js");
    }
    if (text.type === "js_value") {
      const value = text.value;
      if (value === undefined) {
        return wrapIntoMarkdownBlock("undefined", "js");
      }
      if (
        value instanceof Error ||
        (value &&
          value.constructor &&
          value.constructor.name.includes("Error") &&
          value.stack &&
          typeof value.stack === "string")
      ) {
        const exception = createException(text.value, { rootDirectoryUrl });
        const exceptionText = replace(
          exception
            ? exception.stack || exception.message || exception
            : String(exception),
          {
            stringType: "error",
          },
        );
        return wrapIntoMarkdownBlock(exceptionText, "");
      }
      return wrapIntoMarkdownBlock(
        replace(JSON.stringify(value, null, "  "), {
          stringType: "json",
        }),
        "js",
      );
    }
    if (text.type === "console") {
      return wrapIntoMarkdownBlock(
        replace(text.value, { stringType: "console" }),
        "console",
      );
    }
    if (text.type === "file_content") {
      return renderFileContent(text, { replace });
    }
  }
  return replace(text);
};

export const renderFileContent = (text, { replace }) => {
  const { url } = text;
  let content = text.value;
  const extension = urlToExtension(url).slice(1);
  if (extension === "md") {
    let escaped = "";
    for (const char of content.split("")) {
      if (
        [
          "`",
          "*",
          "_",
          "{",
          "}",
          "[",
          "]",
          "(",
          ")",
          "#",
          "+",
          "-",
          ".",
          "!",
        ].includes(char)
      ) {
        escaped += `\\${char}`;
      } else {
        escaped += char;
      }
    }
    content = escaped;
  }
  return wrapIntoMarkdownBlock(replace(content, { fileUrl: url }), extension);
};

export const renderMarkdownDetails = (text, { open, summary, indent = 0 }) => {
  return `${"  ".repeat(indent)}<details${open ? " open" : ""}>
${"  ".repeat(indent + 1)}<summary>${summary}</summary>

${text}
</details>`;
  // ${"  ".repeat(indent)}</details>`;
};

export const wrapIntoMarkdownBlock = (value, blockName = "") => {
  const start = "```";
  const end = "```";
  return `${start}${blockName}
${value}
${end}`;
};
