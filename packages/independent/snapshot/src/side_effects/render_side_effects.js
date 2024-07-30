import { createException } from "@jsenv/exception";
import { writeFileSync } from "@jsenv/filesystem";
import { renderTerminalSvg } from "@jsenv/terminal-recorder";
import { urlToBasename, urlToExtension, urlToRelativeUrl } from "@jsenv/urls";
import ansiRegex from "ansi-regex";
import { replaceFluctuatingValues } from "../replace_fluctuating_values.js";

export const createDetailsOnMaxSizeCondition =
  ({ maxLines, maxLength }) =>
  (sideEffect, text) => {
    if (maxLength && text.length > maxLength) {
      return {
        open: false,
      };
    }
    if (maxLines && text.split("\n").length > maxLines) {
      return {
        open: false,
      };
    }
    return null;
  };

export const renderSideEffects = (
  sideEffects,
  {
    sideEffectFileUrl,
    outDirectoryUrl,
    generatedBy = true,
    titleLevel = 1,
    shouldUseDetails = createDetailsOnMaxSizeCondition({
      maxLines: 15,
      maxLength: 2000,
    }),
    errorStackHidden,
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
  for (const sideEffect of sideEffects) {
    if (sideEffect.skippable) {
      continue;
    }
    if (sideEffect.code === "source_code") {
      continue;
    }
    sideEffectNumber++;
    sideEffect.number = sideEffectNumber;
  }
  const lastSideEffectNumber = sideEffectNumber;

  for (const sideEffect of sideEffects) {
    if (sideEffect.skippable) {
      continue;
    }
    if (markdown) {
      markdown += "\n\n";
    }
    markdown += renderOneSideEffect(sideEffect, {
      sideEffectFileUrl,
      outDirectoryUrl,
      rootDirectoryUrl,
      titleLevel,
      shouldUseDetails,
      replace,
      errorStackHidden,
      lastSideEffectNumber,
    });
  }
  if (generatedBy) {
    let generatedByLink = renderSmallLink(
      {
        text: "@jsenv/snapshot",
        href: "https://github.com/jsenv/core/tree/main/packages/independent/snapshot",
      },
      {
        prefix: "Generated by ",
      },
    );
    markdown += "\n\n";
    markdown += generatedByLink;
  }
  return markdown;
};

export const renderSmallLink = (
  link,
  { prefix = "", suffix = "", indent } = {},
) => {
  return renderSubMarkdown(
    `${prefix}<a href="${link.href}">${link.text}</a>${suffix}`,
    {
      indent,
    },
  );
};

const renderSubMarkdown = (content, { indent = 0 }) => {
  return `${"  ".repeat(indent)}<sub>
${"  ".repeat(indent + 1)}${content}
${"  ".repeat(indent)}</sub>`;
};

const renderOneSideEffect = (
  sideEffect,
  {
    sideEffectFileUrl,
    outDirectoryUrl,
    rootDirectoryUrl,
    titleLevel,
    shouldUseDetails,
    replace,
    errorStackHidden,
    lastSideEffectNumber,
  },
) => {
  const { render } = sideEffect;
  if (typeof render !== "object") {
    throw new TypeError(
      `sideEffect.render should be an object, got ${render} on side effect with type "${sideEffect.type}"`,
    );
  }
  const { md } = sideEffect.render;
  let { label, text } = md({
    sideEffectFileUrl,
    outDirectoryUrl,
    replace,
    rootDirectoryUrl,
    lastSideEffectNumber,
  });
  if (text) {
    text = renderText(text, {
      sideEffect,
      sideEffectFileUrl,
      outDirectoryUrl,
      replace,
      rootDirectoryUrl,
      errorStackHidden,
      onRenderError: () => {
        if (sideEffect.number === 1 && lastSideEffectNumber === 1) {
          label = null;
        }
      },
    });
  }
  if (sideEffect.code === "source_code") {
    return text;
  }
  if (!label) {
    return text;
  }
  const stepTitle = `${"#".repeat(titleLevel)} ${sideEffect.number}/${lastSideEffectNumber} ${replace(label)}`;
  if (!text) {
    return stepTitle;
  }
  const shouldUseDetailsResult = shouldUseDetails(sideEffect, text);
  if (!shouldUseDetailsResult) {
    return `${stepTitle}

${text}`;
  }
  const { open } = shouldUseDetailsResult;
  return `${stepTitle}

${renderMarkdownDetails(text, {
  open,
  summary: "details",
})}`;
};

const renderText = (
  text,
  {
    sideEffect,
    sideEffectFileUrl,
    outDirectoryUrl,
    replace,
    rootDirectoryUrl,
    errorStackHidden,
    onRenderError = () => {},
  },
) => {
  if (text && typeof text === "object") {
    if (text.type === "source_code") {
      const { sourceCode, callSite } = text.value;
      let sourceMd = wrapIntoMarkdownBlock(sourceCode, "js");
      if (!callSite) {
        return sourceMd;
      }
      const callSiteRelativeUrl = urlToRelativeUrl(
        callSite.url,
        sideEffectFileUrl,
        { preferRelativeNotation: true },
      );
      const sourceCodeLinkText = `${callSiteRelativeUrl}:${callSite.line}:${callSite.column}`;
      const sourceCodeLinkHref = `${callSiteRelativeUrl}#L${callSite.line}`;
      sourceMd += "\n";
      sourceMd += renderSmallLink({
        text: sourceCodeLinkText,
        href: sourceCodeLinkHref,
      });
      return sourceMd;
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
        onRenderError();
        const exception = createException(text.value, { rootDirectoryUrl });
        const exceptionText = errorStackHidden
          ? `${exception.name}: ${exception.message}`
          : exception.stack || exception.message || exception;
        const potentialAnsi = renderPotentialAnsi(exceptionText, {
          sideEffect,
          sideEffectFileUrl,
          outDirectoryUrl,
          replace,
        });
        if (potentialAnsi) {
          return potentialAnsi;
        }
        return wrapIntoMarkdownBlock(
          replace(exceptionText, { stringType: "error" }),
        );
      }
      return wrapIntoMarkdownBlock(
        replace(JSON.stringify(value, null, "  "), { stringType: "json" }),
        "js",
      );
    }
    if (text.type === "console") {
      return renderConsole(text.value, {
        sideEffect,
        sideEffectFileUrl,
        outDirectoryUrl,
        replace,
      });
    }
    if (text.type === "file_content") {
      return renderFileContent(text, { replace });
    }
  }
  return replace(text);
};

