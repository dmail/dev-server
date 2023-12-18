import { setRoundedPrecision } from "./decimals.js";

export const byteAsFileSize = (numberOfBytes) => {
  return formatBytes(numberOfBytes);
};

export const byteAsMemoryUsage = (metricValue, { decimals } = {}) => {
  return formatBytes(metricValue, { decimals, fixedDecimals: true });
};

const formatBytes = (number, { fixedDecimals = false, decimals } = {}) => {
  if (number === 0) {
    return `0 B`;
  }
  const exponent = Math.min(
    Math.floor(Math.log10(number) / 3),
    BYTE_UNITS.length - 1,
  );
  const unitNumber = number / Math.pow(1000, exponent);
  const unitName = BYTE_UNITS[exponent];
  if (decimals === undefined) {
    if (unitNumber < 100) {
      decimals = 1;
    } else {
      decimals = 0;
    }
  }
  const unitNumberRounded = setRoundedPrecision(unitNumber, {
    decimals,
    decimalsWhenSmall: 1,
  });
  if (fixedDecimals) {
    return `${unitNumberRounded.toFixed(decimals)} ${unitName}`;
  }
  return `${unitNumberRounded} ${unitName}`;
};

const BYTE_UNITS = ["B", "kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
