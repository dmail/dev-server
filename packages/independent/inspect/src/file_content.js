const asideFormatterDefault = (v) => v;
const markerFormatterDefault = (v) => v;

export const inspectFileContent = ({
  content,
  line,
  column,

  linesAbove = 3,
  linesBelow = 0,
  lineMaxWidth = 120,
  lineNumbersOnTheLeft = true,
  lineMarker = true,
  columnMarker = true,
  formatter = {},
} = {}) => {
  const formatAside = formatter.aside || asideFormatterDefault;
  const formatMarker = formatter.marker || markerFormatterDefault;

  const lineStrings = content.split(/\r?\n/);
  if (line === 0) line = 1;
  let lineStartIndex = line - 1 - linesAbove;
  if (lineStartIndex < 0) {
    lineStartIndex = 0;
  }
  let lineEndIndex = line - 1 + linesBelow;
  if (lineEndIndex > lineStrings.length - 1) {
    lineEndIndex = lineStrings.length - 1;
  }
  if (lineStartIndex === lineEndIndex) {
    lineMarker = false; // useless because last line
  }
  let lineIndex = lineStartIndex;

  if (column === undefined) {
    columnMarker = false;
    column = 1;
  }
  if (column === 0) column = 1;

  let columnsBefore;
  let columnsAfter;
  if (column > lineMaxWidth) {
    columnsBefore = column - Math.ceil(lineMaxWidth / 2);
    columnsAfter = column + Math.floor(lineMaxWidth / 2);
  } else {
    columnsBefore = 0;
    columnsAfter = lineMaxWidth;
  }
  let columnMarkerIndex = column - 1 - columnsBefore;

  let source = "";
  while (lineIndex <= lineEndIndex) {
    const lineString = lineStrings[lineIndex];
    const lineNumber = lineIndex + 1;
    const isLastLine = lineIndex === lineEndIndex;
    const isMainLine = lineNumber === line;
    lineIndex++;

    write_aside: {
      if (lineMarker) {
        if (isMainLine) {
          source += `${formatMarker(">", "line")} `;
        } else {
          source += "  ";
        }
      }
      if (lineNumbersOnTheLeft) {
        // fillRight to ensure if line moves from 7,8,9 to 10 the display is still great
        const asideSource = `${fillRight(lineNumber, lineEndIndex + 1)} |`;
        source += `${formatAside(asideSource)} `;
      }
    }
    write_line: {
      source += truncateLine(lineString, {
        start: columnsBefore,
        end: columnsAfter,
        prefix: "…",
        suffix: "…",
        format: (char, type) => {
          if (type === "prefix") {
            return formatMarker(char, "overflow_left");
          }
          if (type === "suffix") {
            return formatMarker(char, "overflow_right");
          }
          return char;
        },
      });
    }
    write_column_marker: {
      if (columnMarker && isMainLine) {
        source += `\n`;
        if (lineMarker) {
          source += "  ";
        }
        if (lineNumbersOnTheLeft) {
          const asideSpaces = `${fillRight(lineNumber, lineEndIndex + 1)} | `
            .length;
          source += " ".repeat(asideSpaces);
        }
        source += " ".repeat(columnMarkerIndex);
        source += formatMarker("^", "column");
      }
    }
    if (!isLastLine) {
      source += "\n";
    }
  }
  return source;
};

const truncateLine = (line, { start, end, prefix, suffix, format }) => {
  const lastIndex = line.length;

  if (line.length === 0) {
    // don't show any ellipsis if the line is empty
    // because it's not truncated in that case
    return "";
  }

  const startTruncated = start > 0;
  const endTruncated = lastIndex > end;

  let from = startTruncated ? start + prefix.length : start;
  let to = endTruncated ? end - suffix.length : end;
  if (to > lastIndex) to = lastIndex;

  if (start >= lastIndex || from === to) {
    return "";
  }
  let result = "";
  while (from < to) {
    result += format(line[from], "char");
    from++;
  }
  if (result.length === 0) {
    return "";
  }
  if (startTruncated && endTruncated) {
    return `${format(prefix, "prefix")}${result}${format(suffix, "suffix")}`;
  }
  if (startTruncated) {
    return `${format(prefix, "prefix")}${result}`;
  }
  if (endTruncated) {
    return `${result}${format(suffix, "suffix")}`;
  }
  return result;
};

const fillRight = (value, biggestValue, char = " ") => {
  const width = String(value).length;
  const biggestWidth = String(biggestValue).length;
  let missingWidth = biggestWidth - width;
  let padded = "";
  padded += value;
  while (missingWidth--) {
    padded += char;
  }
  return padded;
};
