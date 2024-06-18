/*
 * LE PLUS DUR QU'IL FAUT FAIRE AVANT TOUT:
 *
 * - strings avec multiline
 *   souligne les chars ayant des diffs?
 *   ça aiderais a voir ou est le diff (évite de trop compter sur la couleur)
 * - url breakable diff tests
 * - lots of test on max columns
 * - array typed
 * - property descriptors
 * - errors
 * - prototype
 * - more wrapped value tests (from internal_value.xtest.js)
 * - numbers
 * - quote in
 *    - property name
 *    - url search param name
 *    - url search param value
 *    - url pathname
 *    - ensure backtick cannot be used for object property key
 *  - date
 *  - object integrity
 */

import stringWidth from "string-width";
import { ANSI, UNICODE } from "@jsenv/humanize";

import { isComposite } from "./is_composite.js";
import { isValidPropertyIdentifier } from "./property_identifier.js";
import { createValuePath } from "./value_path.js";
import { getObjectTag, objectPrototypeChainGenerator } from "./object_tag.js";
import {
  tokenizeFunction,
  defaultFunctionAnalysis,
} from "./tokenize_function.js";
import { tokenizeString } from "./tokenize_string.js";
import { tokenizeUrlSearch } from "./tokenize_url_search.js";
import { getWellKnownValuePath } from "./well_known_value.js";

const sameColor = ANSI.GREY;
const removedColor = ANSI.YELLOW;
const addedColor = ANSI.YELLOW;
const unexpectColor = ANSI.RED;
const expectColor = ANSI.GREEN;
/**
 * When a js value CANNOT EXISTS in actual or expected
 * the missing Node is set to PLACEHOLDER_FOR_NOTHING
 * For example,
 * - actual is a primitive, it cannot have properties
 * - expect is a composite, it can have properties
 * -> result into something like this
 * actual: true {
 *   <a>PLACEHOLDER_FOR_NOTHING
 * }
 * expect: {
 *   <a>ownPropertyDescriptorEntry
 * }
 */
const PLACEHOLDER_FOR_NOTHING = {
  placeholder: "nothing",
};
/**
 * When a js value DOES NOT EXISTS ANYMORE in actual or expected
 * the missing Node is set to PLACEHOLDER_WHEN_ADDED_OR_REMOVED
 * For example,
 * - actual has 2 properties: "a" and "b"
 * - expect has 2 propertie: "a" and "c"
 * -> result into something like this
 * actual: {
 *   <a>ownPropertyDescriptorEntry,
 *   <b>ownPropertyDescriptorEntry,
 *   <c>PLACEHOLDER_WHEN_ADDED_OR_REMOVED
 * },
 * expect: {
 *   <a>ownPropertyDescriptorEntry,
 *   <b>PLACEHOLDER_WHEN_ADDED_OR_REMOVED,
 *   <c>ownPropertyDescriptorEntry
 * }
 */
const PLACEHOLDER_WHEN_ADDED_OR_REMOVED = {
  placeholder: "added_or_removed",
};
const PLACEHOLDER_FOR_SAME = {
  placeholder: "same",
};
const PLACEHOLDER_FOR_MODIFIED = {
  placeholder: "modified",
};
const ARRAY_EMPTY_VALUE = { tag: "array_empty_value" };
const SOURCE_CODE_ENTRY_KEY = { key: "[[source code]]" };
const VALUE_OF_RETURN_VALUE_ENTRY_KEY = { key: "valueOf()" };
const SYMBOL_TO_PRIMITIVE_RETURN_VALUE_ENTRY_KEY = {
  key: "Symbol.toPrimitive()",
};

const setColor = (text, color) => {
  if (text.trim() === "") {
    // cannot set color of blank chars
    return text;
  }
  const textColored = ANSI.color(text, color);
  // if (color === ANSI.RED || color === ANSI.GREEN) {
  //   return ANSI.effect(textColored, ANSI.UNDERLINE);
  // }
  return textColored;
};
const measureLastLineColumns = (string) => {
  if (string.includes("\n")) {
    const lines = string.split("\n");
    const lastLine = lines[lines.length - 1];
    return stringWidth(lastLine);
  }
  return stringWidth(string);
};

const defaultOptions = {
  actual: undefined,
  expect: undefined,
  MAX_ENTRY_BEFORE_MULTILINE_DIFF: 2,
  MAX_ENTRY_AFTER_MULTILINE_DIFF: 2,
  MAX_DEPTH: 5,
  MAX_DEPTH_INSIDE_DIFF: 1,
  MAX_DIFF_PER_OBJECT: 2,
  MAX_COLUMNS: 100,
};

