import { createException } from "@jsenv/exception";
import { writeFileSync } from "@jsenv/filesystem";
import { renderTerminalSvg } from "@jsenv/terminal-recorder";
import { urlToBasename, urlToExtension, urlToRelativeUrl } from "@jsenv/urls";
import ansiRegex from "ansi-regex";
import { replaceFluctuatingValues } from "../replace_fluctuating_values.js";

export const createBigSizeEffect =
  ({ details, dedicatedFile }) =>
  (sideEffect, text) => {
    if (text.length > details.length) {
      return {
        type: "details",
        open: false,
      };
    }
    if (text.length > dedicatedFile.length) {
      return {
        type: "dedicated_file",
      };
    }
    const lineCount = text.split("\n").length;
    if (lineCount > details.lines) {
      return {
        type: "details",
        open: false,
      };
    }
    if (lineCount > dedicatedFile.lines) {
      return {
        type: "dedicated_file",
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
    getBigSizeEffect = createBigSizeEffect({
      details: { line: 15, length: 2000 },
      // dedicated_file not implemented yet
      // the idea is that some values like the return value can be big
      // and in that case we might want to move it to an other file
      dedicatedFile: { line: 50, length: 5000 },
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
      getBigSizeEffect,
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
    getBigSizeEffect,
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
  const bigSizeEffect = getBigSizeEffect(sideEffect, text);
  if (!bigSizeEffect) {
    return `${stepTitle}

${text}`;
  }
  // for now we'll use details
  const { open } = bigSizeEffect;
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
      let sourceMd = renderMarkdownBlock(sourceCode, "js");
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
        return renderMarkdownBlock("undefined", "js");
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
        return renderMarkdownBlock(
          replace(exceptionText, { stringType: "error" }),
        );
      }
      return renderMarkdownBlock(
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
      return renderFileContent(text, {
        sideEffect,
        sideEffectFileUrl,
        replace,
      });
    }
    if (text.type === "link") {
      return renderLinkMarkdown(text.value, { replace });
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
  return renderMarkdownBlock(
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

export const renderFileContent = (
  text,
  { sideEffect, sideEffectFileUrl, replace },
) => {
  const { url, buffer, outDirectoryReason } = sideEffect.value;
  const { value, urlInsideOutDirectory, relativeUrl } = text;

  if (outDirectoryReason) {
    const outRelativeUrl = urlToRelativeUrl(
      urlInsideOutDirectory,
      sideEffectFileUrl,
      { preferRelativeNotation: true },
    );
    writeFileSync(urlInsideOutDirectory, buffer);
    let md = "";
    if (
      outDirectoryReason === "lot_of_chars" ||
      outDirectoryReason === "lot_of_lines"
    ) {
      md += "\n";
      md += renderMarkdownBlock(escapeMarkdown(replace(value)));
      const fileLink = renderLinkMarkdown(
        {
          text: relativeUrl,
          href: outRelativeUrl,
        },
        { replace },
      );
      md += `\nsee ${fileLink} for more`;
      return md;
    }
    md += renderLinkMarkdown(
      {
        text: relativeUrl,
        href: outRelativeUrl,
      },
      { replace },
    );
    return md;
  }
  let content = value;
  const extension = urlToExtension(url).slice(1);
  if (extension === "md") {
    content = escapeMarkdown(content);
  }
  return renderMarkdownBlock(replace(content, { fileUrl: url }), extension);
};

const escapeMarkdown = (content) => {
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
  return escaped;
};

export const renderLinkMarkdown = ({ href, text }, { replace }) => {
  return `[${replace(text)}](${replace(href)})`;
};

export const renderMarkdownDetails = (text, { open, summary, indent = 0 }) => {
  return `${"  ".repeat(indent)}<details${open ? " open" : ""}>
${"  ".repeat(indent + 1)}<summary>${summary}</summary>

${text}

${"  ".repeat(indent)}</details>`;
};

export const renderMarkdownBlock = (value, blockName = "") => {
  const start = "```";
  const end = "```";
  return `${start}${blockName}
${value}
${end}`;
};
