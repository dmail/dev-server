import { inspect, determineQuote, inspectChar } from "@jsenv/inspect";

import { createDetailedMessage } from "../detailed_message.js";
import { comparisonToPath } from "../comparison_to_path.js";
import { isRegExp, isError } from "../object_subtype.js";

const MAX_HEIGHT = 10;
let MAX_WIDTH = 80;
const COLUMN_MARKER_CHAR = "^";
const EXPECTED_CONTINUES_WITH_MAX_LENGTH = 15;

export const stringsComparisonToErrorMessage = (comparison) => {
  const isStartsWithComparison = comparison.type === "starts_with";

  if (comparison.type !== "identity" && !isStartsWithComparison) {
    return undefined;
  }
  const { actual, expected } = comparison;
  if (typeof actual !== "string") {
    return undefined;
  }
  if (typeof expected !== "string") {
    return undefined;
  }

  const path = comparisonToPath(comparison);
  const enrichPath = (path, index, line, column) => {
    if (line === 0 && column < 100) {
      return `${path}[${index}]`;
    }
    return `${path}[${index}]#L${line + 1}C${column + 1}`;
  };
  const actualQuote = determineQuote(actual);
  const formatActualChar = (char) => {
    return inspectChar(char, { quote: actualQuote, preserveLineBreaks: true });
  };
  const expectedQuote = determineQuote(expected);
  const formatExpectedChar = (char) => {
    return inspectChar(char, {
      quote: expectedQuote,
      preserveLineBreaks: false,
    });
  };

  const stringName = stringNameFromComparison(comparison);
  const actualLength = actual.length;
  const expectedLength = expected.length;
  let i = 0;
  let lineIndex = 0;
  let columnIndex = 0;
  const lineStrings = actual.split(/\r?\n/);

  const formatDetails = ({ annotationLabel, expectedOverview = true }) => {
    if (actual.includes(`${COLUMN_MARKER_CHAR} unexpected character`)) {
      return {
        actual: inspect(actual, { preserveLineBreaks: true }),
        expected: inspect(expected, { preserveLineBreaks: true }),
      };
    }

    let details = "";
    let lineDisplayed = 0;

    const idealNumberOfRowBefore = Math.ceil(MAX_WIDTH / 2);
    let columnStart = columnIndex - idealNumberOfRowBefore;
    if (columnStart < 0) {
      columnStart = 0;
    }
    let columnEnd = columnStart + MAX_WIDTH;

    const writeLine = (lineSource) => {
      const lastCharIndex = lineSource.length;
      let charIndex = columnStart;
      if (columnStart > 0) {
        details += "…";
      }
      while (charIndex < columnEnd && charIndex < lastCharIndex) {
        const char = lineSource[charIndex];
        charIndex++;
        details += formatActualChar(char);
      }
      if (lastCharIndex > columnEnd) {
        details += "…";
      }
    };

    write_chars_before_annotation: {
      const idealNumberOfLineBefore = Math.ceil(MAX_HEIGHT / 2);
      let beforeLineStart = lineIndex - idealNumberOfLineBefore;
      if (beforeLineStart < 0) {
        beforeLineStart = 0;
      }
      const beforeLineEnd = lineIndex + 1;
      let beforeLineIndex = beforeLineStart;
      while (beforeLineIndex < beforeLineEnd) {
        const lineBefore = lineStrings[beforeLineIndex];
        beforeLineIndex++;
        writeLine(lineBefore);
        details += `\n`;
        lineDisplayed++;
      }
      details = details.slice(0, -1);
    }
    write_annotation: {
      const annotationColumn =
        columnStart === 0 ? columnIndex : columnIndex - columnStart + 1;
      const annotationIndentation = " ".repeat(annotationColumn);
      details += `\n${annotationIndentation}`;
      details += `${annotationLabel}`;
      if (expectedOverview) {
        details += ` ${expectedQuote}`;
        // put expected chars
        let expectedIndex = i;
        let remainingCharsToDisplayOnExpected =
          EXPECTED_CONTINUES_WITH_MAX_LENGTH;
        while (
          remainingCharsToDisplayOnExpected-- &&
          expectedIndex < expectedLength
        ) {
          const expectedChar = expected[expectedIndex];
          if (expectedIndex > i && isLineBreak(expectedChar)) {
            break;
          }
          expectedIndex++;
          details += formatExpectedChar(expectedChar);
        }
        details += `${expectedQuote}`;
        if (expectedIndex < expectedLength) {
          details += "…";
        }
      }
    }
    write_chars_after_annotation: {
      const lastLineIndex = lineStrings.length - 1;
      const idealNumberOfLineAfter = MAX_HEIGHT - lineDisplayed;
      let lineAfterStart = lineIndex + 1;
      if (lineAfterStart >= lastLineIndex) {
        break write_chars_after_annotation;
      }
      let lineAfterEnd = lineAfterStart + idealNumberOfLineAfter;
      if (lineAfterEnd > lastLineIndex) {
        lineAfterEnd = lastLineIndex;
      }
      if (lineAfterStart === lineAfterEnd) {
        break write_chars_after_annotation;
      }
      details += `\n`;
      let lineAfterIndex = lineAfterStart;
      while (lineAfterIndex < lineAfterEnd) {
        const afterLineSource = lineStrings[lineAfterIndex];
        lineAfterIndex++;
        writeLine(afterLineSource);
        details += `\n`;
        lineDisplayed++;
      }
      details = details.slice(0, -1);
    }

    return {
      details,
    };
  };

  mismatch: {
    while (i < actualLength && i < expectedLength) {
      const actualChar = actual[i];
      const expectedChar = expected[i];
      if (actualChar !== expectedChar) {
        let message = `unexpected character in ${stringName}`;
        return createDetailedMessage(message, {
          ...formatDetails({
            annotationLabel: `${COLUMN_MARKER_CHAR} unexpected ${inspect(
              actualChar,
            )}, expected to continue with`,
          }),
          path: enrichPath(path, i, lineIndex, columnIndex),
        });
      }
      if (isLineBreak(actualChar)) {
        lineIndex++;
        columnIndex = 0;
      } else {
        columnIndex++;
      }
      i++;
    }
  }
  too_short: {
    if (actualLength < expectedLength) {
      const missingCharacterCount = expectedLength - actualLength;
      let message = `${stringName} is too short`;
      if (missingCharacterCount === 1) {
        message += `, one character is missing`;
      } else {
        message += `, ${missingCharacterCount} characters are missing`;
      }
      return createDetailedMessage(message, {
        ...formatDetails({
          annotationLabel: `${COLUMN_MARKER_CHAR} expected to continue with`,
        }),
        path,
      });
    }
  }
  too_long: {
    i = expectedLength;
    const extraCharacterCount = actualLength - expectedLength;
    let message = `${stringName} is too long`;
    if (extraCharacterCount === 1) {
      message += `, it contains one extra character`;
    } else {
      message += `, it contains ${extraCharacterCount} extra characters`;
    }
    if (expectedLength > 0) {
      columnIndex--;
    }
    // const continuesWithLineBreak = isLineBreak(actual[expectedLength]);
    return createDetailedMessage(message, {
      ...formatDetails({
        annotationLabel:
          expectedLength === 0
            ? `${COLUMN_MARKER_CHAR} an empty string was expected`
            : `${COLUMN_MARKER_CHAR} expected to end here, on ${inspect(
                actual[actualLength - 1],
              )}`,
        expectedOverview: false,
      }),
      path,
    });
  }
};