export const assert = (firstArg) => {
  const unexpectedParamNames = Object.keys(firstArg).filter(
    (key) => !Object.hasOwn(defaultOptions, key),
  );
  if (unexpectedParamNames.length > 0) {
    throw new TypeError(
      `"${unexpectedParamNames.join(",")}": there is no such param`,
    );
  }
  const {
    actual,
    expect,
    MAX_ENTRY_BEFORE_MULTILINE_DIFF,
    MAX_ENTRY_AFTER_MULTILINE_DIFF,
    MAX_DEPTH,
    MAX_DEPTH_INSIDE_DIFF,
    MAX_DIFF_PER_OBJECT,
    MAX_COLUMNS,
  } = {
    ...defaultOptions,
    ...firstArg,
  };

  const actualRootNode = createRootNode({
    colorWhenSolo: addedColor,
    colorWhenSame: sameColor,
    colorWhenModified: unexpectColor,
    name: "actual",
    origin: "actual",
    value: actual,
    // otherValue: expect,
    render: renderValue,
  });
  const expectRootNode = createRootNode({
    colorWhenSolo: removedColor,
    colorWhenSame: sameColor,
    colorWhenModified: expectColor,
    name: "expect",
    origin: "expect",
    value: expect,
    // otherValue: actual,
    render: renderValue,
  });

  const causeSet = new Set();

  /*
   * Comparison are objects used to compare actualNode and expectNode
   * It is used to visit all the entry a js value can have
   * and progressively create a tree of node and comparison
   * as the visit progresses a diff is generated
   * In the process an other type of object is used called *Entry
   * The following entry exists:
   * - ownPropertyDescriptorEntry
   * - ownPropertySymbolEntry
   * - indexedEntry
   *   - array values
   *   - typed array values
   *   - string values
   * - internalEntry
   *   - url internal props
   *   - valueOf()
   *   - Symbol.toPrimitive()
   *   - function body
   *   - map keys and values
   *   - ....
   * Entry represent something that can be found in the js value
   * and can be associated with one or many node (js_value)
   * For example ownPropertyDescriptorEntry have 3 nodes:
   *   ownPropertyNameNode
   *   descriptorKeyNode
   *   descriptorValueNode
   */
  let isNot = false;
  const compare = (actualNode, expectNode) => {
    if (actualNode.ignore && actualNode.comparison) {
      return actualNode.comparison;
    }
    if (expectNode.ignore && expectNode.comparison) {
      return expectNode.comparison;
    }
    const reasons = createReasons();
    const comparison = {
      actualNode,
      expectNode,
      reasons,
      done: false,
    };
    if (!actualNode.placeholder) {
      actualNode.otherNode = expectNode;
    }
    if (!expectNode.placeholder) {
      expectNode.otherNode = actualNode;
    }

    const onSelfDiff = (reason) => {
      reasons.self.modified.add(reason);
      causeSet.add(comparison);
    };
    const onAdded = (reason) => {
      reasons.self.added.add(reason);
      causeSet.add(comparison);
    };
    const onRemoved = (reason) => {
      reasons.self.removed.add(reason);
      causeSet.add(comparison);
    };

    const subcompareDuo = (
      actualChildNode,
      expectChildNode,
      { revertNot } = {},
    ) => {
      let isNotPrevious = isNot;
      if (revertNot) {
        isNot = !isNot;
      }
      const childComparison = compare(actualChildNode, expectChildNode);
      isNot = isNotPrevious;
      appendReasonGroup(
        comparison.reasons.inside,
        childComparison.reasons.overall,
      );
      return childComparison;
    };
    const subcompareSolo = (childNode, placeholderNode, compareOptions) => {
      if (childNode.name === "actual") {
        return subcompareDuo(childNode, placeholderNode, compareOptions);
      }
      return subcompareDuo(placeholderNode, childNode, compareOptions);
    };
    const subcompareChildNodesDuo = (actualNode, expectNode) => {
      const isSetEntriesComparison =
        actualNode.subgroup === "set_entries" &&
        expectNode.subgroup === "set_entries";
      const comparisonResultMap = new Map();
      const comparisonDiffMap = new Map();
      for (let [childName, actualChildNode] of actualNode.childNodeMap) {
        let expectChildNode;
        if (isSetEntriesComparison) {
          const actualSetValueNode = actualChildNode;
          for (const [, expectSetValueNode] of expectNode.childNodeMap) {
            if (expectSetValueNode.value === actualSetValueNode.value) {
              expectChildNode = expectSetValueNode;
              break;
            }
          }
        } else {
          expectChildNode = expectNode.childNodeMap.get(childName);
        }
        if (actualChildNode && expectChildNode) {
          const childComparison = subcompareDuo(
            actualChildNode,
            expectChildNode,
          );
          comparisonResultMap.set(childName, childComparison);
          if (childComparison.hasAnyDiff) {
            comparisonDiffMap.set(childName, childComparison);
          }
        } else {
          const addedChildComparison = subcompareSolo(
            actualChildNode,
            PLACEHOLDER_WHEN_ADDED_OR_REMOVED,
          );
          comparisonResultMap.set(childName, addedChildComparison);
          comparisonDiffMap.set(childName, addedChildComparison);
        }
      }
      for (let [childName, expectChildNode] of expectNode.childNodeMap) {
        if (isSetEntriesComparison) {
          const expectSetValueNode = expectChildNode;
          let hasEntry;
          for (const [, actualSetValueNode] of actualNode.childNodeMap) {
            if (actualSetValueNode.value === expectSetValueNode.value) {
              hasEntry = true;
              break;
            }
          }
          if (hasEntry) {
            continue;
          }
        } else if (comparisonResultMap.has(childName)) {
          continue;
        }
        const removedChildComparison = subcompareSolo(
          expectChildNode,
          PLACEHOLDER_WHEN_ADDED_OR_REMOVED,
        );
        comparisonResultMap.set(childName, removedChildComparison);
        comparisonDiffMap.set(childName, removedChildComparison);
      }
      actualNode.comparisonDiffMap = comparisonDiffMap;
      expectNode.comparisonDiffMap = comparisonDiffMap;
    };
    const subcompareChildNodesSolo = (node, placeholderNode) => {
      const comparisonDiffMap = new Map();
      for (const [childName, childNode] of node.childNodeMap) {
        const soloChildComparison = subcompareSolo(childNode, placeholderNode);
        if (placeholderNode !== PLACEHOLDER_FOR_SAME) {
          comparisonDiffMap.set(childName, soloChildComparison);
        }
      }
      node.comparisonDiffMap = comparisonDiffMap;
    };

    const visitDuo = (actualNode, expectNode) => {
      if (actualNode.comparison) {
        throw new Error(`actualNode (${actualNode.subgroup}) already compared`);
      }
      actualNode.comparison = comparison;
      if (expectNode.comparison) {
        throw new Error(`expectNode (${expectNode.subgroup}) already compared`);
      }
      expectNode.comparison = comparison;
      const { result, reason, propagate } = expectNode.comparer(
        actualNode,
        expectNode,
      );
      if (result === "failure") {
        onSelfDiff(reason);
        if (propagate) {
          subcompareChildNodesSolo(actualNode, propagate);
          subcompareChildNodesSolo(expectNode, propagate);
          return;
        }
        subcompareChildNodesDuo(actualNode, expectNode);
        return;
      }
      if (result === "success") {
        if (propagate) {
          const actualRender = actualNode.render;
          const expectRender = expectNode.render;
          actualNode.render = (props) => {
            actualNode.render = actualRender;
            // expectNode.render = expectRender;
            subcompareChildNodesSolo(actualNode, PLACEHOLDER_FOR_SAME);
            return actualRender(props);
          };
          expectNode.render = (props) => {
            // actualNode.render = actualRender;
            expectNode.render = expectRender;
            subcompareChildNodesSolo(expectNode, PLACEHOLDER_FOR_SAME);
            return expectRender(props);
          };
          if (actualNode.isHiddenWhenSame) {
            actualNode.isHidden = true;
          }
          if (expectNode.isHiddenWhenSame) {
            expectNode.isHidden = true;
          }
          return;
        }
        subcompareChildNodesDuo(actualNode, expectNode);
        return;
      }
      subcompareChildNodesDuo(actualNode, expectNode);
    };
    const visitSolo = (node, placeholderNode) => {
      if (node.comparison) {
        throw new Error(`node (${node.subgroup}) already compared`);
      }
      node.comparison = comparison;
      subcompareChildNodesSolo(node, placeholderNode);
    };

    visit: {
      if (actualNode.category === expectNode.category) {
        visitDuo(actualNode, expectNode);
        break visit;
      }
      // not found in expected (added or expect cannot have this type of value)
      if (
        actualNode === PLACEHOLDER_WHEN_ADDED_OR_REMOVED ||
        actualNode === PLACEHOLDER_FOR_NOTHING
      ) {
        visitSolo(expectNode, actualNode);
        onRemoved(getAddedOrRemovedReason(expectNode));
        break visit;
      }
      // not found in actual (removed or actual cannot have this type of value)
      if (
        expectNode === PLACEHOLDER_WHEN_ADDED_OR_REMOVED ||
        expectNode === PLACEHOLDER_FOR_NOTHING
      ) {
        visitSolo(actualNode, expectNode);
        onAdded(getAddedOrRemovedReason(actualNode));
        break visit;
      }
      // force actual to be same/modified
      if (
        actualNode === PLACEHOLDER_FOR_SAME ||
        actualNode === PLACEHOLDER_FOR_MODIFIED
      ) {
        visitSolo(expectNode, actualNode);
        break visit;
      }
      // force expect to be same/modified
      if (
        expectNode === PLACEHOLDER_FOR_SAME ||
        expectNode === PLACEHOLDER_FOR_MODIFIED
      ) {
        visitSolo(actualNode, expectNode);
        break visit;
      }
      // custom comparison
      if (
        actualNode.category === "primitive" ||
        actualNode.category === "composite"
      ) {
        if (expectNode.customCompare) {
          expectNode.customCompare(actualNode, expectNode, {
            subcompareChildNodesDuo,
            subcompareChildNodesSolo,
            subcompareDuo,
            subcompareSolo,
            onSelfDiff,
          });
          break visit;
        }
      }

      // not same category
      onSelfDiff(`should_be_${expect.category}`);
      // primitive expected
      if (
        expectNode.category === "primitive" &&
        actualNode.category === "composite"
      ) {
        const actualAsPrimitiveNode = asPrimitiveNode(actualNode);
        if (actualAsPrimitiveNode) {
          subcompareDuo(actualAsPrimitiveNode, expectNode);
          actualAsPrimitiveNode.ignore = true;
          visitSolo(actualNode, PLACEHOLDER_FOR_NOTHING);
          break visit;
        }
      }
      // composite expected
      else if (
        expectNode.category === "composite" &&
        actualNode.category === "primitive"
      ) {
        const expectAsPrimitiveNode = asPrimitiveNode(expectNode);
        if (expectAsPrimitiveNode) {
          subcompareDuo(actualNode, expectAsPrimitiveNode);
          expectAsPrimitiveNode.ignore = true;
          visitSolo(expectNode, PLACEHOLDER_FOR_NOTHING);
          break visit;
        }
      }
      visitSolo(actualNode, PLACEHOLDER_FOR_NOTHING);
      visitSolo(expectNode, PLACEHOLDER_FOR_NOTHING);
    }

    const { self, inside, overall } = comparison.reasons;
    appendReasons(self.any, self.modified, self.removed, self.added);
    appendReasons(inside.any, inside.modified, inside.removed, inside.added);
    appendReasons(overall.removed, self.removed, inside.removed);
    appendReasons(overall.added, self.added, inside.added);
    appendReasons(overall.modified, self.modified, inside.modified);
    appendReasons(overall.any, self.any, inside.any);
    comparison.selfHasRemoval = self.removed.size > 0;
    comparison.selfHasAddition = self.added.size > 0;
    comparison.selfHasModification = self.modified.size > 0;
    comparison.hasAnyDiff = overall.any.size > 0;
    comparison.done = true;

    const updateNodeDiffType = (node, otherNode) => {
      if (node.diffType !== "") {
        return;
      }
      let diffType = "";
      if (otherNode === PLACEHOLDER_FOR_NOTHING) {
        diffType = "modified";
      } else if (otherNode === PLACEHOLDER_FOR_MODIFIED) {
        diffType = "modified";
      } else if (otherNode === PLACEHOLDER_FOR_SAME) {
        diffType = "same";
      } else if (otherNode === PLACEHOLDER_WHEN_ADDED_OR_REMOVED) {
        diffType = "solo";
      } else if (comparison.selfHasModification) {
        diffType = "modified";
      } else {
        diffType = "same";
      }
      node.diffType = diffType;
      if (isNot) {
        node.color = node.colorWhenSame;
      } else {
        node.color = {
          solo: node.colorWhenSolo,
          modified: node.colorWhenModified,
          same: node.colorWhenSame,
        }[diffType];
      }
    };
    updateNodeDiffType(actualNode, expectNode);
    updateNodeDiffType(expectNode, actualNode);

    if (comparison.reasons.overall.any.size === 0) {
      if (actualNode.isHiddenWhenSame) {
        actualNode.isHidden = true;
      }
      if (expectNode.isHiddenWhenSame) {
        expectNode.isHidden = true;
      }
    }
    if (
      actualNode.subgroup === "line_entries" &&
      expectNode.subgroup === "line_entries"
    ) {
      const actualIsMultiline = actualNode.childNodeMap.size > 1;
      const expectIsMultiline = expectNode.childNodeMap.size > 1;
      if (actualIsMultiline && !expectIsMultiline) {
        enableMultilineDiff(expectNode);
      } else if (!actualIsMultiline && expectIsMultiline) {
        enableMultilineDiff(actualNode);
      }
    }

    return comparison;
  };

  const rootComparison = compare(actualRootNode, expectRootNode);
  if (!rootComparison.hasAnyDiff) {
    return;
  }

  let diff = ``;
  const infos = [];

  let actualStartNode;
  let expectStartNode;
  start_on_max_depth: {
    if (rootComparison.selfHasModification) {
      actualStartNode = actualRootNode;
      expectStartNode = expectRootNode;
      break start_on_max_depth;
    }
    const getStartNode = (rootNode) => {
      let topMostNodeWithDiff = null;
      for (const comparisonWithDiff of causeSet) {
        const node =
          comparisonWithDiff[
            rootNode.name === "actual" ? "actualNode" : "expectNode"
          ];
        if (!topMostNodeWithDiff || node.depth < topMostNodeWithDiff.depth) {
          topMostNodeWithDiff = node;
        }
      }
      if (topMostNodeWithDiff.depth < MAX_DEPTH) {
        return rootNode;
      }
      let currentNode = topMostNodeWithDiff;
      let startDepth = topMostNodeWithDiff.depth - MAX_DEPTH;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const parentNode = currentNode.parent;
        if (!parentNode) {
          return rootNode;
        }
        if (!parentNode.isContainer && parentNode.depth === startDepth) {
          return parentNode;
        }
        currentNode = parentNode;
      }
    };
    actualStartNode = getStartNode(actualRootNode);
    expectStartNode = getStartNode(expectRootNode);
    if (
      actualStartNode !== actualRootNode &&
      expectStartNode !== expectRootNode
    ) {
      const actualStartNodePath = actualStartNode.path.toString();
      const expectStartNodePath = expectStartNode.path.toString();
      if (actualStartNodePath === expectStartNodePath) {
        infos.push(
          `diff starts at ${ANSI.color(actualStartNodePath, ANSI.YELLOW)}`,
        );
      } else {
        infos.push(
          `actual diff starts at ${ANSI.color(actualStartNodePath, ANSI.YELLOW)}`,
        );
        infos.push(
          `expect diff starts at ${ANSI.color(expectStartNodePath, ANSI.YELLOW)}`,
        );
      }
    } else if (actualStartNode !== actualRootNode) {
      infos.push(
        `actual diff starts at ${ANSI.color(actualStartNode.path, ANSI.YELLOW)}`,
      );
    } else if (expectStartNode !== expectRootNode) {
      infos.push(
        `expect diff starts at ${ANSI.color(expectStartNode.path, ANSI.YELLOW)}`,
      );
    }
  }

  if (infos.length) {
    for (const info of infos) {
      diff += `${UNICODE.INFO} ${info}`;
      diff += "\n";
    }
    diff += "\n";
  }

  diff += ANSI.color("actual:", sameColor);
  diff += " ";
  diff += actualStartNode.render({
    MAX_ENTRY_BEFORE_MULTILINE_DIFF,
    MAX_ENTRY_AFTER_MULTILINE_DIFF,
    MAX_DEPTH,
    MAX_DEPTH_INSIDE_DIFF,
    MAX_DIFF_PER_OBJECT,
    MAX_COLUMNS,
    columnsRemaining: MAX_COLUMNS - "actual: ".length,
    startNode: actualStartNode,
  });
  diff += `\n`;
  diff += ANSI.color("expect:", sameColor);
  diff += " ";
  diff += expectStartNode.render({
    MAX_ENTRY_BEFORE_MULTILINE_DIFF,
    MAX_ENTRY_AFTER_MULTILINE_DIFF,
    MAX_DEPTH,
    MAX_DEPTH_INSIDE_DIFF,
    MAX_DIFF_PER_OBJECT,
    MAX_COLUMNS,
    columnsRemaining: MAX_COLUMNS - "expect: ".length,
    startNode: expectStartNode,
  });
  throw diff;
};

const customExpectationSymbol = Symbol.for("jsenv_assert_custom_expectation");
const createCustomExpectation = (name, props) => {
  return {
    [Symbol.toStringTag]: name,
    [customExpectationSymbol]: true,
    group: "custom_expectation",
    subgroup: name,
    ...props,
  };
};
const createAssertMethodCustomExpectation = (
  methodName,
  args,
  {
    customCompare = createAssertMethodCustomCompare(
      (actualNode, expectArgValueNode, { subcompareDuo }) => {
        const expectArgComparison = subcompareDuo(
          actualNode,
          expectArgValueNode,
        );
        return expectArgComparison.hasAnyDiff
          ? PLACEHOLDER_FOR_MODIFIED
          : PLACEHOLDER_FOR_SAME;
      },
    ),
    renderOnlyArgs,
  } = {},
) => {
  return createCustomExpectation(`assert.${methodName}`, {
    parse: (node) => {
      node.childGenerator = () => {
        node.appendChild(
          "assert_method_call",
          createMethodCallNode(node, {
            objectName: "assert",
            methodName,
            args,
          }),
        );
      };
    },
    customCompare,
    render: (node, props) => {
      let diff = "";
      const assertMethodCallNode = node.childNodeMap.get("assert_method_call");
      if (renderOnlyArgs) {
        const argEntriesNode = assertMethodCallNode.childNodeMap.get("args");
        argEntriesNode.startMarker = "";
        argEntriesNode.endMarker = "";
        diff += argEntriesNode.render(props);
      } else {
        diff += assertMethodCallNode.render(props);
      }
      return diff;
    },
  });
};
const createValueCustomCompare = (customComparer) => {
  return (actualNode, expectNode, { onSelfDiff, subcompareChildNodesSolo }) => {
    const selfDiff = customComparer(actualNode, expectNode);
    if (selfDiff) {
      onSelfDiff(selfDiff);
      subcompareChildNodesSolo(actualNode, PLACEHOLDER_FOR_MODIFIED);
      return;
    }
    subcompareChildNodesSolo(actualNode, PLACEHOLDER_FOR_SAME);
  };
};
const createAssertMethodCustomCompare = (
  customComparer,
  { argsCanBeComparedInParallel } = {},
) => {
  return (actualNode, expectNode, options) => {
    // prettier-ignore
    const assertMethod = expectNode.childNodeMap.get("assert_method_call");
    const argEntriesNode = assertMethod.childNodeMap.get("args");
    const childNodeKeys = Array.from(argEntriesNode.childNodeMap.keys());
    if (childNodeKeys.length === 0) {
      return;
    }
    if (childNodeKeys.length === 1) {
      const expectFirsArgValueNode = argEntriesNode.childNodeMap.get(0);
      expectFirsArgValueNode.ignore = true;
      const customComparerResult = customComparer(
        actualNode,
        expectFirsArgValueNode,
        options,
      );
      options.subcompareSolo(expectNode, customComparerResult);
      return;
    }
    const argIterator = argEntriesNode.childNodeMap[Symbol.iterator]();
    function* argValueGenerator() {
      let argIteratorResult;
      while ((argIteratorResult = argIterator.next())) {
        if (argIteratorResult.done) {
          break;
        }
        yield argIteratorResult.value[1];
      }
    }
    let result = PLACEHOLDER_FOR_SAME;
    for (const argValueNode of argValueGenerator()) {
      argValueNode.ignore = true;
      const customComparerResult = customComparer(
        actualNode,
        argValueNode,
        options,
      );
      if (customComparerResult === PLACEHOLDER_FOR_SAME) {
        continue;
      }
      result = customComparerResult;
      if (argsCanBeComparedInParallel) {
        continue;
      }
      for (const remainingArgValueNode of argValueGenerator()) {
        remainingArgValueNode.ignore = true;
        options.subcompareSolo(customComparerResult, remainingArgValueNode);
      }
      break;
    }
    options.subcompareSolo(expectNode, result);
    return;
  };
};