export const renderConsole = (
  string,
  { sideEffect, sideEffectFileUrl, outDirectoryUrl, replace },
) => {
  const potentialAnsi = renderPotentialAnsi(string, {
    sideEffect,
    sideEffectFileUrl,
    outDirectoryUrl,
    replace,
  });
  if (potentialAnsi) {
    return potentialAnsi;
  }
  return wrapIntoMarkdownBlock(
    replace(string, { stringType: "console" }),
    "console",
  );
};

const renderPotentialAnsi = (
  string,
  { sideEffect, sideEffectFileUrl, outDirectoryUrl, replace },
) => {
  if (!ansiRegex().test(string)) {
    return null;
  }
  let svgFilename = urlToBasename(outDirectoryUrl);
  svgFilename += `_${sideEffect.code}`;
  if (sideEffect.counter) {
    svgFilename += `_${sideEffect.counter}`;
  }
  svgFilename += ".svg";
  const svgFileUrl = new URL(`./${svgFilename}`, outDirectoryUrl);
  let svgFileContent = renderTerminalSvg(string, {
    head: false,
    paddingTop: 10,
    paddingBottom: 10,
  });
  svgFileContent = replace(svgFileContent, { fileUrl: svgFileUrl });
  writeFileSync(svgFileUrl, svgFileContent);
  const svgFileRelativeUrl = urlToRelativeUrl(svgFileUrl, sideEffectFileUrl);
  return `![img](${svgFileRelativeUrl})`;
  // we will write a svg file
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

${"  ".repeat(indent)}</details>`;
};

export const wrapIntoMarkdownBlock = (value, blockName = "") => {
  const start = "```";
  const end = "```";
  return `${start}${blockName}
${value}
${end}`;
};