const isLineBreak = (char) => {
  return char === "\n" || char === "\r";
};

const stringNameFromComparison = (comparison) => {
  if (detectRegExpToStringComparison(comparison)) {
    return `regexp`;
  }
  if (detectErrorMessageComparison(comparison)) {
    return `error message`;
  }
  if (detectFunctionNameComparison(comparison)) {
    return `function name`;
  }
  return `string`;
};
const detectRegExpToStringComparison = (comparison) => {
  const parentComparison = comparison.parent;
  if (parentComparison.type !== "to-string-return-value") {
    return false;
  }

  const grandParentComparison = parentComparison.parent;
  if (
    !isRegExp(grandParentComparison.actual) ||
    !isRegExp(grandParentComparison.expected)
  ) {
    return false;
  }

  return true;
};
const detectErrorMessageComparison = (comparison) => {
  const parentComparison = comparison.parent;
  if (parentComparison.type !== "property-value") {
    return false;
  }
  if (parentComparison.data !== "message") {
    return false;
  }

  const grandParentComparison = parentComparison.parent;
  if (
    !isError(grandParentComparison.actual) ||
    !isError(grandParentComparison.expected)
  ) {
    return false;
  }

  return true;
};
const detectFunctionNameComparison = (comparison) => {
  const parentComparison = comparison.parent;
  if (parentComparison.type !== "property-value") {
    return false;
  }
  if (parentComparison.data !== "name") {
    return false;
  }

  const grandParentComparison = parentComparison.parent;
  if (
    typeof grandParentComparison.actual !== "function" ||
    typeof grandParentComparison.expected !== "function"
  ) {
    return false;
  }

  return true;
};
