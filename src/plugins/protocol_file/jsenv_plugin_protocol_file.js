import {
  assertAndNormalizeDirectoryUrl,
  comparePathnames,
} from "@jsenv/filesystem";
import {
  applyFileSystemMagicResolution,
  getExtensionsToTry,
} from "@jsenv/node-esm-resolution";
import { pickContentType } from "@jsenv/server";
import {
  ensurePathnameTrailingSlash,
  urlIsInsideOf,
  urlToRelativeUrl,
} from "@jsenv/urls";
import { CONTENT_TYPE } from "@jsenv/utils/src/content_type/content_type.js";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { pathToFileURL } from "node:url";

const html404AndParentDirIsEmptyFileUrl = new URL(
  "./html_404_and_parent_dir_is_empty.html",
  import.meta.url,
);
const html404AndParentDirFileUrl = new URL(
  "./html_404_and_parent_dir.html",
  import.meta.url,
);
const htmlFileUrlForDirectory = new URL("./directory.html", import.meta.url);

export const jsenvPluginProtocolFile = ({
  magicExtensions = ["inherit", ".js"],
  magicDirectoryIndex = true,
  preserveSymlinks = false,
}) => {
  return [
    {
      name: "jsenv:fs_redirection",
      appliesDuring: "*",
      redirectReference: (reference) => {
        // http, https, data, about, ...
        if (!reference.url.startsWith("file:")) {
          return null;
        }
        if (reference.isInline) {
          return null;
        }
        // ignore root file url
        if (reference.url === "file:///" || reference.url === "file://") {
          reference.leadsToADirectory = true;
          return `ignore:file:///`;
        }
        // ignore "./" on new URL("./")
        // if (
        //   reference.subtype === "new_url_first_arg" &&
        //   reference.specifier === "./"
        // ) {
        //   return `ignore:${reference.url}`;
        // }
        // ignore all new URL second arg
        if (reference.subtype === "new_url_second_arg") {
          return `ignore:${reference.url}`;
        }

        const urlObject = new URL(reference.url);
        let stat;
        try {
          stat = statSync(urlObject);
        } catch (e) {
          if (e.code === "ENOENT") {
            stat = null;
          } else {
            throw e;
          }
        }

        const { search, hash } = urlObject;
        let { pathname } = urlObject;
        const pathnameUsesTrailingSlash = pathname.endsWith("/");
        urlObject.search = "";
        urlObject.hash = "";

        // force trailing slash on directories
        if (stat && stat.isDirectory() && !pathnameUsesTrailingSlash) {
          urlObject.pathname = `${pathname}/`;
        }
        // otherwise remove trailing slash if any
        if (stat && !stat.isDirectory() && pathnameUsesTrailingSlash) {
          // a warning here? (because it's strange to reference a file with a trailing slash)
          urlObject.pathname = pathname.slice(0, -1);
        }

        let url = urlObject.href;
        const shouldApplyFilesystemMagicResolution =
          reference.type === "js_import";
        if (shouldApplyFilesystemMagicResolution) {
          const filesystemResolution = applyFileSystemMagicResolution(url, {
            fileStat: stat,
            magicDirectoryIndex,
            magicExtensions: getExtensionsToTry(
              magicExtensions,
              reference.ownerUrlInfo.url,
            ),
          });
          if (filesystemResolution.stat) {
            stat = filesystemResolution.stat;
            url = filesystemResolution.url;
          }
        }
        if (!stat) {
          return null;
        }
        reference.leadsToADirectory = stat && stat.isDirectory();
        const urlRaw = preserveSymlinks ? url : resolveSymlink(url);
        const resolvedUrl = `${urlRaw}${search}${hash}`;
        return resolvedUrl;
      },
    },
    {
      name: "jsenv:fs_resolution",
      appliesDuring: "*",
      resolveReference: {
        filesystem: (reference) => {
          const ownerUrlInfo = reference.ownerUrlInfo;
          const baseUrl =
            ownerUrlInfo.type === "directory"
              ? ensurePathnameTrailingSlash(ownerUrlInfo.url)
              : ownerUrlInfo.url;
          return new URL(reference.specifier, baseUrl).href;
        },
      },
    },
    {
      name: "jsenv:@fs",
      // during build it's fine to use "file://"" urls
      // but during dev it's a browser running the code
      // so absolute file urls needs to be relativized
      appliesDuring: "dev",
      resolveReference: (reference) => {
        if (reference.specifier.startsWith("/@fs/")) {
          const fsRootRelativeUrl = reference.specifier.slice("/@fs/".length);
          return `file:///${fsRootRelativeUrl}`;
        }
        return null;
      },
      formatReference: (reference) => {
        if (!reference.generatedUrl.startsWith("file:")) {
          return null;
        }
        const { rootDirectoryUrl } = reference.ownerUrlInfo.context;
        if (urlIsInsideOf(reference.generatedUrl, rootDirectoryUrl)) {
          return `/${urlToRelativeUrl(
            reference.generatedUrl,
            rootDirectoryUrl,
          )}`;
        }
        return `/@fs/${reference.generatedUrl.slice("file:///".length)}`;
      },
    },
    {
      name: "jsenv:file_url_fetching",
      appliesDuring: "*",
      fetchUrlContent: (urlInfo) => {
        if (!urlInfo.url.startsWith("file:")) {
          return null;
        }
        const urlObject = new URL(urlInfo.url);
        const { firstReference } = urlInfo;
        if (firstReference.leadsToADirectory) {
          const directoryContentArray = readdirSync(urlObject);
          if (firstReference.type === "filesystem") {
            const content = JSON.stringify(directoryContentArray, null, "  ");
            return {
              type: "directory",
              contentType: "application/json",
              content,
            };
          }
          const acceptsHtml = urlInfo.context.request
            ? pickContentType(urlInfo.context.request, ["text/html"])
            : false;
          if (acceptsHtml) {
            const html = generateHtmlForDirectory(
              urlObject.href,
              directoryContentArray,
              urlInfo.context.rootDirectoryUrl,
            );
            return {
              contentType: "text/html",
              content: html,
            };
          }
          return {
            type: "directory",
            contentType: "application/json",
            content: JSON.stringify(directoryContentArray, null, "  "),
          };
        }
        const contentType = CONTENT_TYPE.fromUrlExtension(urlInfo.url);
        if (contentType === "text/html") {
          try {
            const fileBuffer = readFileSync(urlObject);
            const content = String(fileBuffer);
            return {
              content,
              contentType,
              contentLength: fileBuffer.length,
            };
          } catch (e) {
            if (e.code !== "ENOENT") {
              throw e;
            }
            const parentDirectoryUrl = new URL("./", urlInfo.url);
            if (!existsSync(parentDirectoryUrl)) {
              throw e;
            }
            const parentDirectoryContentArray = readdirSync(
              new URL(parentDirectoryUrl),
            );
            const html = generateHtmlForENOENTOnHtmlFile(
              urlInfo.url,
              parentDirectoryContentArray,
              parentDirectoryUrl,
              urlInfo.context.rootDirectoryUrl,
            );
            return {
              contentType: "text/html",
              content: html,
            };
          }
        }
        const fileBuffer = readFileSync(urlObject);
        const content = CONTENT_TYPE.isTextual(contentType)
          ? String(fileBuffer)
          : fileBuffer;
        return {
          content,
          contentType,
          contentLength: fileBuffer.length,
        };
      },
    },
  ];
};

