import { urlToFilename } from "./url_to_filename.js";

export const generateInlineContentUrl = ({
  url,
  extension,
  line,
  column,
  lineEnd,
  columnEnd,
}) => {
  let generatedName = `L${line}C${column}`;
  if (lineEnd !== undefined && columnEnd !== undefined) {
    generatedName += `-L${lineEnd}C${columnEnd}`;
  }
  const filenameRaw = urlToFilename(url);
  const filename = `${filenameRaw}@${generatedName}${extension}`;
  // ideally we should keep query params from url
  // maybe we could use a custom scheme like "inline:"
  const inlineContentUrl = new URL(filename, url).href;
  return inlineContentUrl;
};