assert.belowOrEquals = (value, { renderOnlyArgs } = {}) => {
  if (typeof value !== "number") {
    throw new TypeError(
      `assert.belowOrEquals 1st argument must be number, received ${value}`,
    );
  }
  return createAssertMethodCustomExpectation(
    "belowOrEquals",
    [
      {
        value,
        customCompare: createValueCustomCompare((actualNode) => {
          if (!actualNode.isNumber) {
            return "should_be_a_number";
          }
          if (actualNode.value > value) {
            return `should_be_below_or_equals_to_${value}`;
          }
          return null;
        }),
      },
    ],
    {
      renderOnlyArgs,
    },
  );
};
assert.aboveOrEquals = (value, { renderOnlyArgs } = {}) => {
  if (typeof value !== "number") {
    throw new TypeError(
      `assert.aboveOrEquals 1st argument must be number, received ${value}`,
    );
  }
  return createAssertMethodCustomExpectation(
    "aboveOrEquals",
    [
      {
        value,
        customCompare: createValueCustomCompare((actualNode) => {
          if (!actualNode.isNumber) {
            return "should_be_a_number";
          }
          if (actualNode.value < value) {
            return `should_be_greater_or_equals_to_${value}`;
          }
          return null;
        }),
      },
    ],
    {
      renderOnlyArgs,
    },
  );
};
assert.between = (minValue, maxValue) => {
  if (typeof minValue !== "number") {
    throw new TypeError(
      `assert.between 1st argument must be number, received ${minValue}`,
    );
  }
  if (typeof maxValue !== "number") {
    throw new TypeError(
      `assert.between 2nd argument must be number, received ${maxValue}`,
    );
  }
  if (minValue > maxValue) {
    throw new Error(
      `assert.between 1st argument is > 2nd argument, ${minValue} > ${maxValue}`,
    );
  }
  return createAssertMethodCustomExpectation("between", [
    { value: assert.aboveOrEquals(minValue, { renderOnlyArgs: true }) },
    { value: assert.belowOrEquals(maxValue, { renderOnlyArgs: true }) },
  ]);
};
assert.not = (value) => {
  return createAssertMethodCustomExpectation(
    "not",
    [
      {
        value,
      },
    ],
    {
      customCompare: createAssertMethodCustomCompare(
        (actualNode, expectFirsArgValueNode, { subcompareDuo, onSelfDiff }) => {
          const expectFirstArgComparison = subcompareDuo(
            actualNode,
            expectFirsArgValueNode,
            {
              revertNot: true,
            },
          );
          if (expectFirstArgComparison.hasAnyDiff) {
            // we should also "revert" side effects of all diff inside expectAsNode
            // - adding to causeSet
            // - colors (should be done during comparison)
            return PLACEHOLDER_FOR_SAME;
          }
          onSelfDiff("sould_have_diff");
          return PLACEHOLDER_WHEN_ADDED_OR_REMOVED;
        },
      ),
    },
  );
};
assert.any = (constructor) => {
  if (typeof constructor !== "function") {
    throw new TypeError(
      `assert.any 1st argument must be a function, received ${constructor}`,
    );
  }
  const constructorName = constructor.name;
  return createAssertMethodCustomExpectation("any", [
    {
      value: constructor,
      customCompare: createValueCustomCompare(
        constructorName
          ? (actualNode) => {
              for (const proto of objectPrototypeChainGenerator(
                actualNode.value,
              )) {
                const protoConstructor = proto.constructor;
                if (protoConstructor.name === constructorName) {
                  return null;
                }
              }
              return `should_have_constructor_${constructorName}`;
            }
          : (actualNode) => {
              for (const proto of objectPrototypeChainGenerator(
                actualNode.value,
              )) {
                const protoConstructor = proto.constructor;
                if (protoConstructor === constructor) {
                  return null;
                }
              }
              return `should_have_constructor_${constructor.toString()}`;
            },
      ),
    },
  ]);
};

