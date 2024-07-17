import { marked } from "marked";
import {
  readDirectorySync,
  readEntryStatSync,
  readFileSync,
  writeFileSync,
  visitStructureSync,
} from "@jsenv/filesystem";
import { parseHtml, findHtmlNode, getHtmlNodeText } from "@jsenv/ast";
import { urlToRelativeUrl, urlToFilename } from "@jsenv/urls";

const extractMarkdownFileTitle = (mdFileUrl) => {
  const mdFileContent = String(readFileSync(mdFileUrl));
  const mdAsHtml = marked.parse(mdFileContent);
  const htmlTree = parseHtml({ html: mdAsHtml });
  const h1 = findHtmlNode(htmlTree, (node) => node.nodeName === "h1");
  const title = h1 ? getHtmlNodeText(h1) : urlToFilename(mdFileUrl);
  return title;
};
const generateTableOfContents = (directoryUrl) => {
  let tableOfContent = "";
  const entryNameArray = readDirectorySync(directoryUrl);
  for (const entryName of entryNameArray) {
    const entryUrl = new URL(entryName, directoryUrl);
    const entryStat = readEntryStatSync(entryUrl);
    if (!entryStat.isDirectory()) {
      continue;
    }
    // now get md files
    const subEntryNameArray = readDirectorySync(entryUrl);
    for (const subEntryName of subEntryNameArray) {
      if (!subEntryName.endsWith(".md")) {
        continue;
      }
      const mdFileUrl = new URL(subEntryName, `${entryUrl}/`);
      const mdFileContent = String(readFileSync(mdFileUrl));
      const mdAsHtml = marked.parse(mdFileContent);
      const htmlTree = parseHtml({ html: mdAsHtml });
      const h1 = findHtmlNode(htmlTree, (node) => node.nodeName === "h1");
      const title = h1 ? getHtmlNodeText(h1) : subEntryName;
      if (tableOfContent) {
        tableOfContent += "\n";
      }
      tableOfContent += `<a href="./${entryName}/${subEntryName}">${title}</a>`;
    }
  }
  return tableOfContent;
};
const generatePrevNextNav = (url, prevUrl, nextUrl) => {
  // single
  if (!prevUrl && !nextUrl) {
    return "";
  }
  // first
  if (!prevUrl && nextUrl) {
    const nextTitle = extractMarkdownFileTitle(nextUrl);
    const nextUrlRelativeToCurrent = urlToRelativeUrl(nextUrl, url);
    return `<table>
  <tr>
    <td width="2000px" align="right" nowrap>
      <a href="${nextUrlRelativeToCurrent}">> ${nextTitle}</a>
    </td>
  </tr>
</table>`;
  }
  // last
  if (prevUrl && !nextUrl) {
    const prevTitle = extractMarkdownFileTitle(prevUrl);
    const prevUrlRelativeToCurrent = urlToRelativeUrl(prevUrl, url);
    return `<table>
 <tr>
  <td width="2000px" align="left" nowrap>
   <a href="${prevUrlRelativeToCurrent}">< ${prevTitle}</a>
  </td>
 </tr>
<table></table>`;
  }
  // between
  const prevTitle = extractMarkdownFileTitle(prevUrl);
  const prevUrlRelativeToCurrent = urlToRelativeUrl(prevUrl, url);
  const nextTitle = extractMarkdownFileTitle(nextUrl);
  const nextUrlRelativeToCurrent = urlToRelativeUrl(nextUrl, url);
  return `<table>
 <tr>
  <td width="2000px" align="left" nowrap>
   <a href="${prevUrlRelativeToCurrent}">< ${prevTitle}</a>
  </td>
  <td width="2000px" align="right" nowrap>
   <a href="${nextUrlRelativeToCurrent}">> ${nextTitle}</a>
  </td>
 </tr>
<table>`;
};
const replacePlaceholders = (string, replacers) => {
  const generateReplacement = (value, placeholder) => {
    let replacementWithMarkers = `<!-- PLACEHOLDER_START:${placeholder} --->
${value}
<!-- PLACEHOLDER_END --->`;
    return replacementWithMarkers;
  };

  string = string.replace(/\$\{(\w+)\}/g, (match, name) => {
    const replacer = replacers[name];
    if (replacer === undefined) {
      return match;
    }
    let replacement = typeof replacer === "function" ? replacer() : replacer;
    return generateReplacement(replacement);
  });
  string = string.replace(
    /<!-- PLACEHOLDER_START:(\w+) -->[\s\S]*<!-- PLACEHOLDER_END -->/g,
    (match, name) => {
      const replacer = replacers[name];
      if (replacer === undefined) {
        return match;
      }
      let replacement = typeof replacer === "function" ? replacer() : replacer;
      return generateReplacement(replacement);
    },
  );
};
const syncMarkdownContent = (markdownFileUrl, replacers) => {
  const mardownFileContent = String(readFileSync(markdownFileUrl));
  const markdownFileContentReplaced = replacePlaceholders(
    mardownFileContent,
    replacers,
  );
  writeFileSync(markdownFileUrl, markdownFileContentReplaced);
};

const syncMarkdownsInDirectory = (directoryUrl) => {
  visitStructureSync({
    directoryUrl,
    associations: {
      md: {
        "**/*.md": true,
      },
    },
    predicate: ({ md }) => md,
    onMatch: ({ url, prev, next }) => {
      syncMarkdownContent(url, {
        DIRECTORY_TABLE_OF_CONTENT: (markdownFileUrl) => {
          return generateTableOfContents(new URL("./", markdownFileUrl));
        },
        PREV_NEXT_NAV: () => {
          return generatePrevNextNav(url, prev?.url, next?.url);
        },
      });
    },
  });
};

syncMarkdownsInDirectory(new URL("./", import.meta.url));