const generateHtmlForDirectory = (
  directoryUrl,
  directoryContentArray,
  rootDirectoryUrl,
) => {
  directoryUrl = assertAndNormalizeDirectoryUrl(directoryUrl);
  const htmlForDirectory = String(readFileSync(htmlFileUrlForDirectory));
  const replacers = {
    directoryRelativeUrl: urlToRelativeUrl(directoryUrl, rootDirectoryUrl),
    directoryUrl,
    directoryContent: () =>
      generateDirectoryContent(
        directoryContentArray,
        directoryUrl,
        rootDirectoryUrl,
      ),
  };
  const html = replacePlaceholders(htmlForDirectory, replacers);
  return html;
};
const generateHtmlForENOENTOnHtmlFile = (
  url,
  parentDirectoryContentArray,
  parentDirectoryUrl,
  rootDirectoryUrl,
) => {
  if (parentDirectoryContentArray.length === 0) {
    const htmlFor404AndParentDirIsEmpty = String(
      readFileSync(html404AndParentDirIsEmptyFileUrl),
    );
    return replacePlaceholders(htmlFor404AndParentDirIsEmpty, {
      fileRelativeUrl: urlToRelativeUrl(url, rootDirectoryUrl),
      parentDirectoryRelativeUrl: urlToRelativeUrl(
        parentDirectoryUrl,
        rootDirectoryUrl,
      ),
    });
  }
  const htmlFor404AndParentDir = String(
    readFileSync(html404AndParentDirFileUrl),
  );

  const replacers = {
    fileUrl: url,
    fileRelativeUrl: urlToRelativeUrl(url, rootDirectoryUrl),
    parentDirectoryUrl,
    parentDirectoryRelativeUrl: urlToRelativeUrl(
      parentDirectoryUrl,
      rootDirectoryUrl,
    ),
    parentDirectoryContent: () =>
      generateDirectoryContent(
        parentDirectoryContentArray,
        parentDirectoryUrl,
        rootDirectoryUrl,
      ),
  };
  const html = replacePlaceholders(htmlFor404AndParentDir, replacers);
  return html;
};
const generateDirectoryContent = (
  directoryContentArray,
  directoryUrl,
  rootDirectoryUrl,
) => {
  const sortedNames = [];
  for (const filename of directoryContentArray) {
    const fileUrlObject = new URL(filename, directoryUrl);
    if (lstatSync(fileUrlObject).isDirectory()) {
      sortedNames.push(`${filename}/`);
    } else {
      sortedNames.push(filename);
    }
  }
  sortedNames.sort(comparePathnames);
  return sortedNames.map((filename) => {
    const fileUrlObject = new URL(filename, directoryUrl);
    const fileUrl = String(fileUrlObject);
    let fileUrlRelative = urlToRelativeUrl(fileUrl, rootDirectoryUrl);
    return `<li>
    <a href="/${fileUrlRelative}">/${fileUrlRelative}</a>
  </li>`;
  }).join(`
  `);
};
const replacePlaceholders = (html, replacers) => {
  return html.replace(/\$\{(\w+)\}/g, (match, name) => {
    const replacer = replacers[name];
    if (replacer === undefined) {
      return match;
    }
    if (typeof replacer === "function") {
      return replacer();
    }
    return replacer;
  });
};

const resolveSymlink = (fileUrl) => {
  const urlObject = new URL(fileUrl);
  const realpath = realpathSync(urlObject);
  const realUrlObject = pathToFileURL(realpath);
  if (urlObject.pathname.endsWith("/")) {
    realUrlObject.pathname += `/`;
  }
  return realUrlObject.href;
};