let createRootNode;
/*
 * Node represent any js value.
 * These js value are compared and converted to a readable string
 * Node art part of a tree structure (parent/children) and contains many
 * information about the value such as
 * - Is it a primitive or a composite?
 * - Where does the value come from?
 *   - property key
 *   - property value
 *   - prototype value returned by Object.getPrototypeOf()
 *   - a map entry key
 * - And finally info useful to render the js value into a readable string
 */
{
  createRootNode = ({
    colorWhenSolo,
    colorWhenSame,
    colorWhenModified,
    name,
    value,
    render,
  }) => {
    /*
     * Il est possible pour actual de ref des valeurs de expect et inversement tel que
     * - Object.prototype
     * - Un ancetre commun
     * - Peu importe en fait
     * Il est aussi possible de découvrir une ref dans l'un plus tot que dans l'autre
     * (l'ordre des prop des object n'est pas garanti nottament)
     * Pour cette raison il y a un referenceMap par arbre (actual/expect)
     * Au final on regardera juste le path ou se trouve une ref pour savoir si elle sont les meme
     *
     * Une ref peut etre découverte apres
     * - ordre des props
     * - caché par maxColumns
     * - caché par MAX_ENTRY_BEFORE_MULTILINE_DIFF
     * - ...
     * Et que la découverte lazy des child (childGenerator) ne garantie pas de trouver la ref
     * des le départ
     * ALORS
     * On ne peut pas utiliser la notation suivante:
     * actual: {
     *   a: <ref #1> { toto: true },
     *   b: <ref #1>
     * }
     * expect: {
     *   a: <ref #1> { toto: true },
     *   b: <ref #1>
     * }
     *
     * on va lui préférer:
     * actual: {
     *   a: { toto: true },
     *   b: actual.a,
     * }
     * expect: {
     *   a: { toto: true },
     *   b: expect.a,
     * }
     */

    const referenceMap = new Map();
    let nodeId = 1;

    const rootNode = createNode({
      id: nodeId,
      colorWhenSolo,
      colorWhenSame,
      colorWhenModified,
      name,
      group: "root",
      value,
      parent: null,
      depth: 0,
      path: createValuePath([
        {
          type: "identifier",
          value: name,
        },
      ]),
      render,
      referenceMap,
      nextId: () => {
        nodeId++;
        return nodeId;
      },
    });

    return rootNode;
  };

  const createNode = ({
    colorWhenSolo,
    colorWhenSame,
    colorWhenModified,
    name,
    group,
    subgroup = group,
    category = group,
    value,
    key,
    parent,
    referenceMap,
    nextId,
    depth,
    path,
    childGenerator,
    comparer = comparerDefault,
    isSourceCode = false,
    isFunctionPrototype = false,
    isClassPrototype = false,
    customCompare,
    render,
    methodName = "",
    isHidden = false,
    isHiddenWhenSame = false,
    startMarker = "",
    middleMarker = "",
    endMarker = "",
    quoteMarkerRef,
    onelineDiff = null,
    multilineDiff = null,
  }) => {
    const node = {
      colorWhenSolo,
      colorWhenSame,
      colorWhenModified,
      name,
      value,
      key,
      group,
      subgroup,
      category,
      comparer,
      childGenerator,
      childNodeMap: null,
      appendChild: (childKey, params) =>
        appendChildNodeGeneric(node, childKey, params),
      wrappedNodeGetter: () => {},
      parent,
      reference: null,
      referenceMap,
      nextId,
      depth,
      path,
      isSourceCode,
      isClassPrototype,
      // info
      isCustomExpectation: false,
      // info/primitive
      isUndefined: false,
      isString: false,
      isStringForUrl: false,
      isNumber: false,
      isSymbol: false,
      // info/composite
      isFunction: false,
      functionAnalysis: defaultFunctionAnalysis,
      isArray: false,
      isMap: false,
      isSet: false,
      isURL: false,
      referenceFromOthersSet: referenceFromOthersSetDefault,
      // render info
      render: (props) => render(node, props),
      methodName,
      isHidden,
      isHiddenWhenSame,
      beforeRender: null,
      childrenKeys: null,
      indexToDisplayArray: null,
      // START will be set by comparison
      customCompare,
      ignore: false,
      comparison: null,
      comparisonDiffMap: null,
      diffType: "",
      otherNode: null,
      // END will be set by comparison
      startMarker,
      middleMarker,
      endMarker,
      quoteMarkerRef,
      onelineDiff,
      multilineDiff,
      color: "",
    };
    child_node_map: {
      const childNodeMap = new Map();
      let childrenGenerated = false;
      const generateChildren = () => {
        if (childrenGenerated) {
          return;
        }
        childrenGenerated = true;
        if (!node.childGenerator) {
          return;
        }
        node.childGenerator(node);
        node.childGenerator = null;
      };
      node.childNodeMap = new Proxy(childNodeMap, {
        has: (target, prop, receiver) => {
          if (!childrenGenerated) {
            generateChildren();
          }
          let value = Reflect.has(target, prop, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        },
        get: (target, prop, receiver) => {
          if (!childrenGenerated) {
            generateChildren();
          }
          if (prop === "size") {
            return target[prop];
          }
          let value = Reflect.get(target, prop, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    }
    Object.preventExtensions(node);
    if (value && value[customExpectationSymbol]) {
      const { parse, render, customCompare, group, subgroup } = value;
      node.isCustomExpectation = true;
      if (parse) {
        parse(node);
      }
      node.customCompare = customCompare;
      node.render = (props) => render(node, props);
      node.group = group;
      node.subgroup = subgroup;
      return node;
    }
    if (category === "reference") {
      return node;
    }
    if (
      value === SOURCE_CODE_ENTRY_KEY ||
      value === VALUE_OF_RETURN_VALUE_ENTRY_KEY ||
      value === SYMBOL_TO_PRIMITIVE_RETURN_VALUE_ENTRY_KEY
    ) {
      node.category = "primitive";
      node.isString = true;
      return node;
    }
    if (group === "entries") {
      return node;
    }
    if (group === "entry") {
      return node;
    }
    if (subgroup === "array_entry_key" || subgroup === "arg_entry_key") {
      node.category = "primitive";
      node.isNumber = true;
      return node;
    }
    if (subgroup === "char_entry_value") {
      node.category = "primitive";
      node.isString = true;
      return node;
    }
    if (subgroup === "url_search_entry") {
      node.category = "composite";
      return node;
    }
    if (value === null) {
      node.category = "primitive";
      return node;
    }
    if (value === undefined) {
      node.category = "primitive";
      node.isUndefined = true;
      return node;
    }
    const typeofResult = typeof value;
    if (typeofResult === "number") {
      node.category = "primitive";
      node.isNumber = true;
      return node;
    }
    if (typeofResult === "string") {
      node.category = "primitive";
      node.isString = true;
      if (group === "grammar") {
        // no quote around grammar
      } else if (group === "url_internal_prop") {
        // no quote around url internal properties
      } else if (subgroup === "url_search_entry_key") {
        // no quote around key in "?key=value"
      } else if (subgroup === "url_search_entry_value") {
        // no quote around value in "?key=value"
      } else {
        let quoteMarkerRef = { current: null };
        let bestQuote;
        best_quote: {
          let canUseBacktick = false;
          if (subgroup === "property_entry_key") {
            if (isValidPropertyIdentifier(value)) {
              // no quote around valid property identifier
              break best_quote;
            }
          } else {
            canUseBacktick = true;
          }
          let backslashCount = 0;
          let doubleQuoteCount = 0;
          let singleQuoteCount = 0;
          let backtickCount = 0;
          for (const char of value) {
            if (char === "\\") {
              backslashCount++;
            } else {
              if (backslashCount % 2 > 0) {
                // it's escaped
              } else if (char === DOUBLE_QUOTE) {
                doubleQuoteCount++;
              } else if (char === SINGLE_QUOTE) {
                singleQuoteCount++;
              } else if (char === BACKTICK) {
                backtickCount++;
              }
              backslashCount = 0;
            }
          }
          bestQuote = (() => {
            if (doubleQuoteCount === 0) {
              return DOUBLE_QUOTE;
            }
            if (singleQuoteCount === 0) {
              return SINGLE_QUOTE;
            }
            if (canUseBacktick && backtickCount === 0) {
              return BACKTICK;
            }
            if (singleQuoteCount > doubleQuoteCount) {
              return DOUBLE_QUOTE;
            }
            if (doubleQuoteCount > singleQuoteCount) {
              return SINGLE_QUOTE;
            }
            return DOUBLE_QUOTE;
          })();
        }
        quoteMarkerRef.current = bestQuote;

        if (canParseUrl(value)) {
          node.isStringForUrl = true;
          node.childGenerator = () => {
            const urlObject = new URL(value);
            const urlInternalPropertiesNode = node.appendChild(
              "url_internal_properties",
              {
                render: renderChildrenOneLiner,
                onelineDiff: {},
                startMarker: bestQuote,
                endMarker: bestQuote,
                childGenerator() {
                  const {
                    protocol,
                    username,
                    password,
                    hostname,
                    port,
                    pathname,
                    search,
                    hash,
                  } = urlObject;
                  urlInternalPropertiesNode.appendChild("protocol", {
                    value: protocol,
                    render: renderValue,
                    endMarker: "//",
                    group: "url_internal_prop",
                    subgroup: "url_protocol",
                  });
                  if (username) {
                    urlInternalPropertiesNode.appendChild("username", {
                      value: username,
                      render: renderValue,
                      endMarker: password ? ":" : "@",
                      group: "url_internal_prop",
                      subgroup: "url_username",
                    });
                    if (password) {
                      urlInternalPropertiesNode.appendChild("password", {
                        value: password,
                        render: renderValue,
                        endMarker: "@",
                        group: "url_internal_prop",
                        subgroup: "url_password",
                      });
                    }
                  }
                  urlInternalPropertiesNode.appendChild("hostname", {
                    value: hostname,
                    render: renderValue,
                    group: "url_internal_prop",
                    subgroup: "url_hostname",
                  });
                  if (port) {
                    urlInternalPropertiesNode.appendChild("port", {
                      value: parseInt(port),
                      render: renderValue,
                      startMarker: ":",
                      group: "url_internal_prop",
                      subgroup: "url_port",
                    });
                  }
                  if (pathname) {
                    urlInternalPropertiesNode.appendChild("pathname", {
                      value: pathname,
                      render: renderValue,
                      group: "url_internal_prop",
                      subgroup: "url_pathname",
                    });
                  }
                  if (search) {
                    const urlSearchNode = urlInternalPropertiesNode.appendChild(
                      "search",
                      {
                        value: null,
                        render: renderChildrenOneLiner,
                        onelineDiff: {},
                        startMarker: "?",
                        group: "entries",
                        subgroup: "url_search",
                        childGenerator() {
                          const searchParamsMap = tokenizeUrlSearch(search);
                          let searchEntryIndex = 0;
                          for (const [key, values] of searchParamsMap) {
                            const urlSearchEntryNode =
                              urlSearchNode.appendChild(key, {
                                key: searchEntryIndex,
                                render: renderChildrenOneLiner,
                                onelineDiff: {},
                                path: node.path.append(key),
                                group: "entries",
                                subgroup: "url_search_entry",
                                childGenerator() {
                                  let valueIndex = 0;
                                  const isMultiValue = values.length > 1;
                                  while (valueIndex < values.length) {
                                    const entryNode =
                                      urlSearchEntryNode.appendChild(
                                        valueIndex,
                                        {
                                          group: "entry",
                                          subgroup: "url_search_value_entry",
                                          render: renderEntry,
                                          path: isMultiValue
                                            ? urlSearchEntryNode.path.append(
                                                valueIndex,
                                                { isIndexedEntry: true },
                                              )
                                            : undefined,
                                          middleMarker: "=",
                                        },
                                      );
                                    entryNode.appendChild("entry_key", {
                                      value: key,
                                      render: renderValue,
                                      quoteMarkerRef,
                                      startMarker:
                                        urlSearchEntryNode.key === 0 &&
                                        valueIndex === 0
                                          ? ""
                                          : "&",
                                      group: "entry_key",
                                      subgroup: "url_search_entry_key",
                                    });
                                    entryNode.appendChild("entry_value", {
                                      value: values[valueIndex],
                                      render: renderValue,
                                      quoteMarkerRef,
                                      group: "entry_value",
                                      subgroup: "url_search_entry_value",
                                    });
                                    valueIndex++;
                                  }
                                },
                              });
                            searchEntryIndex++;
                          }
                        },
                      },
                    );
                  }
                  if (hash) {
                    urlInternalPropertiesNode.appendChild("hash", {
                      value: hash,
                      render: renderValue,
                      group: "url_internal_prop",
                      subgroup: "url_hash",
                    });
                  }
                },
                group: "entries",
                subgroup: "url_internal_properties",
              },
            );
          };
        } else {
          node.childGenerator = () => {
            const lineEntriesNode = node.appendChild("line_entries", {
              render: renderChildren,
              multilineDiff: {
                hasTrailingSeparator: true,
                skippedSummary: {
                  skippedNames: ["line", "lines"],
                },
              },
              group: "entries",
              subgroup: "line_entries",
              childGenerator: () => {
                const appendLineEntry = (lineIndex) => {
                  const lineEntryNode = lineEntriesNode.appendChild(lineIndex, {
                    key: lineIndex,
                    render: renderChildrenOneLiner,
                    onelineDiff: {
                      hasMarkersWhenEmpty: false, // will be set to true for single line
                      focusedChildWhenSame: "last",
                      overflowStartMarker: "…",
                      overflowEndMarker: "…",
                      overflowMarkersPlacement: "outside",
                    },
                    group: "entries",
                    subgroup: "line_entry_value",
                  });
                  const appendCharEntry = (charIndex, char) => {
                    lineEntryNode.appendChild(charIndex, {
                      value: char,
                      render: renderChar,
                      quoteMarkerRef,
                      group: "entry_value",
                      subgroup: "char_entry_value",
                    });
                  };
                  return {
                    lineEntryNode,
                    appendCharEntry,
                  };
                };

                let isDone = false;
                let firstLineCharIndex = 0;
                const chars = tokenizeString(node.value);
                const charIterator = chars[Symbol.iterator]();
                function* charGeneratorUntilNewLine() {
                  // eslint-disable-next-line no-constant-condition
                  while (true) {
                    const charIteratorResult = charIterator.next();
                    if (charIteratorResult.done) {
                      isDone = true;
                      return;
                    }
                    const char = charIteratorResult.value;
                    if (char === "\n") {
                      break;
                    }
                    yield char;
                  }
                }

                // first line
                const {
                  lineEntryNode: firstLineEntryNode,
                  appendCharEntry: appendFirstLineCharEntry,
                } = appendLineEntry(0);
                for (const char of charGeneratorUntilNewLine()) {
                  appendFirstLineCharEntry(firstLineCharIndex, char);
                  firstLineCharIndex++;
                }

                if (isDone) {
                  // single line
                  if (bestQuote) {
                    firstLineEntryNode.onelineDiff.hasMarkersWhenEmpty = true;
                    firstLineEntryNode.startMarker =
                      firstLineEntryNode.endMarker = bestQuote;
                  }
                  return;
                }
                enableMultilineDiff(lineEntriesNode);
                // remaining lines
                let lineIndex = 1;
                // eslint-disable-next-line no-constant-condition
                while (true) {
                  const { appendCharEntry } = appendLineEntry(lineIndex);
                  let columnIndex = 0;
                  for (const char of charGeneratorUntilNewLine()) {
                    appendCharEntry(columnIndex, char);
                    columnIndex++;
                  }
                  if (isDone) {
                    break;
                  }
                  lineIndex++;
                }
              },
            });
          };
        }
      }
    }
    if (typeofResult === "symbol") {
      node.category = "primitive";
      node.isSymbol = true;
      node.childGenerator = () => {
        const wellKnownPath = getWellKnownValuePath(value);
        if (wellKnownPath) {
          const wellKnownNode = node.appendChild("well_known", {
            value: wellKnownPath,
            render: renderChildren,
            onelineDiff: {},
            category: "well_known",
            group: "entries",
            subgroup: "well_known",
            childGenerator() {
              let index = 0;
              for (const part of wellKnownPath) {
                wellKnownNode.appendChild(index, {
                  value: part.value,
                  render: renderGrammar,
                  group: "grammar",
                  subgroup: "path",
                });
                index++;
              }
            },
          });
          return;
        }

        const symbolKey = Symbol.keyFor(value);
        if (symbolKey) {
          node.appendChild(
            "symbol_construct",
            createMethodCallNode(node, {
              objectName: "Symbol",
              methodName: "for",
              args: [
                {
                  value: symbolKey,
                },
              ],
            }),
          );
          return;
        }
        node.appendChild(
          "symbol_construct",
          createMethodCallNode(node, {
            objectName: "Symbol",
            args: [
              {
                value: symbolToDescription(value),
              },
            ],
          }),
        );
      };
      return node;
    }
    const isObject = typeofResult === "object";
    const isFunction = typeofResult === "function";
    if (isObject || isFunction) {
      node.category = "composite";
      node.referenceFromOthersSet = new Set();
      const reference = node.referenceMap.get(value);
      if (reference) {
        node.reference = reference;
        reference.referenceFromOthersSet.add(node);
      } else {
        node.referenceMap.set(value, node);
      }
      if (isFunction) {
        node.isFunction = true;
        node.functionAnalysis = tokenizeFunction(value);
      }
      for (const proto of objectPrototypeChainGenerator(value)) {
        const parentConstructor = proto.constructor;
        if (!parentConstructor) {
          continue;
        }
        if (parentConstructor.name === "Map") {
          node.isMap = true;
          continue;
        }
        if (parentConstructor.name === "Array") {
          node.isArray = true;
          continue;
        }
        if (parentConstructor.name === "Set") {
          node.isSet = true;
          continue;
        }
        if (parentConstructor.name === "URL") {
          node.isURL = true;
          continue;
        }
      }
      node.childGenerator = function () {
        if (node.reference) {
          const referenceNode = node.appendChild("reference", {
            value: node.reference.path,
            render: renderChildren,
            onelineDiff: {},
            category: "reference",
            group: "entries",
            subgroup: "reference",
            childGenerator() {
              let index = 0;
              for (const path of node.reference.path) {
                referenceNode.appendChild(index, {
                  value: path.value,
                  render: renderGrammar,
                  group: "grammar",
                  subgroup: "path",
                });
                index++;
              }
            },
          });
          return;
        }
        const wellKnownPath = getWellKnownValuePath(value);
        if (wellKnownPath) {
          const wellKnownNode = node.appendChild("well_known", {
            value: wellKnownPath,
            render: renderChildren,
            onelineDiff: {},
            category: "well_known",
            group: "entries",
            subgroup: "well_known",
            childGenerator() {
              let index = 0;
              for (const part of wellKnownPath) {
                wellKnownNode.appendChild(index, {
                  value: part.value,
                  render: renderGrammar,
                  group: "grammar",
                  subgroup: "path",
                });
                index++;
              }
            },
          });
          return;
        }
        let objectConstructNode = null;
        let objectConstructArgs = null;
        // function child nodes
        if (node.isFunction) {
          const functionConstructNode = node.appendChild("construct", {
            value: null,
            render: renderChildrenOneLiner,
            onelineDiff: {
              hasSpacingBetweenEachChild: true,
            },
            group: "entries",
            subgroup: "function_construct",
            childGenerator() {
              if (node.functionAnalysis.type === "class") {
                functionConstructNode.appendChild("class_keyword", {
                  value: "class",
                  render: renderGrammar,
                  group: "grammar",
                  subgroup: "class_keyword",
                });
                if (node.functionAnalysis.name) {
                  functionConstructNode.appendChild("function_name", {
                    value: node.functionAnalysis.name,
                    render: renderGrammar,
                    group: "grammar",
                    subgroup: "function_name",
                  });
                }
                const extendedClassName =
                  node.functionAnalysis.extendedClassName;
                if (extendedClassName) {
                  functionConstructNode.appendChild("class_extends_keyword", {
                    value: "extends",
                    render: renderGrammar,
                    group: "grammar",
                    subgroup: "class_extends_keyword",
                  });
                  functionConstructNode.appendChild("class_extended_name", {
                    value: extendedClassName,
                    render: renderGrammar,
                    group: "grammar",
                    subgroup: "class_extended_name",
                  });
                }
                return;
              }
              if (node.functionAnalysis.isAsync) {
                functionConstructNode.appendChild("function_async_keyword", {
                  value: "async",
                  render: renderGrammar,
                  group: "grammar",
                  subgroup: "function_async_keyword",
                });
              }
              if (node.functionAnalysis.type === "classic") {
                functionConstructNode.appendChild("function_keyword", {
                  value: node.functionAnalysis.isGenerator
                    ? "function*"
                    : "function",
                  render: renderGrammar,
                  group: "grammar",
                  subgroup: "function_keyword",
                });
              }
              if (node.functionAnalysis.name) {
                functionConstructNode.appendChild("function_name", {
                  value: node.functionAnalysis.name,
                  render: renderGrammar,
                  group: "grammar",
                  subgroup: "function_name",
                });
              }
              function_body_prefix: {
                const appendFunctionBodyPrefix = (prefix) => {
                  functionConstructNode.appendChild("function_body_prefix", {
                    value: prefix,
                    render: renderGrammar,
                    group: "grammar",
                    subgroup: "function_body_prefix",
                  });
                };

                if (node.functionAnalysis.type === "arrow") {
                  appendFunctionBodyPrefix("() =>");
                } else if (node.functionAnalysis.type === "method") {
                  if (node.functionAnalysis.getterName) {
                    appendFunctionBodyPrefix(`get ${methodName}()`);
                  } else if (node.functionAnalysis.setterName) {
                    appendFunctionBodyPrefix(`set ${methodName}()`);
                  } else {
                    appendFunctionBodyPrefix(`${methodName}()`);
                  }
                } else if (node.functionAnalysis.type === "classic") {
                  appendFunctionBodyPrefix("()");
                }
              }
            },
          });
        } else if (isFunctionPrototype) {
        } else {
          const objectTag = getObjectTag(value);
          if (objectTag && objectTag !== "Object" && objectTag !== "Array") {
            objectConstructNode = node.appendChild("construct", {
              value: null,
              render: renderChildrenOneLiner,
              onelineDiff: {
                hasSpacingBetweenEachChild: true,
              },
              group: "entries",
              subgroup: "object_construct",
              childGenerator() {
                if (objectConstructArgs) {
                  objectConstructNode.appendChild(
                    "call",
                    createMethodCallNode(objectConstructNode, {
                      objectName: objectTag,
                      args: objectConstructArgs,
                    }),
                  );
                } else {
                  objectConstructNode.appendChild("object_tag", {
                    value: objectTag,
                    render: renderGrammar,
                    group: "grammar",
                    subgroup: "object_tag",
                    path: node.path.append("[[ObjectTag]]"),
                  });
                }
              },
            });
          }
        }
        let canHaveInternalEntries = false;
        internal_entries: {
          const internalEntriesParams = {
            render: renderChildren,
            startMarker: "(",
            endMarker: ")",
            onelineDiff: {
              hasMarkersWhenEmpty: true,
              separatorBetweenEachChild: ",",
              hasSpacingBetweenEachChild: true,
            },
            multilineDiff: {
              hasMarkersWhenEmpty: true,
              separatorBetweenEachChild: ",",
              hasTrailingSeparator: true,
              hasNewLineAroundChildren: true,
              hasIndentBeforeEachChild: true,
              skippedSummary: {
                skippedNames: ["value", "values"],
              },
            },
            group: "entries",
          };

          if (node.isMap) {
            canHaveInternalEntries = true;
            const mapEntriesNode = node.appendChild("internal_entries", {
              ...internalEntriesParams,
              subgroup: "map_entries",
              childGenerator: () => {
                const objectTagCounterMap = new Map();
                for (const [mapEntryKey, mapEntryValue] of value) {
                  let pathPart;
                  if (isComposite(mapEntryKey)) {
                    const keyObjectTag = getObjectTag(mapEntryKey);
                    if (objectTagCounterMap.has(keyObjectTag)) {
                      const objectTagCount =
                        objectTagCounterMap.get(keyObjectTag) + 1;
                      objectTagCounterMap.set(keyObjectTag, objectTagCount);
                      pathPart = `${keyObjectTag}#${objectTagCount}`;
                    } else {
                      objectTagCounterMap.set(keyObjectTag, 1);
                      pathPart = `${keyObjectTag}#1`;
                    }
                  } else {
                    pathPart = String(mapEntryKey);
                  }

                  const mapEntryNode = mapEntriesNode.appendChild(mapEntryKey, {
                    render: renderEntry,
                    group: "entry",
                    subgroup: "map_entry",
                    path: node.path.append(pathPart),
                    middleMarker: " => ",
                  });
                  mapEntryNode.appendChild("entry_key", {
                    value: mapEntryKey,
                    render: renderValue,
                    group: "entry_key",
                    subgroup: "map_entry_key",
                  });
                  mapEntryNode.appendChild("entry_value", {
                    value: mapEntryValue,
                    render: renderValue,
                    group: "entry_value",
                    subgroup: "map_entry_value",
                  });
                }
                objectTagCounterMap.clear();
              },
            });
          }
          if (node.isSet) {
            canHaveInternalEntries = true;
            const setEntriesNode = node.appendChild("internal_entries", {
              ...internalEntriesParams,
              subgroup: "set_entries",
              childGenerator: () => {
                let index = 0;
                for (const [setValue] of value) {
                  setEntriesNode.appendChild(index, {
                    value: setValue,
                    render: renderValue,
                    group: "entry_value",
                    subgroup: "set_entry",
                    path: setEntriesNode.path.append(index, {
                      isIndexedEntry: true,
                    }),
                  });
                  index++;
                }
              },
            });
          }
        }
        const ownPropertyNameToIgnoreSet = new Set();
        const ownPropertSymbolToIgnoreSet = new Set();
        let canHaveIndexedEntries = false;
        indexed_entries: {
          if (node.isArray) {
            canHaveIndexedEntries = true;
            const arrayEntriesNode = node.appendChild("indexed_entries", {
              render: renderChildren,
              group: "entries",
              subgroup: "array_entries",
              startMarker: "[",
              endMarker: "]",
              onelineDiff: {
                hasMarkersWhenEmpty: true,
                separatorBetweenEachChild: ",",
                hasTrailingSeparator: true,
                hasSpacingBetweenEachChild: true,
              },
              multilineDiff: {
                hasMarkersWhenEmpty: true,
                separatorBetweenEachChild: ",",
                hasTrailingSeparator: true,
                hasNewLineAroundChildren: true,
                hasIndentBeforeEachChild: true,
                skippedSummary: {
                  skippedNames: ["value", "values"],
                },
              },
            });
            const arrayEntyGenerator = () => {
              let index = 0;
              while (index < value.length) {
                ownPropertyNameToIgnoreSet.add(String(index));
                arrayEntriesNode.appendChild(index, {
                  value: Object.hasOwn(value, index)
                    ? value[index]
                    : ARRAY_EMPTY_VALUE,
                  render: renderValue,
                  group: "entry_value",
                  subgroup: "array_entry_value",
                  path: arrayEntriesNode.path.append(index, {
                    isIndexedEntry: true,
                  }),
                });
                index++;
              }
            };
            arrayEntyGenerator();
          }
        }
        const propertyLikeCallbackSet = new Set();
        symbol_to_primitive: {
          if (
            Symbol.toPrimitive in value &&
            typeof value[Symbol.toPrimitive] === "function"
          ) {
            ownPropertSymbolToIgnoreSet.add(Symbol.toPrimitive);
            const toPrimitiveReturnValue = value[Symbol.toPrimitive]("string");
            propertyLikeCallbackSet.add((appendPropertyEntryNode) => {
              appendPropertyEntryNode(
                SYMBOL_TO_PRIMITIVE_RETURN_VALUE_ENTRY_KEY,
                {
                  value: toPrimitiveReturnValue,
                },
              );
            });
          }
        }
        // toString()
        if (node.isURL) {
          objectConstructArgs = [
            {
              value: value.href,
              key: "toString()",
            },
          ];
        }
        // valueOf()
        else if (
          typeof value.valueOf === "function" &&
          value.valueOf !== Object.prototype.valueOf
        ) {
          ownPropertyNameToIgnoreSet.add("valueOf");
          const valueOfReturnValue = value.valueOf();
          if (objectConstructNode) {
            objectConstructArgs = [
              {
                value: valueOfReturnValue,
                key: "valueOf()",
              },
            ];
          } else {
            propertyLikeCallbackSet.add((appendPropertyEntryNode) => {
              appendPropertyEntryNode(VALUE_OF_RETURN_VALUE_ENTRY_KEY, {
                value: valueOfReturnValue,
              });
            });
          }
        }
        own_properties: {
          const ownPropertySymbols = Object.getOwnPropertySymbols(value).filter(
            (ownPropertySymbol) => {
              return (
                !ownPropertSymbolToIgnoreSet.has(ownPropertySymbol) &&
                !shouldIgnoreOwnPropertySymbol(node, ownPropertySymbol)
              );
            },
          );
          const ownPropertyNames = Object.getOwnPropertyNames(value).filter(
            (ownPropertyName) => {
              return (
                !ownPropertyNameToIgnoreSet.has(ownPropertyName) &&
                !shouldIgnoreOwnPropertyName(node, ownPropertyName)
              );
            },
          );
          const skipOwnProperties =
            canHaveIndexedEntries &&
            ownPropertySymbols.length === 0 &&
            ownPropertyNames.length === 0 &&
            propertyLikeCallbackSet.size === 0;
          if (skipOwnProperties) {
            break own_properties;
          }
          const hasMarkersWhenEmpty =
            !objectConstructNode &&
            !canHaveInternalEntries &&
            !canHaveIndexedEntries;
          const ownPropertiesNode = node.appendChild("own_properties", {
            render: renderChildren,
            group: "entries",
            subgroup: "own_properties",
            ...(node.isClassPrototype
              ? {
                  onelineDiff: { hasMarkersWhenEmpty },
                  multilineDiff: { hasMarkersWhenEmpty },
                }
              : {
                  startMarker: "{",
                  endMarker: "}",
                  onelineDiff: {
                    hasMarkersWhenEmpty,
                    hasSpacingAroundChildren: true,
                    hasSpacingBetweenEachChild: true,
                    separatorBetweenEachChild:
                      node.functionAnalysis.type === "class" ? ";" : ",",
                  },
                  multilineDiff: {
                    hasMarkersWhenEmpty,
                    separatorBetweenEachChild:
                      node.functionAnalysis.type === "class" ? ";" : ",",
                    hasTrailingSeparator: true,
                    hasNewLineAroundChildren: true,
                    hasIndentBeforeEachChild: true,
                    skippedSummary: {
                      skippedNames: ["prop", "props"],
                    },
                  },
                }),
            childGenerator: () => {
              const appendPropertyEntryNode = (
                key,
                {
                  value,
                  isSourceCode,
                  isFunctionPrototype,
                  isClassPrototype,
                  isHiddenWhenSame,
                },
              ) => {
                const ownPropertyNode = ownPropertiesNode.appendChild(key, {
                  render: renderEntry,
                  middleMarker: node.isClassPrototype
                    ? ""
                    : node.functionAnalysis.type === "class"
                      ? " = "
                      : ": ",
                  isFunctionPrototype,
                  isClassPrototype,
                  isHiddenWhenSame,
                  childGenerator: () => {
                    const ownPropertyValueNode = ownPropertyNode.appendChild(
                      "entry_value",
                      {
                        render: renderValue,
                        group: "entry_value",
                        subgroup: "property_entry_value",
                        value,
                        isSourceCode,
                        isFunctionPrototype,
                        isClassPrototype,
                        methodName: key,
                      },
                    );
                    if (
                      node.functionAnalysis.type === "class" &&
                      !isClassPrototype
                    ) {
                      ownPropertyNode.appendChild("static_keyword", {
                        render: renderGrammar,
                        group: "grammar",
                        subgroup: "static_keyword",
                        value: "static",
                        isHidden:
                          isSourceCode ||
                          ownPropertyValueNode.functionAnalysis.type ===
                            "method",
                      });
                    }
                    ownPropertyNode.appendChild("entry_key", {
                      render: renderPrimitive,
                      group: "entry_key",
                      subgroup: "property_entry_key",
                      value: key,
                      isHidden:
                        isSourceCode ||
                        ownPropertyValueNode.functionAnalysis.type ===
                          "method" ||
                        isClassPrototype,
                    });
                  },
                  group: "entry",
                  subgroup: "property_entry",
                  path: node.path.append(key),
                });
                return ownPropertyNode;
              };

              if (node.isFunction) {
                appendPropertyEntryNode(SOURCE_CODE_ENTRY_KEY, {
                  value: node.functionAnalysis.argsAndBodySource,
                  isSourceCode: true,
                });
              }
              for (const ownPropertySymbol of ownPropertySymbols) {
                const ownPropertySymbolValue = node.value[ownPropertySymbol];
                appendPropertyEntryNode(ownPropertySymbol, {
                  value: ownPropertySymbolValue,
                  isHiddenWhenSame: true,
                });
              }
              for (const ownPropertyName of ownPropertyNames) {
                const ownPropertyValue = node.value[ownPropertyName];
                appendPropertyEntryNode(ownPropertyName, {
                  value: ownPropertyValue,
                  isFunctionPrototype:
                    ownPropertyName === "prototype" && node.isFunction,
                  isClassPrototype:
                    ownPropertyName === "prototype" &&
                    node.functionAnalysis.type === "class",
                });
              }
              for (const propertyLikeCallback of propertyLikeCallbackSet) {
                propertyLikeCallback(appendPropertyEntryNode);
              }
            },
          });
        }
      };
      node.wrappedNodeGetter = () => {
        const constructNode = node.childNodeMap.get("construct");
        if (constructNode) {
          const constructCallNode = constructNode.childNodeMap.get("call");
          if (constructCallNode) {
            const argEntriesNode = constructCallNode.childNodeMap.get("args");
            const firstArgNode = argEntriesNode.childNodeMap.get(0);
            return firstArgNode;
          }
        }
        const ownPropertiesNode = node.childNodeMap.get("own_properties");
        if (ownPropertiesNode) {
          const symbolToPrimitiveReturnValuePropertyNode =
            ownPropertiesNode.childNodeMap.get(
              SYMBOL_TO_PRIMITIVE_RETURN_VALUE_ENTRY_KEY,
            );
          if (symbolToPrimitiveReturnValuePropertyNode) {
            return symbolToPrimitiveReturnValuePropertyNode.childNodeMap.get(
              "entry_value",
            );
          }
          const valueOfReturnValuePropertyNode =
            ownPropertiesNode.childNodeMap.get(VALUE_OF_RETURN_VALUE_ENTRY_KEY);
          if (valueOfReturnValuePropertyNode) {
            return valueOfReturnValuePropertyNode.childNodeMap.get(
              "entry_value",
            );
          }
        }
        return null;
      };
      return node;
    }
    node.category = "primitive";
    return node;
  };

  const referenceFromOthersSetDefault = new Set();

  const comparerDefault = (actualNode, expectNode) => {
    if (actualNode.category === "primitive") {
      if (actualNode.value === expectNode.value) {
        return {
          result: "success",
          propagate: PLACEHOLDER_FOR_SAME,
        };
      }
      return {
        result: "failure",
        reason: "primitive_value",
      };
    }
    if (actualNode.category === "composite") {
      if (actualNode.value === expectNode.value) {
        return {
          result: "success",
          propagate: PLACEHOLDER_FOR_SAME,
        };
      }
      return { result: "" };
    }
    if (actualNode.category === "reference") {
      const actualRefPathString = actualNode.value.pop().toString();
      const expectRefPathString = expectNode.value.pop().toString();
      if (actualRefPathString !== expectRefPathString) {
        return {
          result: "failure",
          reason: "ref_path",
          propagate: PLACEHOLDER_FOR_MODIFIED,
        };
      }
      return {
        result: "success",
        propagate: PLACEHOLDER_FOR_SAME,
      };
    }
    if (actualNode.category === "entries") {
      if (
        actualNode.multilineDiff &&
        expectNode.multilineDiff &&
        actualNode.multilineDiff.hasMarkersWhenEmpty !==
          expectNode.multilineDiff.hasMarkersWhenEmpty
      ) {
        actualNode.multilineDiff.hasMarkersWhenEmpty =
          expectNode.multilineDiff.hasMarkersWhenEmpty = true;
      }
      if (
        actualNode.onelineDiff &&
        expectNode.onelineDiff &&
        actualNode.onelineDiff.hasMarkersWhenEmpty !==
          expectNode.onelineDiff.hasMarkersWhenEmpty
      ) {
        actualNode.onelineDiff.hasMarkersWhenEmpty =
          expectNode.onelineDiff.hasMarkersWhenEmpty = true;
      }
      return { result: "" };
    }
    return { result: "" };
  };

  const appendChildNodeGeneric = (node, childKey, params) => {
    const childNode = createNode({
      id: node.nextId(),
      colorWhenSolo: node.colorWhenSolo,
      colorWhenSame: node.colorWhenSame,
      colorWhenModified: node.colorWhenModified,
      name: node.name,
      parent: node,
      path: node.path,
      referenceMap: node.referenceMap,
      nextId: node.nextId,
      depth:
        params.group === "entries" ||
        params.group === "entry" ||
        params.group === "grammar" ||
        params.isClassPrototype ||
        node.parent?.isClassPrototype
          ? node.depth
          : node.depth + 1,
      ...params,
    });
    node.childNodeMap.set(childKey, childNode);
    return childNode;
  };
}

const renderValue = (node, props) => {
  if (node.category === "primitive") {
    return renderPrimitive(node, props);
  }
  return renderComposite(node, props);
};
const renderPrimitive = (node, props) => {
  if (props.columnsRemaining < 1) {
    return setColor("…", node.color);
  }
  if (node.isSourceCode) {
    return truncateAndAppyColor("[source code]", node, props);
  }
  if (node.isUndefined) {
    return truncateAndAppyColor("undefined", node, props);
  }
  if (node.isString) {
    return renderString(node, props);
  }
  if (node.isSymbol) {
    return renderSymbol(node, props);
  }
  return truncateAndAppyColor(JSON.stringify(node.value), node, props);
};
const renderString = (node, props) => {
  if (node.value === VALUE_OF_RETURN_VALUE_ENTRY_KEY) {
    return truncateAndAppyColor("valueOf()", node, props);
  }
  if (node.value === SYMBOL_TO_PRIMITIVE_RETURN_VALUE_ENTRY_KEY) {
    return truncateAndAppyColor("[Symbol.toPrimitive()]", node, props);
  }
  if (node.isStringForUrl) {
    const urlInternalPropertiesNode = node.childNodeMap.get(
      "url_internal_properties",
    );
    return urlInternalPropertiesNode.render(props);
  }
  const lineEntriesNode = node.childNodeMap.get("line_entries");
  if (lineEntriesNode) {
    return lineEntriesNode.render(props);
  }

  const quoteToEscape = node.quoteMarkerRef?.current;
  if (quoteToEscape) {
    let diff = "";
    for (const char of node.value) {
      if (char === quoteToEscape) {
        diff += `\\${char}`;
      } else {
        diff += char;
      }
    }
    return truncateAndAppyColor(diff, node, props);
  }
  return truncateAndAppyColor(node.value, node, props);
};
const renderChar = (node, props) => {
  const char = node.value;
  if (char === node.quoteMarkerRef.current) {
    return truncateAndAppyColor(`\\${char}`, node, props);
  }
  const point = char.charCodeAt(0);
  if (point === 92 || point < 32 || (point > 126 && point < 160)) {
    return truncateAndAppyColor(CHAR_TO_ESCAPED_CHAR[point], node, props);
  }
  return truncateAndAppyColor(char, node, props);
};
// const renderInteger = (node, props) => {
//   let diff = JSON.stringify(node.value);
//   return truncateAndAppyColor(diff, node, props);
// };
const renderSymbol = (node, props) => {
  const wellKnownNode = node.childNodeMap.get("well_known");
  if (wellKnownNode) {
    return wellKnownNode.render(props);
  }
  const symbolConstructNode = node.childNodeMap.get("symbol_construct");
  return symbolConstructNode.render(props);
};
const renderGrammar = (node, props) => {
  return truncateAndAppyColor(node.value, node, props);
};
const truncateAndAppyColor = (diff, node, props) => {
  const { startMarker, endMarker } = node;
  if (startMarker) {
    diff = `${startMarker}${diff}`;
  }
  if (endMarker) {
    diff += endMarker;
  }
  if (diff.length > props.columnsRemaining) {
    diff = setColor(diff.slice(0, props.columnsRemaining - 1), node.color);
    diff += setColor("…", node.color);
    return diff;
  }
  return setColor(diff, node.color);
};

const renderComposite = (node, props) => {
  // it's here that at some point we'll compare more than just own properties
  // because composite also got a prototype
  // and a constructor that might differ
  let diff = "";
  if (props.columnsRemaining < 2) {
    diff = setColor("…", node.color);
    return diff;
  }
  const referenceNode = node.childNodeMap.get("reference");
  if (referenceNode) {
    return referenceNode.render(props);
  }
  const wellKnownNode = node.childNodeMap.get("well_known");
  if (wellKnownNode) {
    return wellKnownNode.render(props);
  }

  const internalEntriesNode = node.childNodeMap.get("internal_entries");
  const indexedEntriesNode = node.childNodeMap.get("indexed_entries");
  const ownPropertiesNode = node.childNodeMap.get("own_properties");
  let maxDepthReached = false;
  if (node.diffType === "same") {
    maxDepthReached = node.depth > props.MAX_DEPTH;
  } else if (typeof props.firstDiffDepth === "number") {
    maxDepthReached =
      node.depth + props.firstDiffDepth > props.MAX_DEPTH_INSIDE_DIFF;
  } else {
    props.firstDiffDepth = node.depth;
    maxDepthReached = node.depth > props.MAX_DEPTH_INSIDE_DIFF;
  }
  if (maxDepthReached) {
    if (indexedEntriesNode) {
      const arrayLength = indexedEntriesNode.childNodeMap.size;
      diff += setColor(`Array(${arrayLength})`, node.color);
      return diff;
    }
    const ownPropertyCount = ownPropertiesNode.childNodeMap.size;
    diff += setColor(`Object(${ownPropertyCount})`, node.color);
    return diff;
  }
  let columnsRemaining = props.columnsRemaining;
  const constructNode = node.childNodeMap.get("construct");
  if (constructNode) {
    const constructDiff = constructNode.render(props);
    columnsRemaining -= measureLastLineColumns(constructDiff);
    diff += constructDiff;
  }
  if (internalEntriesNode) {
    const internalEntriesDiff = internalEntriesNode.render({
      ...props,
      columnsRemaining,
    });
    columnsRemaining -= measureLastLineColumns(internalEntriesDiff);
    diff += internalEntriesDiff;
  }
  if (indexedEntriesNode) {
    if (diff) {
      columnsRemaining -= " ".length;
      diff += " ";
    }
    const indexedEntriesDiff = indexedEntriesNode.render({
      ...props,
      columnsRemaining,
    });
    columnsRemaining -= measureLastLineColumns(indexedEntriesDiff);
    diff += indexedEntriesDiff;
  }
  if (ownPropertiesNode) {
    const ownPropertiesDiff = ownPropertiesNode.render({
      ...props,
      columnsRemaining,
    });
    if (ownPropertiesDiff) {
      if (diff) {
        columnsRemaining -= " ".length;
        diff += " ";
      }
      diff += ownPropertiesDiff;
    }
  }
  return diff;
};
const renderChildren = (node, props) => {
  const { onelineDiff, multilineDiff } = node;
  if (!multilineDiff) {
    return renderChildrenOneLiner(node, props);
  }
  if (node.diffType === "solo") {
    const childrenKeys = getChildrenKeys(node);
    const indexToDisplayArray = [];
    for (const [childKey] of node.comparisonDiffMap) {
      if (indexToDisplayArray.length >= props.MAX_DIFF_PER_OBJECT) {
        break;
      }
      const childIndex = childrenKeys.indexOf(childKey);
      indexToDisplayArray.push(childIndex);
    }
    indexToDisplayArray.sort();
    node.childrenKeys = childrenKeys;
    node.indexToDisplayArray = indexToDisplayArray;
    return renderChildrenMultiline(node, props);
  }
  if (node.comparisonDiffMap.size > 0) {
    const childrenKeys = getChildrenKeys(node);
    const indexToDisplayArray = [];
    index_to_display: {
      if (childrenKeys.length === 0) {
        break index_to_display;
      }
      const diffIndexArray = [];
      for (const [childKey] of node.comparisonDiffMap) {
        const childIndex = childrenKeys.indexOf(childKey);
        if (childIndex === -1) {
          // happens when removed/added
        } else {
          diffIndexArray.push(childIndex);
        }
      }
      if (diffIndexArray.length === 0) {
        // happens when one node got no diff in itself
        // it's the other that has a diff (added or removed)
        indexToDisplayArray.push(0);
        break index_to_display;
      }
      diffIndexArray.sort();
      const indexToDisplaySet = new Set();
      let diffCount = 0;
      for (const diffIndex of diffIndexArray) {
        if (diffCount >= props.MAX_DIFF_PER_OBJECT) {
          break;
        }
        diffCount++;
        let beforeDiffIndex = diffIndex - 1;
        let beforeCount = 0;
        while (beforeDiffIndex > -1) {
          if (beforeCount === props.MAX_ENTRY_BEFORE_MULTILINE_DIFF) {
            break;
          }
          indexToDisplaySet.add(beforeDiffIndex);
          beforeCount++;
          beforeDiffIndex--;
        }
        indexToDisplaySet.add(diffIndex);
        let afterDiffIndex = diffIndex + 1;
        let afterCount = 0;
        while (afterDiffIndex < childrenKeys.length) {
          if (afterCount === props.MAX_ENTRY_AFTER_MULTILINE_DIFF) {
            break;
          }
          indexToDisplaySet.add(afterDiffIndex);
          afterCount++;
          afterDiffIndex++;
        }
      }
      for (const indexToDisplay of indexToDisplaySet) {
        indexToDisplayArray.push(indexToDisplay);
      }
      indexToDisplayArray.sort();
    }
    node.childrenKeys = childrenKeys;
    node.indexToDisplayArray = indexToDisplayArray;
    return renderChildrenMultiline(node, props);
  }
  if (onelineDiff) {
    return renderChildrenOneLiner(node, props);
  }
  node.childrenKeys = getChildrenKeys(node);
  node.indexToDisplayArray = [0];
  return renderChildrenMultiline(node, props);
};
const renderChildrenOneLiner = (node, props) => {
  const {
    separatorBetweenEachChild,
    hasTrailingSeparator,
    focusedChildWhenSame = "first",
    overflowStartMarker = "",
    overflowEndMarker = "",
    overflowMarkersPlacement = "inside",
    hasMarkersWhenEmpty,
    hasSpacingAroundChildren,
    hasSpacingBetweenEachChild,
  } = node.onelineDiff;

  let columnsRemaining = props.columnsRemaining;
  if (columnsRemaining < 1) {
    return setColor("…", node.color);
  }
  const childrenKeys = getChildrenKeys(node);
  const { startMarker, endMarker } = node;
  if (childrenKeys.length === 0) {
    return hasMarkersWhenEmpty
      ? setColor(`${startMarker}${endMarker}`, node.color)
      : "";
  }
  let focusedChildIndex = -1;
  if (node.comparisonDiffMap.size > 0) {
    for (const [childKey] of node.comparisonDiffMap) {
      const childIndex = childrenKeys.indexOf(childKey);
      if (childIndex === -1) {
        // happens when removed/added
      } else {
        focusedChildIndex = childIndex;
        break;
      }
    }
  } else {
    focusedChildIndex =
      focusedChildWhenSame === "first"
        ? 0
        : focusedChildWhenSame === "last"
          ? childrenKeys.length - 1
          : Math.floor(childrenKeys.length / 2);
  }
  let hasStartOverflow = focusedChildIndex > 0;
  let hasEndOverflow = focusedChildIndex < childrenKeys.length - 1;
  const overflowStartWidth = overflowStartMarker.length;
  const overflowEndWidth = overflowEndMarker.length;
  let boilerplate = "";
  if (hasStartOverflow) {
    if (overflowMarkersPlacement === "inside") {
      if (hasSpacingAroundChildren) {
        boilerplate = `${startMarker} ${overflowStartMarker}`;
      } else {
        boilerplate = `${startMarker}${overflowStartMarker}`;
      }
    } else {
      boilerplate = `${overflowStartMarker}${startMarker}`;
    }
  } else {
    boilerplate = startMarker;
  }
  if (hasEndOverflow) {
    if (overflowMarkersPlacement === "inside") {
      if (hasSpacingAroundChildren) {
        boilerplate += `${overflowEndMarker} ${endMarker}`;
      } else {
        boilerplate += `${overflowEndMarker}${endMarker}`;
      }
    } else {
      boilerplate += `${endMarker}${overflowEndMarker}`;
    }
  } else {
    boilerplate += endMarker;
  }

  if (columnsRemaining < boilerplate.length) {
    return setColor("…", node.color);
  }
  if (columnsRemaining === boilerplate.length) {
    return overflowMarkersPlacement === "inside"
      ? setColor(boilerplate, node.color)
      : setColor("…", node.color);
  }

  const renderChildDiff = (childNode, childIndex) => {
    const childSeparator = getChildSeparator({
      separatorBetweenEachChild,
      hasTrailingSeparator,
      childIndex,
      childrenKeys,
    });
    if (!childSeparator) {
      const childDiff = childNode.render(props);
      return childDiff;
    }
    let columnsRemainingForChild = props.columnsRemaining;
    const childSeparatorWidth = stringWidth(childSeparator);
    columnsRemainingForChild -= childSeparatorWidth;
    let childDiff = childNode.render({
      ...props,
      columnsRemaining: columnsRemainingForChild,
    });
    childDiff += setColor(
      childSeparator,
      childNode.diffType === "solo" ? childNode.color : node.color,
    );
    return childDiff;
  };
  columnsRemaining -= startMarker.length;
  columnsRemaining -= endMarker.length;
  if (hasSpacingAroundChildren) {
    columnsRemaining -= "  ".length;
  }
  const childDiffArray = [];
  const focusedChildKey = childrenKeys[focusedChildIndex];
  const focusedChildNode = node.childNodeMap.get(focusedChildKey);
  if (focusedChildNode) {
    const focusedChildDiff = renderChildDiff(
      focusedChildNode,
      focusedChildIndex,
    );
    columnsRemaining -= stringWidth(focusedChildDiff);
    childDiffArray.push(focusedChildDiff);
  }
  let tryBeforeFirst = true;
  let previousChildAttempt = 0;
  let nextChildAttempt = 0;
  while (columnsRemaining) {
    const previousChildIndex = focusedChildIndex - previousChildAttempt - 1;
    const nextChildIndex = focusedChildIndex + nextChildAttempt + 1;
    let hasPreviousChild = previousChildIndex >= 0;
    const hasNextChild = nextChildIndex < childrenKeys.length;
    if (!hasPreviousChild && !hasNextChild) {
      break;
    }
    if (!tryBeforeFirst && hasNextChild) {
      hasPreviousChild = false;
    }
    let childIndex;
    if (hasPreviousChild) {
      previousChildAttempt++;
      childIndex = previousChildIndex;
    } else if (hasNextChild) {
      nextChildAttempt++;
      childIndex = nextChildIndex;
    }
    const childKey = childrenKeys[childIndex];
    const childNode = node.childNodeMap.get(childKey);
    if (!childNode) {
      debugger; // to keep to see if that is hit while running all of string.test.js
      // if not remove it
      continue;
    }
    if (tryBeforeFirst && hasPreviousChild) {
      tryBeforeFirst = false;
    }
    const childDiff = renderChildDiff(childNode, childIndex);
    const childDiffWidth = measureLastLineColumns(childDiff);
    let nextWidth = childDiffWidth;
    hasStartOverflow = focusedChildIndex - previousChildAttempt > 0;
    hasEndOverflow =
      focusedChildIndex + nextChildAttempt < childrenKeys.length - 1;
    if (hasStartOverflow) {
      nextWidth += overflowStartWidth;
    }
    if (hasEndOverflow) {
      nextWidth += overflowEndWidth;
    }
    if (nextWidth > columnsRemaining) {
      if (hasPreviousChild) {
        previousChildAttempt--;
      } else {
        nextChildAttempt--;
      }
      break;
    }
    columnsRemaining -= childDiffWidth;
    if (
      hasSpacingBetweenEachChild &&
      childIndex > 0 &&
      childIndex < childrenKeys.length - 1
    ) {
      columnsRemaining -= " ".length;
    }
    if (childIndex < focusedChildIndex) {
      childDiffArray.unshift(childDiff);
    } else {
      childDiffArray.push(childDiff);
    }
  }
  let diff = "";
  if (hasStartOverflow) {
    if (overflowMarkersPlacement === "inside") {
      if (startMarker) {
        diff += setColor(startMarker, node.color);
      }
      diff += setColor(overflowStartMarker, node.color);
    } else {
      diff += setColor(overflowStartMarker, node.color);
      if (startMarker) {
        diff += setColor(startMarker, node.color);
      }
    }
  } else if (startMarker) {
    diff += setColor(startMarker, node.color);
  }
  if (hasSpacingAroundChildren) {
    diff += " ";
  }
  diff += hasSpacingBetweenEachChild
    ? childDiffArray.join(" ")
    : childDiffArray.join("");
  if (hasSpacingAroundChildren) {
    diff += " ";
  }
  if (hasEndOverflow) {
    if (overflowMarkersPlacement === "inside") {
      diff += setColor(overflowEndMarker, node.color);
      if (endMarker) {
        diff += setColor(endMarker, node.color);
      }
    } else {
      if (endMarker) {
        diff += setColor(endMarker, node.color);
      }
      diff += setColor(overflowEndMarker, node.color);
    }
  } else if (endMarker) {
    diff += setColor(endMarker, node.color);
  }
  return diff;
};
const renderChildrenMultiline = (node, props) => {
  const {
    separatorBetweenEachChild = "",
    hasTrailingSeparator,
    hasNewLineAroundChildren,
    hasIndentBeforeEachChild,
    hasIndentBetweenEachChild,
    hasMarkersWhenEmpty,
    skippedSummary,
  } = node.multilineDiff;

  if (node.beforeRender) {
    node.beforeRender(props);
  }
  const { childrenKeys, indexToDisplayArray, startMarker, endMarker } = node;
  let atLeastOneEntryDisplayed = null;
  let diff = "";
  let childrenDiff = "";
  const appendChildDiff = (childDiff) => {
    if (atLeastOneEntryDisplayed) {
      childrenDiff += "\n";
      childrenDiff += childDiff;
    } else {
      childrenDiff += childDiff;
      atLeastOneEntryDisplayed = true;
    }
  };
  const appendSkippedSection = (skipCount, skipPosition) => {
    let skippedDiff = "";
    if (hasIndentBeforeEachChild) {
      skippedDiff += "  ".repeat(getNodeDepth(node, props) + 1);
    }
    if (hasIndentBetweenEachChild && skipPosition !== "start") {
      skippedDiff += " ".repeat(props.MAX_COLUMNS - props.columnsRemaining);
    }
    if (skippedSummary) {
      const { skippedNames } = skippedSummary;
      const sign = { start: "↑", between: "↕", end: `↓` }[skipPosition];
      skippedDiff += setColor(sign, node.color);
      skippedDiff += " ";
      skippedDiff += setColor(String(skipCount), node.color);
      skippedDiff += " ";
      skippedDiff += setColor(
        skippedNames[skipCount === 1 ? 0 : 1],
        node.color,
      );
      skippedDiff += " ";
      skippedDiff += setColor(sign, node.color);
      appendChildDiff(skippedDiff);
      return;
    }
  };
  let previousIndexDisplayed = -1;
  let canResetMaxColumns = hasNewLineAroundChildren;
  let somethingDisplayed = false;
  for (const childIndex of indexToDisplayArray) {
    if (previousIndexDisplayed === -1) {
      if (childIndex > 0) {
        appendSkippedSection(childIndex, "start");
        somethingDisplayed = true;
      }
    } else {
      const intermediateSkippedCount = childIndex - previousIndexDisplayed - 1;
      if (intermediateSkippedCount) {
        appendSkippedSection(intermediateSkippedCount, "between");
      }
    }
    const childKey = childrenKeys[childIndex];
    const childNode = node.childNodeMap.get(childKey);

    let childDiff = "";
    let columnsRemainingForChild = canResetMaxColumns
      ? props.MAX_COLUMNS
      : props.columnsRemaining;
    if (hasIndentBeforeEachChild) {
      const indent = "  ".repeat(getNodeDepth(node, props) + 1);
      columnsRemainingForChild -= stringWidth(indent);
      childDiff += indent;
    }
    if (hasIndentBetweenEachChild && somethingDisplayed) {
      const indent = " ".repeat(props.MAX_COLUMNS - props.columnsRemaining);
      columnsRemainingForChild -= stringWidth(indent);
      childDiff += indent;
    }
    const childSeparator = getChildSeparator({
      separatorBetweenEachChild,
      hasTrailingSeparator,
      childIndex,
      childrenKeys,
    });
    if (childSeparator) {
      columnsRemainingForChild -= stringWidth(childSeparator);
    }
    childDiff += childNode.render({
      ...props,
      columnsRemaining: columnsRemainingForChild,
      indexToDisplayArray,
    });
    if (childSeparator) {
      childDiff += setColor(
        childSeparator,
        childNode.diffType === "solo" ? childNode.color : node.color,
      );
    }
    canResetMaxColumns = true; // because we'll append \n on next entry
    appendChildDiff(childDiff);
    previousIndexDisplayed = childIndex;
    somethingDisplayed = true;
  }
  const lastIndexDisplayed = previousIndexDisplayed;
  if (lastIndexDisplayed > -1) {
    const lastSkippedCount = childrenKeys.length - 1 - lastIndexDisplayed;
    if (lastSkippedCount) {
      appendSkippedSection(lastSkippedCount, "end");
    }
  }
  if (!atLeastOneEntryDisplayed) {
    if (hasMarkersWhenEmpty) {
      return setColor(`${startMarker}${endMarker}`, node.color);
    }
    return "";
  }
  diff += setColor(startMarker, node.color);
  if (hasNewLineAroundChildren) {
    diff += "\n";
  }
  diff += childrenDiff;
  if (hasNewLineAroundChildren) {
    diff += "\n";
    diff += "  ".repeat(getNodeDepth(node, props));
  }
  diff += setColor(endMarker, node.color);
  return diff;
};
const getChildSeparator = ({
  separatorBetweenEachChild,
  hasTrailingSeparator,
  childIndex,
  childrenKeys,
}) => {
  if (!separatorBetweenEachChild) {
    return "";
  }
  if (hasTrailingSeparator) {
    return separatorBetweenEachChild;
  }
  if (childIndex === 0) {
    return childrenKeys.length > 1 ? separatorBetweenEachChild : "";
  }
  if (childIndex !== childrenKeys.length - 1) {
    return separatorBetweenEachChild;
  }
  return "";
};
const getChildrenKeys = (node) => {
  const childrenKeys = [];
  for (const [childKey, childNode] of node.childNodeMap) {
    if (childNode.isHidden) {
      continue;
    }
    childrenKeys.push(childKey);
  }
  return childrenKeys;
};
const renderEntry = (node, props) => {
  const { endMarker } = node;
  let entryDiff = "";
  let columnsRemaining = props.columnsRemaining;
  const entryKeyNode = node.childNodeMap.get("entry_key");
  if (endMarker) {
    columnsRemaining -= endMarker.length;
  }
  let columnsRemainingForValue = columnsRemaining;

  const staticKeywordNode = node.childNodeMap.get("static_keyword");
  if (staticKeywordNode && !staticKeywordNode.isHidden) {
    const staticKeywordDiff = staticKeywordNode.render({
      ...props,
      columnsRemaining,
    });
    columnsRemaining -= measureLastLineColumns(staticKeywordDiff);
    columnsRemaining -= " ".length;
    entryDiff += staticKeywordDiff;
    entryDiff += " ";
  }
  if (!entryKeyNode.isHidden) {
    const entryKeyDiff = entryKeyNode.render({
      ...props,
      columnsRemaining,
    });
    columnsRemainingForValue -= measureLastLineColumns(entryKeyDiff);
    entryDiff += entryKeyDiff;
    const { middleMarker } = node;
    if (columnsRemainingForValue > middleMarker.length) {
      columnsRemainingForValue -= middleMarker.length;
      entryDiff += setColor(middleMarker, node.color);
    } else {
      columnsRemainingForValue = 0;
    }
  }
  if (columnsRemainingForValue > 0) {
    const entryValueNode = node.childNodeMap.get("entry_value");
    entryDiff += entryValueNode.render({
      ...props,
      columnsRemaining: columnsRemainingForValue,
    });
    if (endMarker) {
      entryDiff += setColor(endMarker, node.color);
    }
  } else if (endMarker) {
    entryDiff += setColor(endMarker, node.color);
  }
  return entryDiff;
};
const getNodeDepth = (node, props) => {
  return node.depth - props.startNode.depth;
};
const enableMultilineDiff = (lineEntriesNode) => {
  const firstLineEntryNode = lineEntriesNode.childNodeMap.get(0);
  firstLineEntryNode.onelineDiff.hasMarkersWhenEmpty = false;
  firstLineEntryNode.startMarker = firstLineEntryNode.endMarker = "";

  lineEntriesNode.multilineDiff.hasIndentBetweenEachChild = true;
  lineEntriesNode.beforeRender = () => {
    let biggestDisplayedLineIndex = 0;
    for (const index of lineEntriesNode.indexToDisplayArray) {
      if (index > biggestDisplayedLineIndex) {
        biggestDisplayedLineIndex = index;
      }
    }
    for (const index of lineEntriesNode.indexToDisplayArray) {
      const lineNode = lineEntriesNode.childNodeMap.get(index);
      lineNode.onelineDiff.hasMarkersWhenEmpty = true;
      lineNode.startMarker = renderLineStartMarker(
        lineNode,
        biggestDisplayedLineIndex,
      );
    }
  };
};
const renderLineStartMarker = (lineNode, biggestDisplayedLineIndex) => {
  let lineStartMarker = "";
  const lineNumberString = String(lineNode.key + 1);
  const biggestDisplayedLineNumberString = String(
    biggestDisplayedLineIndex + 1,
  );
  if (biggestDisplayedLineNumberString.length > lineNumberString.length) {
    lineStartMarker += " ";
  }
  lineStartMarker += ANSI.color(lineNumberString, lineNode.color);
  // lineDiff += " ";
  lineStartMarker += ANSI.color("|", lineNode.color);
  lineStartMarker += " ";
  return lineStartMarker;
};

const createMethodCallNode = (node, { objectName, methodName, args }) => {
  return {
    render: renderChildrenOneLiner,
    onelineDiff: {
      hasTrailingSeparator: true,
    },
    group: "entries",
    subgroup: "method_call",
    childGenerator: (methodCallNode) => {
      methodCallNode.appendChild("object_name", {
        render: renderGrammar,
        group: "grammar",
        subgroup: "object_name",
        value: objectName,
      });
      if (methodName) {
        methodCallNode.appendChild("method_dot", {
          render: renderGrammar,
          group: "grammar",
          subgroup: "method_dot",
          value: ".",
        });
        methodCallNode.appendChild("method_name", {
          render: renderGrammar,
          group: "grammar",
          subgroup: "method_name",
          value: methodName,
        });
      }
      methodCallNode.appendChild(
        "args",
        createArgEntriesNode(methodCallNode, { args }),
      );
    },
  };
};

const createArgEntriesNode = (node, { args }) => {
  return {
    startMarker: "(",
    endMarker: ")",
    render: renderChildrenOneLiner,
    onelineDiff: {
      separatorBetweenEachChild: ",",
      hasSpacingBetweenEachChild: true,
    },
    // multilineDiff: {
    //   hasSpacingAroundChildren: true,
    //    separatorBetweenEachChild: ",",
    //   hasNewLineAroundChildren: true,
    //   hasIndentBeforeEachChild: true,
    // },
    group: "entries",
    subgroup: "arg_entries",
    childGenerator: (callNode) => {
      const appendArgEntry = (argIndex, argValue, { key, ...valueParams }) => {
        callNode.appendChild(argIndex, {
          value: argValue,
          render: renderValue,
          group: "entry_value",
          subgroup: "arg_entry_value",
          path: node.path.append(key || argIndex),
          depth: node.depth,
          ...valueParams,
        });
      };
      let argIndex = 0;
      for (const { value, ...argParams } of args) {
        appendArgEntry(argIndex, value, argParams);
        argIndex++;
      }
    },
  };
};

const DOUBLE_QUOTE = `"`;
const SINGLE_QUOTE = `'`;
const BACKTICK = "`";

const getAddedOrRemovedReason = (node) => {
  if (node.group === "url_internal_prop") {
    return node.subgroup;
  }
  if (node.category === "entry") {
    return getAddedOrRemovedReason(node.childNodeMap.get("entry_key"));
  }
  if (node.category === "entry_key") {
    return node.value;
  }
  if (node.category === "entry_value") {
    return getAddedOrRemovedReason(node.parent);
  }
  if (node.subgroup === "value_of_return_value") {
    return "value_of_own_method";
  }
  return "unknown";
};

const getWrappedNode = (node, predicate) => {
  const wrappedNode = node.wrappedNodeGetter();
  if (!wrappedNode) {
    return null;
  }
  if (predicate(wrappedNode)) {
    return wrappedNode;
  }
  // can happen for
  // valueOf: () => {
  //   return { valueOf: () => 10 }
  // }
  const nested = getWrappedNode(wrappedNode, predicate);
  if (nested) {
    return nested;
  }
  return null;
};
// const asCompositeNode = (node) =>
//   getWrappedNode(
//     node,
//     (wrappedNodeCandidate) => wrappedNodeCandidate.group === "composite",
//   );
const asPrimitiveNode = (node) =>
  getWrappedNode(
    node,
    (wrappedNodeCandidate) => wrappedNodeCandidate.category === "primitive",
  );

const shouldIgnoreOwnPropertyName = (node, ownPropertyName) => {
  if (ownPropertyName === "prototype") {
    // ignore prototype if it's the default prototype
    // created by the runtime
    const ownPropertyDescriptor = Object.getOwnPropertyDescriptor(
      node.value,
      ownPropertyName,
    );
    if (!Object.hasOwn(ownPropertyDescriptor, "value")) {
      return false;
    }
    const prototypeValue = ownPropertyDescriptor.value;
    if (node.isArrowFunction) {
      return prototypeValue === undefined;
    }
    if (node.isAsyncFunction && !node.isGeneratorFunction) {
      return prototypeValue === undefined;
    }
    if (!isComposite(prototypeValue)) {
      return false;
    }
    const constructorDescriptor = Object.getOwnPropertyDescriptor(
      prototypeValue,
      "constructor",
    );
    if (!constructorDescriptor) {
      return false;
    }
    // the default prototype.constructor is
    // configurable, writable, non enumerable and got a value
    if (
      !constructorDescriptor.configurable ||
      !constructorDescriptor.writable ||
      constructorDescriptor.enumerable ||
      constructorDescriptor.set ||
      constructorDescriptor.get
    ) {
      return false;
    }
    const constructorValue = constructorDescriptor.value;
    if (constructorValue !== node.value) {
      return false;
    }
    const propertyNames = Object.getOwnPropertyNames(prototypeValue);
    return propertyNames.length === 1;
  }
  if (ownPropertyName === "constructor") {
    // if (
    //   node.parent.key === "prototype" &&
    //   node.parent.parent.isFunction &&
    //   Object.hasOwn(ownPropertyDescriptor, "value") &&
    //   ownPropertyDescriptor.value === node.parent.parent.value
    // ) {
    return true;
    //  }
    //  break ignore;
  }
  if (ownPropertyName === "length") {
    return node.isArray || node.isFunction;
  }
  if (ownPropertyName === "name") {
    return node.isFunction;
  }
  if (ownPropertyName === "stack") {
    return node.isError;
  }
  return false;
};
const shouldIgnoreOwnPropertySymbol = (node, ownPropertySymbol) => {
  if (ownPropertySymbol === Symbol.toPrimitive) {
    if (
      node.childNodes.wrappedValue &&
      node.childNodes.wrappedValue.key === "Symbol.toPrimitive()"
    ) {
      return true;
    }
    return false;
  }
  if (ownPropertySymbol === Symbol.toStringTag) {
    const propertySymbolDescriptor = Object.getOwnPropertyDescriptor(
      node.value,
      Symbol.toStringTag,
    );
    if (Object.hasOwn(propertySymbolDescriptor, "value")) {
      // toStringTag is already reflected on subtype
      return true;
    }
    return false;
  }
  if (node.isPromise) {
    if (
      !Symbol.keyFor(ownPropertySymbol) &&
      symbolToDescription(ownPropertySymbol) === "async_id_symbol"
    ) {
      // nodejs runtime puts a custom Symbol on promise
      return true;
    }
    return false;
  }
  if (node.isHeaders) {
    if (
      !Symbol.keyFor(ownPropertySymbol) &&
      ["guard", "headers list"].includes(symbolToDescription(ownPropertySymbol))
    ) {
      // nodejs runtime put custom symbols on Headers
      return true;
    }
    return false;
  }
  return false;
};
// const shouldIgnorePropertyDescriptor = (
//   node,
//   propertyKey,
//   descriptorKey,
//   descriptorValue,
// ) => {
//   /* eslint-disable no-unneeded-ternary */
//   if (descriptorKey === "writable") {
//     if (node.propsFrozen) {
//       return true;
//     }
//     const writableDefaultValue =
//       propertyKey === "prototype" && node.isClass ? false : true;
//     return descriptorValue === writableDefaultValue;
//   }
//   if (descriptorKey === "configurable") {
//     if (node.propsFrozen) {
//       return true;
//     }
//     if (node.propsSealed) {
//       return true;
//     }
//     const configurableDefaultValue =
//       propertyKey === "prototype" && node.isFunction ? false : true;
//     return descriptorValue === configurableDefaultValue;
//   }
//   if (descriptorKey === "enumerable") {
//     const enumerableDefaultValue =
//       (propertyKey === "prototype" && node.isFunction) ||
//       (propertyKey === "message" && node.isError) ||
//       node.isClassPrototype
//         ? false
//         : true;
//     return descriptorValue === enumerableDefaultValue;
//   }
//   /* eslint-enable no-unneeded-ternary */
//   if (descriptorKey === "get") {
//     return descriptorValue === undefined;
//   }
//   if (descriptorKey === "set") {
//     return descriptorValue === undefined;
//   }
//   return false;
// };

const createReasons = () => {
  const overall = {
    any: new Set(),
    modified: new Set(),
    removed: new Set(),
    added: new Set(),
  };
  const self = {
    any: new Set(),
    modified: new Set(),
    removed: new Set(),
    added: new Set(),
  };
  const inside = {
    any: new Set(),
    modified: new Set(),
    removed: new Set(),
    added: new Set(),
  };

  return {
    overall,
    self,
    inside,
  };
};
const appendReasons = (reasonSet, ...otherReasonSets) => {
  for (const otherReasonSet of otherReasonSets) {
    for (const reason of otherReasonSet) {
      reasonSet.add(reason);
    }
  }
};
const appendReasonGroup = (reasonGroup, otherReasonGroup) => {
  appendReasons(reasonGroup.any, otherReasonGroup.any);
  appendReasons(reasonGroup.removed, otherReasonGroup.removed);
  appendReasons(reasonGroup.added, otherReasonGroup.added);
  appendReasons(reasonGroup.modified, otherReasonGroup.modified);
};

// prettier-ignore
const CHAR_TO_ESCAPED_CHAR = [
  '\\x00', '\\x01', '\\x02', '\\x03', '\\x04', '\\x05', '\\x06', '\\x07', // x07
  '\\b', '\\t', '\\n', '\\x0B', '\\f', '\\r', '\\x0E', '\\x0F',           // x0F
  '\\x10', '\\x11', '\\x12', '\\x13', '\\x14', '\\x15', '\\x16', '\\x17', // x17
  '\\x18', '\\x19', '\\x1A', '\\x1B', '\\x1C', '\\x1D', '\\x1E', '\\x1F', // x1F
  '', '', '', '', '', '', '', "\\'", '', '', '', '', '', '', '', '',      // x2F
  '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',         // x3F
  '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',         // x4F
  '', '', '', '', '', '', '', '', '', '', '', '', '\\\\', '', '', '',     // x5F
  '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',         // x6F
  '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '\\x7F',    // x7F
  '\\x80', '\\x81', '\\x82', '\\x83', '\\x84', '\\x85', '\\x86', '\\x87', // x87
  '\\x88', '\\x89', '\\x8A', '\\x8B', '\\x8C', '\\x8D', '\\x8E', '\\x8F', // x8F
  '\\x90', '\\x91', '\\x92', '\\x93', '\\x94', '\\x95', '\\x96', '\\x97', // x97
  '\\x98', '\\x99', '\\x9A', '\\x9B', '\\x9C', '\\x9D', '\\x9E', '\\x9F', // x9F
];

const canParseUrl =
  URL.canParse ||
  (() => {
    try {
      // eslint-disable-next-line no-new, no-undef
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
  });

const symbolToDescription = (symbol) => {
  const toStringResult = symbol.toString();
  const openingParenthesisIndex = toStringResult.indexOf("(");
  const closingParenthesisIndex = toStringResult.indexOf(")");
  return toStringResult.slice(
    openingParenthesisIndex + 1,
    closingParenthesisIndex,
  );
  // return symbol.description // does not work on node
};
