import stringWidth from "string-width";
import Graphemer from "graphemer";
import { ANSI, UNICODE } from "@jsenv/humanize";
import { isAssertionError, createAssertionError } from "./assertion_error.js";
import { analyseFunction } from "./function_analysis.js";
import { tokenizeFloat, tokenizeInteger } from "./tokenize_number.js";

const removedSign = UNICODE.FAILURE_RAW;
const addedSign = UNICODE.FAILURE_RAW;
const unexpectSign = UNICODE.FAILURE_RAW;
const sameColor = ANSI.GREY;
const removedColor = ANSI.YELLOW;
const addedColor = ANSI.YELLOW;
const unexpectColor = ANSI.RED;
const expectColor = ANSI.GREEN;
const unexpectSignColor = ANSI.GREY;
const removedSignColor = ANSI.GREY;
const addedSignColor = ANSI.GREY;
const ARRAY_EMPTY_VALUE = { array_empty_value: true }; // Symbol.for('array_empty_value') ?
// const VALUE_OF_NOT_FOUND = { value_of_not_found: true };
// const DOES_NOT_EXISTS = { does_not_exists: true };

const sourceCodeSymbol = Symbol.for("jsenv_assert_source_code");
const createSourceCode = (value) => {
  return {
    [sourceCodeSymbol]: value,
  };
};

const defaultOptions = {
  colors: true,
  actual: undefined,
  expect: undefined,
  maxDepth: 5,
  maxColumns: 100,
  maxDiffPerObject: 5,
  maxValueAroundDiff: 2,
  maxValueInsideDiff: 4,
  maxDepthInsideDiff: 1,
  maxLineAroundDiff: 2,
  quote: "auto",
  preserveLineBreaks: false,
  signs: false,
};

export const createAssert = ({ format = (v) => v } = {}) => {
  const assert = (...args) => {
    // param validation
    let firstArg;
    let actualIsFirst;
    {
      if (args.length === 0) {
        throw new Error(
          `assert must be called with { actual, expect }, missing first argument`,
        );
      }
      if (args.length > 1) {
        throw new Error(
          `assert must be called with { actual, expect }, received too many arguments`,
        );
      }
      firstArg = args[0];
      if (typeof firstArg !== "object" || firstArg === null) {
        throw new Error(
          `assert must be called with { actual, expect }, received ${firstArg} as first argument instead of object`,
        );
      }
      const unexpectedParamNames = Object.keys(firstArg).filter(
        (key) => !Object.hasOwn(defaultOptions, key),
      );
      if (unexpectedParamNames.length > 0) {
        throw new TypeError(
          `"${unexpectedParamNames.join(",")}": there is no such param`,
        );
      }
      if ("actual" in firstArg === false) {
        throw new Error(
          `assert must be called with { actual, expect }, missing actual property on first argument`,
        );
      }
      if ("expect" in firstArg === false) {
        throw new Error(
          `assert must be called with { actual, expect }, missing expect property on first argument`,
        );
      }
      firstArg = { ...defaultOptions, ...firstArg };
    }

    const {
      colors,
      actual,
      expect,
      maxDepth,
      maxColumns,
      maxDiffPerObject,
      maxValueAroundDiff,
      maxValueInsideDiff,
      maxDepthInsideDiff,
      maxLineAroundDiff,
      quote,
      preserveLineBreaks,
      signs,
    } = firstArg;
    if (!colors) {
      ANSI.supported = false;
    }
    const maxValueBeforeDiff = maxValueAroundDiff;
    const maxValueAfterDiff = maxValueAroundDiff;
    const maxLineBeforeDiff = maxLineAroundDiff;
    const maxLineAfterDiff = maxLineAroundDiff;

    actualIsFirst = true;

    // actualIsFirst =
    //   Object.keys(firstArg).indexOf("actual") <
    //   Object.keys(firstArg).indexOf("expect");
    const actualReferenceMap = new Map();
    const getActualReference = (value, node) => {
      const reference = actualReferenceMap.get(value);
      if (reference) {
        reference.referenceFromOthersSet.add(node);
      } else {
        actualReferenceMap.set(value, node);
      }
      return reference;
    };
    const actualNode = createValueNode({
      name: "actual",
      value: actual,
      getReference: getActualReference,
      quoteOption: quote,
      preserveLineBreaksOption: preserveLineBreaks,
    });
    const expectReferenceMap = new Map();
    const getExpectReference = (value, node) => {
      const reference = expectReferenceMap.get(value);
      if (reference) {
        reference.referenceFromOthersSet.add(node);
      } else {
        expectReferenceMap.set(value, node);
      }
      return reference;
    };
    const expectNode = createValueNode({
      name: "expect",
      value: expect,
      getReference: getExpectReference,
      quoteOption: quote,
      preserveLineBreaksOption: preserveLineBreaks,
    });
    const causeCounters = {
      total: 0,
      displayed: 0,
    };
    const causeSet = new Set();
    const addCause = (comparison) => {
      if (causeSet.has(comparison)) {
        throw new Error("nope");
      }
      if (comparison.type === "line") {
        return;
      }
      if (comparison.type === "char") {
        return;
      }
      if (comparison.type === "entry") {
        // entry_value will do that
        return;
      }
      if (comparison.type === "entry_key") {
        return;
      }
      if (comparison.type === "entry_value") {
        const ownerComparison = comparison.parent.parent;
        if (!comparison.actualNode && !ownerComparison.actualNode) {
          return;
        }
        if (!comparison.expectNode && !ownerComparison.expectNode) {
          return;
        }
      }
      if (comparison.hidden) {
        return;
      }
      if (
        comparison.type === "prototype" &&
        comparison.actualNode &&
        comparison.actualNode.parent.isFunction &&
        comparison.expectNode &&
        comparison.expectNode.parent.isFunction
      ) {
        // when function prototype differ
        // the diff is already detected by isAsync/isGenerator
        // or functionAnalysis.type
        return;
      }
      // reference to something already counted should not be counted again
      // (happen with class.prototype.constructor referencing the class itself for example)
      referenced: {
        const actualReference =
          comparison.actualNode && comparison.actualNode.reference;
        if (actualReference && causeSet.has(actualReference.comparison)) {
          return;
        }
        const expectReference =
          comparison.expectNode && comparison.expectNode.reference;
        if (expectReference && causeSet.has(expectReference.comparison)) {
          return;
        }
      }
      causeCounters.total++;
      causeSet.add(comparison);
    };
    const removeCause = (comparison) => {
      if (causeSet.has(comparison)) {
        causeCounters.total--;
        causeSet.delete(comparison);
      }
    };
    const onComparisonDisplayed = (comparison, skipped) => {
      if (causeSet.has(comparison)) {
        causeSet.delete(comparison);
        causeCounters.displayed++;
      }
      if (skipped) {
        const childComparisons = comparison.childComparisons;
        for (const childComparisonName of Object.keys(childComparisons)) {
          const childComparisonValue = childComparisons[childComparisonName];
          if (!childComparisonValue) {
            continue;
          }
          if (Array.isArray(childComparisonValue)) {
            childComparisonValue.forEach((childComparison) => {
              onComparisonDisplayed(childComparison, true);
            });
            continue;
          }
          if (
            childComparisonValue.actualNode ||
            childComparisonValue.expectNode
          ) {
            onComparisonDisplayed(childComparisonValue, true);
            continue;
          }
          for (const childComparison of Object.values(childComparisonValue)) {
            onComparisonDisplayed(childComparison, true);
          }
        }
      }
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
    const settleReasons = (comparison) => {
      const { reasons } = comparison;
      const { self, inside, overall } = reasons;
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
    };

    const compare = (comparison, options = {}) => {
      const { actualNode, expectNode } = comparison;

      const onNestedDiff = (node) => {
        if (!node) {
          return;
        }
        if (node.hidden) {
          return;
        }
        const ownerNode = getOwnerNode(node);
        if (!ownerNode) {
          return;
        }
        if (node.type === "internal_value") {
          if (ownerNode.isFunction) {
            return;
          }
          if (node.displayedIn === "label") {
            return;
          }
        }
        if (node.type === "prototype") {
          // seulement si on affiche le proto
          // et on affiche le proto que si c'est Object le subtype
          if (node.subtype !== "Object" && node.subtype !== "Array") {
            // return;
          }
        }
        if (ownerNode.comparison.actualNode) {
          ownerNode.comparison.actualNode.shouldExpand = true;
        }
        if (ownerNode.comparison.expectNode) {
          ownerNode.comparison.expectNode.shouldExpand = true;
        }
      };

      let nodePresent;
      let missingReason = "";
      let missingNodeName;
      const onAdded = (reason) => {
        missingReason = "added";
        comparison.reasons.self.added.add(reason);
        comparison.added = true;
        onNestedDiff(actualNode);
      };
      const onRemoved = (reason) => {
        missingReason = "removed";
        comparison.reasons.self.removed.add(reason);
        comparison.removed = true;
        onNestedDiff(expectNode);
      };
      const onMissing = (reason) => {
        if (nodePresent.name === "actual") {
          onAdded(reason);
        } else {
          onRemoved(reason);
        }
        addCause(comparison);
      };
      added_or_removed: {
        if (actualNode && expectNode) {
          if (
            actualNode.type === "internal_value" &&
            expectNode.type !== "internal_value" &&
            actualNode.parent.isSymbol
          ) {
            nodePresent = actualNode;
            comparison["internal_value"] = true;
            onAdded("internal_value");
            break added_or_removed;
          }
          if (
            actualNode.type !== "internal_value" &&
            expectNode.type === "internal_value" &&
            expectNode.parent.isSymbol
          ) {
            nodePresent = expectNode;
            comparison["internal_value"] = true;
            onRemoved("internal_value");
            break added_or_removed;
          }
          nodePresent = expectNode;
          break added_or_removed;
        }
        if (!actualNode) {
          missingReason = "modified";
          missingNodeName = "actualNode";
          nodePresent = expectNode;
        } else if (!expectNode) {
          missingReason = "modified";
          missingNodeName = "expectNode";
          nodePresent = actualNode;
        }

        if (nodePresent.isSetValue) {
          const nodeComparedWithSet =
            nodePresent.parent.parent.comparison[missingNodeName];
          if (
            nodeComparedWithSet &&
            nodeComparedWithSet.isSet &&
            !nodeComparedWithSet.value.has(nodePresent.value)
          ) {
            onMissing(nodePresent.value);
          }
          break added_or_removed;
        }
        if (nodePresent.isOneOfUrlSearchParamValue) {
          const nodeComparedWithSearchParam =
            nodePresent.parent.parent.parent.comparison[missingNodeName];
          if (
            nodeComparedWithSearchParam &&
            nodeComparedWithSearchParam.isUrlEntry &&
            nodeComparedWithSearchParam.entryKey === "search"
          ) {
            onMissing(`${nodePresent.entryKey}${nodePresent.index}`);
          }
        }
        const ownerNode = getOwnerNode(nodePresent);
        if (!ownerNode) {
          break added_or_removed;
        }
        const otherOwnerNode = ownerNode.comparison[missingNodeName];
        if (!otherOwnerNode) {
          if (ownerNode.isStringForUrlSearchParams) {
            onMissing("search");
            break added_or_removed;
          }
          onNestedDiff(nodePresent);
          break added_or_removed;
        }
        let canBeAddedOrRemoved;
        if (nodePresent.isInternalEntry) {
          canBeAddedOrRemoved = (node) => node.canHaveInternalEntries;
        } else if (nodePresent.isIndexedEntry) {
          canBeAddedOrRemoved = (node) => node.canHaveIndexedValues;
        } else if (nodePresent.isPropertyEntry) {
          canBeAddedOrRemoved = (node) => node.canHaveProps;
        } else if (nodePresent.type === "line") {
          canBeAddedOrRemoved = (node) => node.canHaveLines;
        } else if (nodePresent.type === "char") {
          canBeAddedOrRemoved = (node) => node.canHaveChars;
        } else if (nodePresent.type === "prototype") {
          canBeAddedOrRemoved = (node) => node.canHaveProps;
        } else if (nodePresent.type === "internal_value") {
          canBeAddedOrRemoved = (node) => node.childNodes.internalValue;
        }
        if (
          canBeAddedOrRemoved &&
          pickSelfOrInternalNode(otherOwnerNode, canBeAddedOrRemoved)
        ) {
          onMissing(nodePresent.entryKey);
        } else {
          onNestedDiff(nodePresent);
        }
        break added_or_removed;
      }
      comparison.nodePresent = nodePresent;
      comparison.missingReason = missingReason;

      const compareInside = (insideComparison, insideOptions = {}) => {
        const insideActualNode = insideComparison.actualNode;
        const insideExpectNode = insideComparison.expectNode;
        compare(insideComparison, { ...options, ...insideOptions });
        if (insideComparison.hasAnyDiff) {
          appendReasonGroup(
            comparison.reasons.inside,
            insideComparison.reasons.overall,
          );
          onNestedDiff(insideActualNode);
          onNestedDiff(insideExpectNode);
        } else {
          if (
            insideComparison.nodePresent.isDateEntryValue &&
            insideComparison.nodePresent.entryKey === "milliseconds"
          ) {
            if (insideActualNode) {
              const actualSecondsEntryNode =
                getOwnerNode(actualNode).childNodes.internalEntryMap.get(
                  "seconds",
                );
              actualSecondsEntryNode.childNodes.value.valueEndSeparator = "Z";
            }
            if (insideExpectNode) {
              const expectSecondsEntryNode =
                getOwnerNode(expectNode).childNodes.internalEntryMap.get(
                  "seconds",
                );
              expectSecondsEntryNode.childNodes.value.valueEndSeparator = "Z";
            }
          }
          if (insideActualNode && insideExpectNode) {
            const actualShouldHideBecauseNoDiff =
              insideActualNode.shouldHideWhenSame;
            const expectShouldHideBecauseNoDiff =
              insideExpectNode.shouldHideWhenSame;
            if (
              actualShouldHideBecauseNoDiff &&
              expectShouldHideBecauseNoDiff
            ) {
              insideActualNode.hidden = true;
              insideExpectNode.hidden = true;
              insideComparison.hidden = true;
            }
          }
        }
      };

      const actualNodeForKeyComparison = actualNode
        ? actualNode.childNodes.key
        : null;
      const expectNodeForKeyComparison = expectNode
        ? expectNode.childNodes.key
        : null;
      if (actualNodeForKeyComparison || expectNodeForKeyComparison) {
        const keyComparison = createComparison(
          actualNodeForKeyComparison,
          expectNodeForKeyComparison,
        );
        comparison.childComparisons.key = keyComparison;
        compareInside(keyComparison);
      }
      if (
        nodePresent.type === "entry" ||
        nodePresent.isSetValue ||
        nodePresent.isOneOfUrlSearchParamValue
      ) {
        const getChildByName = (node, childName) => {
          if (!node) {
            return null;
          }
          const isDirectValue =
            childName === "value" &&
            (node.isSetValue || node.isOneOfUrlSearchParamValue);
          if (isDirectValue && actualNode && expectNode) {
            const otherNode = node === actualNode ? expectNode : actualNode;
            if (otherNode.type === "entry") {
              return node;
            }
            return null;
          }
          return node.childNodes[childName];
        };
        const childComparisons = comparison.childComparisons;
        const actualUsePropertyAccessor = Boolean(
          getChildByName(actualNode, "get") ||
            getChildByName(actualNode, "set"),
        );
        const expectUsePropertyAccessor = Boolean(
          getChildByName(expectNode, "get") ||
            getChildByName(expectNode, "set"),
        );
        const childsToCompare = [
          "value",
          "get",
          "set",
          "enumerable",
          "writable",
          "configurable",
        ];
        for (const childName of childsToCompare) {
          const actualChildNode = getChildByName(actualNode, childName);
          const expectChildNode = getChildByName(expectNode, childName);
          if (!actualChildNode && !expectChildNode) {
            continue;
          }
          const childComparison = createComparison(
            actualChildNode,
            expectChildNode,
          );
          if (childName === "writable") {
            if (actualUsePropertyAccessor !== expectUsePropertyAccessor) {
              // when one uses property accessor and the other not
              // the diff on writable would be redundant to display
              childComparison.hidden = true;
            }
          }
          childComparisons[childName] = childComparison;
          compareInside(childComparison);
        }
        if (nodePresent.type === "entry") {
          settleReasons(comparison);
          return;
        }
      }

      const addSelfDiff = (reason) => {
        if (comparison.hidden) {
          return;
        }
        comparison.reasons.self.modified.add(reason);
        if (comparison.reasons.self.modified.size === 1) {
          addCause(comparison);
        }
      };

      let ignoreInternalValueDiff = false;
      let ignoreCharsDiff =
        actualNode &&
        !actualNode.canHaveChars &&
        expectNode &&
        !expectNode.canHaveChars;

      if (actualNode && expectNode) {
        if (
          actualNode.reference &&
          expectNode.reference &&
          actualNode.reference.path.toString() !==
            expectNode.reference.path.toString()
        ) {
          addSelfDiff("reference");
        } else if (actualNode.wellKnownId !== expectNode.wellKnownId) {
          addSelfDiff("well_known_id");
        } else if (actualNode.isPrimitive !== expectNode.isPrimitive) {
          actualNode.shouldExpand = true;
          expectNode.shouldExpand = true;
          addSelfDiff("primitive");
        } else if (
          actualNode.isPrimitive &&
          expectNode.isPrimitive &&
          (actualNode.value !== expectNode.value ||
            actualNode.isNegativeZero !== expectNode.isNegativeZero)
        ) {
          addSelfDiff("primitive_value");
        } else if (actualNode.isSourceCode !== expectNode.isSourceCode) {
          addSelfDiff("source_code");
        } else if (
          actualNode.isSourceCode &&
          expectNode.isSourceCode &&
          actualNode.value[sourceCodeSymbol] !==
            expectNode.value[sourceCodeSymbol]
        ) {
          addSelfDiff("source_code_value");
        } else if (
          actualNode.isStringForRegExp !== expectNode.isStringForRegExp ||
          actualNode.isRegExpLine !== expectNode.isRegExpLine ||
          actualNode.isRegExpChar !== expectNode.isRegExpChar
        ) {
          addSelfDiff("category");
        } else if (actualNode.subtype !== expectNode.subtype) {
          if (
            actualNode.isFunctionPrototype &&
            expectNode.isFunctionPrototype
          ) {
            // subtype diff is expected and will be rendered in the function diff
            // function A() {} already states that subtype differs from
            // function B() {}
          } else {
            addSelfDiff("subtype");
          }
        } else if (actualNode.isFunction && expectNode.isFunction) {
          if (
            actualNode.functionAnalysis.isAsync !==
            expectNode.functionAnalysis.isAsync
          ) {
            addSelfDiff("is_async");
          }
          if (
            actualNode.functionAnalysis.isGenerator !==
            expectNode.functionAnalysis.isGenerator
          ) {
            addSelfDiff("is_generator");
          }
          if (
            actualNode.functionAnalysis.type !==
            expectNode.functionAnalysis.type
          ) {
            addSelfDiff("function_fype");
          }
          if (
            actualNode.functionAnalysis.name !==
            expectNode.functionAnalysis.name
          ) {
            addSelfDiff("function_name");
          }
          if (actualNode.extendedClassName !== expectNode.extendedClassName) {
            addSelfDiff("extended_class_name");
          }
        }
        if (
          (actualNode.isClassStaticProperty &&
            !expectNode.isClassStaticProperty) ||
          (!actualNode.isClassStaticProperty &&
            expectNode.isClassStaticProperty)
        ) {
          addSelfDiff("class_static");
        }
        if (
          actualNode.type === "entry_key" &&
          ((actualNode.isInternalEntry && !expectNode.isInternalEntry) ||
            (actualNode.isIndexedEntry && !expectNode.isIndexedEntry) ||
            (actualNode.isPropertyEntry && !expectNode.isPropertyEntry))
        ) {
          addSelfDiff("entry_key_type");
        }

        props_frozen_or_sealed_or_non_extensible: {
          if (actualNode.propsFrozen !== expectNode.propsFrozen) {
            addSelfDiff("propsFrozen");
          } else if (actualNode.propsSealed !== expectNode.propsSealed) {
            addSelfDiff("propsSealed");
          } else if (
            actualNode.propsExtensionsPrevented !==
            expectNode.propsExtensionsPrevented
          ) {
            addSelfDiff("propsExtensionsPrevented");
          }
        }
        prototype: {
          const actualPrototypeNode = actualNode
            ? actualNode.childNodes.prototype
            : null;
          const expectPrototypeNode = expectNode
            ? expectNode.childNodes.prototype
            : null;
          if (!actualPrototypeNode && !expectPrototypeNode) {
            break prototype;
          }
          const prototypeComparison = createComparison(
            actualPrototypeNode,
            expectPrototypeNode,
          );
          let prototypeCanBeInfered;
          if (!actualPrototypeNode) {
            if (expectPrototypeNode.value === null) {
            } else {
              prototypeCanBeInfered = true;
              expectPrototypeNode.hidden = true;
            }
          } else if (!expectPrototypeNode) {
            if (actualPrototypeNode.value === null) {
            } else {
              prototypeCanBeInfered = true;
              actualPrototypeNode.hidden = true;
            }
          } else if (actualPrototypeNode && expectPrototypeNode) {
            if (actualPrototypeNode.value === null) {
              prototypeCanBeInfered = false;
            } else if (expectPrototypeNode.value === null) {
              prototypeCanBeInfered = false;
            } else if (
              // prototype can be infered by
              // - the subtype
              //    actual: User {}
              //    expect: Animal {}
              comparison.reasons.self.modified.has("subtype") ||
              // - the function type
              //    actual: () => {}
              //    expect: function () {}
              comparison.reasons.self.modified.has("function_type") ||
              // - the usage of async/generator
              //   actual: function () {}
              //   expect: async function () {}
              comparison.reasons.self.modified.has("is_async") ||
              comparison.reasons.self.modified.has("is_generator") ||
              // prototype property can be infered thanks to the usage of extends
              // (nan c'est le proto ça)
              // - the usage of extends keyword
              //   actual: class A extends Human {}
              //   expect: class B extends Robot {}
              comparison.reasons.self.modified.has("extended_class_name")
            ) {
              prototypeCanBeInfered = true;
              actualPrototypeNode.hidden = true;
              expectPrototypeNode.hidden = true;
            }
          }
          if (prototypeCanBeInfered) {
            prototypeComparison.hidden = true;
          }
          comparison.childComparisons.prototype = prototypeComparison;
          compareInside(prototypeComparison);
        }
      }

      const actualInternalValueNode = actualNode
        ? actualNode.childNodes.internalValue
        : null;
      const expectInternalValueNode = expectNode
        ? expectNode.childNodes.internalValue
        : null;
      internal_value: {
        if (ignoreInternalValueDiff) {
          break internal_value;
        }
        if (!actualInternalValueNode && !expectInternalValueNode) {
          break internal_value;
        }
        let internalValueComparison;
        const actualInternalOrSelfNode = actualInternalValueNode || actualNode;
        const expectInternalOrSelfNode = expectInternalValueNode || expectNode;
        internalValueComparison = createComparison(
          actualInternalOrSelfNode,
          expectInternalOrSelfNode,
        );
        comparison.childComparisons.internalValue = internalValueComparison;
        compareInside(internalValueComparison);
      }

      inside: {
        string: {
          lines: {
            if (
              actualNode &&
              !actualNode.canHaveLines &&
              expectNode &&
              !expectNode.canHaveLines
            ) {
              // prevent to compare twice when internal can have
              // but wrapper cannot
              break lines;
            }
            const actualNodeWhoCanHaveLines = pickSelfOrInternalNode(
              actualNode,
              (node) => node.canHaveLines,
            );
            const expectNodeWhoCanHaveLines = pickSelfOrInternalNode(
              expectNode,
              (node) => node.canHaveLines,
            );
            if (!actualNodeWhoCanHaveLines && !expectNodeWhoCanHaveLines) {
              break lines;
            }
            const actualLineNodes = actualNodeWhoCanHaveLines
              ? actualNodeWhoCanHaveLines.childNodes.lines
              : [];
            const expectLineNodes = expectNodeWhoCanHaveLines
              ? expectNodeWhoCanHaveLines.childNodes.lines
              : [];
            const lineComparisons = comparison.childComparisons.lines;

            let lineIndex = 0;
            for (const actualLineNode of actualLineNodes) {
              const expectLineNode = expectLineNodes[lineIndex];
              const lineComparison = createComparison(
                actualLineNode,
                expectLineNode,
              );
              lineComparisons[lineIndex] = lineComparison;
              compareInside(lineComparison);
              lineIndex++;
            }
            while (lineIndex < expectLineNodes.length) {
              const lineComparison = createComparison(
                null,
                expectLineNodes[lineIndex],
              );
              lineComparisons[lineIndex] = lineComparison;
              compareInside(lineComparison);
              lineIndex++;
            }
          }
          chars: {
            if (ignoreCharsDiff) {
              break chars;
            }
            const actualNodeWhoCanHaveChars = pickSelfOrInternalNode(
              actualNode,
              (node) => node.canHaveChars,
            );
            const expectNodeWhoCanHaveChars = pickSelfOrInternalNode(
              expectNode,
              (node) => node.canHaveChars,
            );
            if (!actualNodeWhoCanHaveChars && !expectNodeWhoCanHaveChars) {
              break chars;
            }
            const actualCharNodes = actualNodeWhoCanHaveChars
              ? actualNodeWhoCanHaveChars.childNodes.chars
              : [];
            const expectCharNodes = expectNodeWhoCanHaveChars
              ? expectNodeWhoCanHaveChars.childNodes.chars
              : [];
            const charComparisons = comparison.childComparisons.chars;

            const visitCharNode = (charNode) => {
              const charNodeIndex = charNode.index;
              const actualCharNode = actualCharNodes[charNodeIndex];
              const expectCharNode = expectCharNodes[charNodeIndex];
              const charComparison = createComparison(
                actualCharNode,
                expectCharNode,
              );
              charComparisons[charNodeIndex] = charComparison;
              compareInside(charComparison);
            };
            for (const actualCharNode of actualCharNodes) {
              visitCharNode(actualCharNode);
            }
            for (const expectCharNode of expectCharNodes) {
              if (!charComparisons[expectCharNode.index]) {
                visitCharNode(expectCharNode);
              }
            }
          }
        }

        const pickNodeMap = (canGetter, getter) => {
          if (
            actualNode &&
            !canGetter(actualNode) &&
            expectNode &&
            !canGetter(expectNode)
          ) {
            // prevent to compare twice when internal can but wrapper cannot
            return [new Map(), new Map()];
          }
          const actualWhoCan = pickSelfOrInternalNode(actualNode, canGetter);
          const expectWhoCan = pickSelfOrInternalNode(expectNode, canGetter);
          return [
            actualWhoCan ? getter(actualWhoCan) : new Map(),
            expectWhoCan ? getter(expectWhoCan) : new Map(),
          ];
        };

        const [actualInternalEntryNodeMap, expectInternalEntryNodeMap] =
          pickNodeMap(
            (node) => node.canHaveInternalEntries,
            (node) => node.childNodes.internalEntryMap,
          );
        const [actualIndexedEntryNodeMap, expectIndexedEntryNodeMap] =
          pickNodeMap(
            (node) => node.canHaveIndexedValues,
            (node) => node.childNodes.indexedEntryMap,
          );
        const [actualPropertyEntryNodeMap, expectPropertyEntryNodeMap] =
          pickNodeMap(
            (node) => node.canHaveProps,
            (node) => node.childNodes.propertyEntryMap,
          );
        const internalEntryComparisonMap =
          comparison.childComparisons.internalEntryMap;
        const entryComparisonMap = comparison.childComparisons.entryMap;

        internal_entries: {
          for (const [
            actualInternalEntryKey,
            actualInternalEntryNode,
          ] of actualInternalEntryNodeMap) {
            const expectEntryNodeForComparison = expectInternalEntryNodeMap.get(
              actualInternalEntryKey,
            );
            const internalEntryComparison = createComparison(
              actualInternalEntryNode,
              expectEntryNodeForComparison,
            );
            internalEntryComparisonMap.set(
              actualInternalEntryKey,
              internalEntryComparison,
            );
            compareInside(internalEntryComparison);
          }
          for (const [
            expectInternalEntryKey,
            expectInternalEntryNode,
          ] of expectInternalEntryNodeMap) {
            if (internalEntryComparisonMap.has(expectInternalEntryKey)) {
              continue;
            }
            const actualEntryNodeForComparison = actualInternalEntryNodeMap.get(
              expectInternalEntryKey,
            );
            const internalEntryComparison = createComparison(
              actualEntryNodeForComparison,
              expectInternalEntryNode,
            );
            internalEntryComparisonMap.set(
              expectInternalEntryKey,
              internalEntryComparison,
            );
            compareInside(internalEntryComparison);
          }
        }
        indexed_entries: {
          const parentComparison = comparison.parent;
          const isSetComparison =
            parentComparison &&
            parentComparison.actualNode &&
            parentComparison.actualNode.isSet &&
            parentComparison.expectNode &&
            parentComparison.expectNode.isSet;
          if (isSetComparison) {
            let index = 0;
            for (const [
              ,
              actualIndexedEntryNode,
            ] of actualIndexedEntryNodeMap) {
              const setEntryComparison = createComparison(
                actualIndexedEntryNode,
                null,
              );
              entryComparisonMap.set(index, setEntryComparison);
              compareInside(setEntryComparison);
              index++;
            }
            for (const [
              ,
              expectIndexedEntryNode,
            ] of expectIndexedEntryNodeMap) {
              const setEntryComparison = createComparison(
                null,
                expectIndexedEntryNode,
              );
              entryComparisonMap.set(index, setEntryComparison);
              compareInside(setEntryComparison);
              index++;
            }
            break indexed_entries;
          }

          let index = 0;
          for (const [, actualIndexedEntryNode] of actualIndexedEntryNodeMap) {
            let indexString = String(index);
            let expectNodeForComparison =
              expectIndexedEntryNodeMap.get(indexString);
            if (!expectNodeForComparison) {
              expectNodeForComparison =
                expectPropertyEntryNodeMap.get(index) ||
                expectPropertyEntryNodeMap.get(indexString);
            }
            const entryComparison = createComparison(
              actualIndexedEntryNode,
              expectNodeForComparison,
            );
            entryComparisonMap.set(indexString, entryComparison);
            compareInside(entryComparison);
            index++;
          }
          // here we know it's an extra index, like "b" in
          // actual: ["a"]
          // expect: ["a", "b"]
          let expectIndexedEntryNode;
          while (
            (expectIndexedEntryNode = expectIndexedEntryNodeMap.get(
              String(index),
            ))
          ) {
            let indexString = String(index);
            if (entryComparisonMap.has(indexString)) {
              continue;
            }
            let actualNodeForComparison =
              actualPropertyEntryNodeMap.get(index) ||
              actualPropertyEntryNodeMap.get(indexString);
            const entryComparison = createComparison(
              actualNodeForComparison,
              expectIndexedEntryNode,
            );
            entryComparisonMap.set(indexString, entryComparison);
            compareInside(entryComparison);
            index++;
          }
        }
        prop_entries: {
          for (const [
            actualProperty,
            actualPropertyEntryNode,
          ] of actualPropertyEntryNodeMap) {
            if (
              // can happen for
              // actual: {0: 'b'}
              // expect: ['b']
              entryComparisonMap.has(actualProperty)
            ) {
              continue;
            }
            let expectEntryNodeForComparison =
              expectPropertyEntryNodeMap.get(actualProperty);
            if (
              !expectEntryNodeForComparison &&
              expectNode &&
              !expectNode.canHaveProps
            ) {
              expectEntryNodeForComparison =
                expectInternalEntryNodeMap.get(actualProperty);
            }
            const entryComparison = createComparison(
              actualPropertyEntryNode,
              expectEntryNodeForComparison,
            );
            entryComparisonMap.set(actualProperty, entryComparison);
            compareInside(entryComparison);
          }
          for (const [
            expectProperty,
            expectPropertyEntryNode,
          ] of expectPropertyEntryNodeMap) {
            if (entryComparisonMap.has(expectProperty)) {
              continue;
            }
            let actualEntryNodeForComparison;
            if (actualNode && !actualNode.canHaveProps) {
              actualEntryNodeForComparison =
                expectInternalEntryNodeMap.get(expectProperty);
            }
            const entryComparison = createComparison(
              actualEntryNodeForComparison,
              expectPropertyEntryNode,
            );
            entryComparisonMap.set(expectProperty, entryComparison);
            compareInside(entryComparison);
          }
        }
      }

      settleReasons(comparison);
    };
    const createComparison = (actualNode, expectNode) => {
      let mainNode;
      let fromInternalValue = false;
      if (actualNode && actualNode.type === "internal_value") {
        mainNode = actualNode;
        fromInternalValue = true;
      } else if (expectNode && expectNode.type === "internal_value") {
        mainNode = expectNode;
        fromInternalValue = true;
      } else {
        mainNode = actualNode || expectNode;
      }

      const actualIsRegExpLastIndex =
        actualNode &&
        actualNode.entryKey === "lastIndex" &&
        actualNode.parent.isRegExp;
      const expectIsRegExpLastIndex =
        expectNode &&
        expectNode.entryKey === "lastIndex" &&
        expectNode.parent.isRegExp;
      if (actualIsRegExpLastIndex && !expectIsRegExpLastIndex) {
        actualNode.hidden = true;
      }
      if (!actualIsRegExpLastIndex && expectIsRegExpLastIndex) {
        expectNode.hidden = true;
      }
      let actualHidden;
      let expectHidden;
      if (actualNode) {
        actualHidden =
          actualNode.hidden ||
          (actualNode.reference ? actualNode.reference.hidden : false);
      }
      if (expectNode) {
        expectHidden =
          expectNode.hidden ||
          (expectNode.reference ? expectNode.reference.hidden : false);
      }
      let hidden;
      if (actualHidden && expectHidden) {
        hidden = true;
      } else if (actualHidden && !expectNode) {
        hidden = true;
      } else if (expectHidden && !actualNode) {
        hidden = true;
      }

      if (actualNode && expectNode) {
        if (actualNode.isMultiline && !expectNode.isMultiline) {
          expectNode.isMultiline = true;
          expectNode.useQuotes = false;
          if (!expectNode.isErrorMessageString) {
            expectNode.useLineNumbersOnTheLeft = true;
          }
        } else if (!actualNode.isMultiline && expectNode.isMultiline) {
          actualNode.isMultiline = true;
          actualNode.useQuotes = false;
          if (!actualNode.isErrorMessageString) {
            actualNode.useLineNumbersOnTheLeft = true;
          }
        }
        const actualQuote = actualNode.quote;
        const expectQuote = expectNode.quote;
        if (actualQuote === '"') {
          if (expectQuote && expectQuote !== '"') {
            actualNode.quote = expectQuote;
            actualNode.openDelimiter = actualNode.closeDelimiter = expectQuote;
          }
        } else if (actualQuote && actualQuote !== expectQuote) {
          // pick the one in actual
          expectNode.quote = actualQuote;
          expectNode.openDelimiter = expectNode.closeDelimiter = actualQuote;
        }

        if (actualNode.shouldExpand && !expectNode.shouldExpand) {
          expectNode.shouldExpand = true;
        } else if (!actualNode.shouldExpand && expectNode.shouldExpand) {
          actualNode.shouldExpand = true;
        }
      }

      // if (actualNode && actualNode.comparison) {
      //   throw new Error("nope");
      // } else if (expectNode && expectNode.comparison) {
      //   throw new Error("nope");
      // }

      const parent = mainNode.parent ? mainNode.parent.comparison : null;

      const comparison = {
        parent,
        actualNode,
        expectNode,
        type: mainNode.type,
        depth: mainNode.depth,
        index: mainNode.index,

        reasons: {
          overall: {
            any: new Set(),
            modified: new Set(),
            removed: new Set(),
            added: new Set(),
          },
          self: {
            any: new Set(),
            modified: new Set(),
            removed: new Set(),
            added: new Set(),
          },
          inside: {
            any: new Set(),
            modified: new Set(),
            removed: new Set(),
            added: new Set(),
          },
        },
        hidden,
        childComparisons: {
          prototype: null,
          internalValue: null,
          entryMap: new Map(),
          internalEntryMap: new Map(),
          key: null,
          value: null,
          enumerable: null,
          writable: null,
          configurable: null,
          set: null,
          get: null,
          lines: [],
          chars: [],
        },
      };

      if (fromInternalValue) {
        if (actualNode && actualNode.type === "internal_value") {
          actualNode.comparison = comparison;
        }
        if (expectNode && expectNode.type === "internal_value") {
          expectNode.comparison = comparison;
        }
      } else {
        if (actualNode) {
          actualNode.comparison = comparison;
        }
        if (expectNode) {
          expectNode.comparison = comparison;
        }
      }

      return comparison;
    };

    const rootComparison = createComparison(actualNode, expectNode);
    compare(rootComparison);
    for (const causeComparison of causeSet) {
      if (causeComparison.type === "entry_value") {
        let current = causeComparison.parent.parent;
        while (current) {
          if (current.reasons.self.any.size) {
            removeCause(causeComparison);
            break;
          }
          current = current.parent;
        }
      }
    }
    if (causeSet.size === 0) {
      return;
    }

    let startComparison = rootComparison;
    start_on_max_depth: {
      if (rootComparison.selfHasModification) {
        break start_on_max_depth;
      }
      const [firstComparisonCausingDiff] = causeSet;
      if (firstComparisonCausingDiff.depth < maxDepth) {
        break start_on_max_depth;
      }
      const comparisonsFromRootToTarget = [firstComparisonCausingDiff];
      let currentComparison = firstComparisonCausingDiff;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const parentComparison = currentComparison.parent;
        if (parentComparison) {
          comparisonsFromRootToTarget.unshift(parentComparison);
          currentComparison = parentComparison;
        } else {
          break;
        }
      }
      let startComparisonDepth = firstComparisonCausingDiff.depth - maxDepth;
      for (const comparison of comparisonsFromRootToTarget) {
        if (
          (comparison.type === "entry_key" ||
            comparison.type === "entry_value") &&
          comparison.depth > startComparisonDepth
        ) {
          startComparison = comparison;
          break;
        }
      }
    }

    const actualValueMeta = {
      resultType: "actualNode",
      name: "actual",
      shortname: "actual",
      color: unexpectColor,
    };
    const expectValueMeta = {
      resultType: "expectNode",
      name: "expect",
      shortname: "expect",
      color: expectColor,
    };
    const firstValueMeta = actualIsFirst ? actualValueMeta : expectValueMeta;
    const secondValueMeta = actualIsFirst ? expectValueMeta : actualValueMeta;

    // si le start node a une diff alors il faudrait lui mettre le signe + devant actual
    const displayedIdMap = new Map();
    let idCount = 0;
    const getDisplayedId = (nodeId) => {
      const existingId = displayedIdMap.get(nodeId);
      if (existingId) {
        return existingId;
      }
      const idDisplayed = idCount + 1;
      idCount++;
      displayedIdMap.set(nodeId, idDisplayed);
      return idDisplayed;
    };

    const contextBase = {
      onComparisonDisplayed,
      getDisplayedId,
      startComparison,
      signs,
      initialDepth: -startComparison.depth,
      maxColumns,
      maxDepth,
      maxDiffPerObject,
      maxValueBeforeDiff,
      maxValueAfterDiff,
      maxValueInsideDiff,
      maxDepthInsideDiff,
      maxLineBeforeDiff,
      maxLineAfterDiff,
    };

    let firstPrefix = "";
    let firstValueDiff;
    actual_diff: {
      firstPrefix += ANSI.color(firstValueMeta.shortname, sameColor);
      firstPrefix += ANSI.color(":", sameColor);
      firstPrefix += " ";
      firstValueDiff = writeDiff(startComparison, {
        ...contextBase,
        resultType: firstValueMeta.resultType,
        resultColor: firstValueMeta.color,
        resultColorWhenSolo: addedColor,
        otherResultType: secondValueMeta.resultType,
        textIndent: stringWidth(firstPrefix),
      });
    }
    let secondPrefix = "";
    let secondValueDiff;
    expect_diff: {
      secondPrefix += ANSI.color(secondValueMeta.shortname, sameColor);
      secondPrefix += ANSI.color(":", sameColor);
      secondPrefix += " ";
      secondValueDiff = writeDiff(startComparison, {
        ...contextBase,
        resultType: secondValueMeta.resultType,
        resultColor: secondValueMeta.color,
        resultColorWhenSolo: removedColor,
        otherResultType: firstValueMeta.resultType,
        textIndent: stringWidth(secondPrefix),
      });
    }

    let diffMessage = "";
    diffMessage += firstPrefix;
    diffMessage += firstValueDiff;
    diffMessage += "\n";
    diffMessage += secondPrefix;
    diffMessage += secondValueDiff;

    let message;
    if (rootComparison.selfHasModification) {
      message = `${ANSI.color(firstValueMeta.name, firstValueMeta.color)} and ${ANSI.color(secondValueMeta.name, secondValueMeta.color)} are different`;
    } else {
      message = `${ANSI.color(firstValueMeta.name, firstValueMeta.color)} and ${ANSI.color(secondValueMeta.name, secondValueMeta.color)} have ${causeCounters.total} ${causeCounters.total === 1 ? "difference" : "differences"}`;
    }
    message += ":";
    message += "\n\n";
    const infos = [];
    const diffNotDisplayed = causeCounters.total - causeCounters.displayed;
    if (diffNotDisplayed) {
      if (diffNotDisplayed === 1) {
        infos.push(`to improve readability 1 diff is completely hidden`);
      } else {
        infos.push(
          `to improve readability ${diffNotDisplayed} diffs are completely hidden`,
        );
      }
    }
    if (startComparison !== rootComparison) {
      infos.push(
        `diff starts at ${ANSI.color(startComparison.path, ANSI.YELLOW)}`,
      );
    }
    if (infos.length) {
      for (const info of infos) {
        message += `${UNICODE.INFO} ${info}`;
        message += "\n";
      }
      message += "\n";
    }
    message += `${diffMessage}`;

    const error = new Error(message);
    error.name = "AssertionError";
    if (Error.captureStackTrace) {
      Error.captureStackTrace(error, assert);
    }
    throw error;
  };

  assert.format = format;
  assert.isAssertionError = isAssertionError;
  assert.createAssertionError = createAssertionError;

  return assert;
};

const shouldIgnorePrototype = (node) => {
  if (node.subtype === "Object") {
    return false;
  }
  return false;
  // if (node.isSet) {
  //   return prototypeValue === Set.prototype;
  // }
  // if (node.isMap) {
  //   return prototypeValue === Map.prototype;
  // }
  // if (node.isArray) {
  //   return prototypeValue === Array.prototype;
  // }
  // if (node.isUrl) {
  //   return prototypeValue === URL.prototype;
  // }
  // if (prototypeValue === URLSearchParams.prototype) {
  //   return true;
  // }
};
const shouldIgnorePropertyEntry = (
  node,
  propertyNameOrSymbol,
  { propertyDescriptor },
) => {
  if (propertyNameOrSymbol === "prototype") {
    if (!node.isFunction) {
      return false;
    }
    // ignore prototype if it's the default prototype
    // created by the runtime
    if (!Object.hasOwn(propertyDescriptor, "value")) {
      return false;
    }
    const prototypeValue = propertyDescriptor.value;
    if (node.functionAnalysis.type === "arrow") {
      return prototypeValue === undefined;
    }
    if (node.functionAnalysis.isAsync && !node.functionAnalysis.isGenerator) {
      return prototypeValue === undefined;
    }
    const prototypeValueIsComposite = isComposite(prototypeValue);
    if (!prototypeValueIsComposite) {
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
  if (propertyNameOrSymbol === "constructor") {
    return (
      node.parent.entryKey === "prototype" &&
      node.parent.parent.isFunction &&
      Object.hasOwn(propertyDescriptor, "value") &&
      propertyDescriptor.value === node.parent.parent.value
    );
  }
  if (propertyNameOrSymbol === "length") {
    return node.canHaveIndexedValues || node.isFunction;
  }
  if (propertyNameOrSymbol === "name") {
    return node.isFunction;
  }
  if (propertyNameOrSymbol === "stack") {
    return node.isError;
  }
  if (propertyNameOrSymbol === "valueOf") {
    return (
      node.childNodes.internalValue &&
      node.childNodes.internalValue.entryKey === "valueOf()"
    );
  }
  if (propertyNameOrSymbol === "toString") {
    return (
      node.childNodes.internalValue &&
      node.childNodes.internalValue.entryKey === "toString()"
    );
  }
  if (propertyNameOrSymbol === Symbol.toPrimitive) {
    return (
      node.childNodes.internalValue &&
      node.childNodes.internalValue.entryKey === "Symbol.toPrimitive()"
    );
  }
  if (propertyNameOrSymbol === Symbol.toStringTag) {
    if (!Object.hasOwn(propertyDescriptor, "value")) {
      return false;
    }
    // toStringTag is already reflected on subtype
    return true;
  }
  if (typeof propertyNameOrSymbol === "symbol") {
    if (
      node.subtype === "Promise" &&
      !Symbol.keyFor(propertyNameOrSymbol) &&
      symbolToDescription(propertyNameOrSymbol) === "async_id_symbol"
    ) {
      // nodejs runtime puts a custom Symbol on promise
      return true;
    }
  }
  return false;
};
const shouldIgnorePropertyDescriptor = (
  node,
  propertyName,
  propertyDescriptorName,
  propertyDescriptorValue,
) => {
  /* eslint-disable no-unneeded-ternary */
  if (propertyDescriptorName === "writable") {
    const defaultValue =
      propertyName === "prototype" && node.functionAnalysis.type === "class"
        ? false
        : true;
    return propertyDescriptorValue === defaultValue;
  }
  if (propertyDescriptorName === "configurable") {
    const defaultValue =
      propertyName === "prototype" && node.isFunction ? false : true;
    return propertyDescriptorValue === defaultValue;
  }
  if (propertyDescriptorName === "enumerable") {
    const defaultValue =
      (propertyName === "prototype" && node.isFunction) ||
      (propertyName === "message" && node.isError) ||
      node.isClassPrototype
        ? false
        : true;
    return propertyDescriptorValue === defaultValue;
  }
  /* eslint-enable no-unneeded-ternary */
  if (propertyDescriptorName === "get") {
    const defaultValue = undefined;
    return propertyDescriptorValue === defaultValue;
  }
  if (propertyDescriptorName === "set") {
    const defaultValue = undefined;
    return propertyDescriptorValue === defaultValue;
  }
  return false;
};

// const isDefaultDescriptor = (descriptorName, descriptorValue) => {
//   if (descriptorName === "enumerable" && descriptorValue === true) {
//     return true;
//   }
//   if (descriptorName === "writable" && descriptorValue === true) {
//     return true;
//   }
//   if (descriptorName === "configurable" && descriptorValue === true) {
//     return true;
//   }
//   if (descriptorName === "get" && descriptorValue === undefined) {
//     return true;
//   }
//   if (descriptorName === "set" && descriptorValue === undefined) {
//     return true;
//   }
//   return false;
// };

let createValueNode;
{
  let nodeId = 1;
  createValueNode = ({
    name,
    value,
    getReference,
    quoteOption,
    preserveLineBreaksOption,
  }) => {
    const _createValueNode = ({
      parent,
      path,
      type,
      value,

      entryKey,
      isInternalEntry,
      isIndexedEntry,
      index,
      isPropertyEntry,
      descriptor,
      isPropertyDescriptor,
      isPropertyValue,
      isArrayEntry,
      isTypedArrayEntry,
      isStringEntry,
      isSetEntry,
      isMapEntry,
      isUrlEntry,
      isUrlSearchParamEntry,
      isUrlSearchParamEntryKey,
      isOneOfUrlSearchParamValue,
      isDateEntry,
      isIndexedValue,
      isSetValue,
      isMapEntryKey,
      isMapEntryValue,
      isUrlEntryKey,
      isUrlEntryValue,
      isDateEntryKey,
      isDateEntryValue,
      isPrototype,
      isClassStaticProperty,
      isClassPrototype,
      isClassSourceCode,
      isSpecialProperty,

      valueSeparator,
      valueStartSeparator,
      valueEndSeparator,
      displayedIn,
      shouldHideWhenSame = parent && parent.shouldHideWhenSame === "deep"
        ? "deep"
        : false,
      hidden = parent ? parent.hidden : false,
    }) => {
      const node = {
        name,
        id: nodeId++,
        path,
      };

      info: {
        let composite = false;
        let primitive = false;
        let parts = [];
        let wellKnownPath;
        let subtype;
        let subtypeDisplayed;
        let subtypeDisplayedWhenCollapsed;
        let isFunction = false;
        let functionAnalysis = {};
        let extendedClassName = "";
        let isFunctionPrototype = false;
        let isArray = false;
        let isTypedArray = false;
        let isSet = false;
        let isString = false;
        let isObjectForString = false;
        let isNumber = false;
        let isObjectForNumber = false;
        let isBigInt = false;
        let isInteger = false;
        let isFloat = false;
        let isUrl = false;
        let isStringForUrl = false;
        let isStringForUrlSearchParams = false;
        let isDate = false;
        let isStringForDate = false;
        let isRegExp = false;
        let isStringForRegExp = false;
        let isRegExpLine = false;
        let isRegExpChar = false;
        let isError = false;
        let isErrorMessageString = false;
        let isMap = false;
        let isSymbol = false;
        let isSourceCode = false;
        let isBuffer = false;
        let symbolKey = "";
        let symbolDescription = "";
        let reference = null;
        let constructorCall = false;
        let constructorCallUseNew = false;
        let constructorCallOpenDelimiter = "(";
        let constructorCallCloseDelimiter = ")";
        let openDelimiter = "";
        let closeDelimiter = "";
        let quote = "";

        let isNumberForByte = false;
        let isNegativeZero = false;
        let isNaN = false;

        let canHaveInternalEntries = false;
        let canHaveIndexedValues = false;
        let canHaveProps = false;
        let propsFrozen = false;
        let propsSealed = false;
        let propsExtensionsPrevented = false;
        let canHaveLines = false;
        let preserveLineBreaks;
        let lines = [];
        let isMultiline = false;
        let useLineNumbersOnTheLeft = false;
        let useQuotes = false;
        let canHaveChars = false;
        let chars = [];

        if (value === ARRAY_EMPTY_VALUE) {
          wellKnownPath = createValuePath([
            { type: "identifier", value: "empty" },
          ]);
          parts = wellKnownPath.parts;
          subtype = "empty";
        } else if (type === "entry") {
        }
        // else if (value === DOES_NOT_EXISTS) {
        //   composite = false;
        //   isArray = false;
        //   wellKnownId = "not_found";
        //   subtype = "not_found";
        // }
        else if (
          value &&
          typeof value === "object" &&
          sourceCodeSymbol in value
        ) {
          isSourceCode = true;
          parts = [{ type: "source_code", value }];
        } else {
          composite = isComposite(value);
          primitive = !composite;
          wellKnownPath = getWellKnownValuePath(value);
          if (composite) {
            parts = wellKnownPath
              ? wellKnownPath.parts
              : [{ type: "value", value }];
            canHaveProps = true;
            if (Object.isFrozen(value)) {
              propsFrozen = true;
            } else if (Object.isSealed(value)) {
              propsSealed = true;
            } else if (!Object.isExtensible(value)) {
              propsExtensionsPrevented = true;
            }
            if (typeof value === "function") {
              isFunction = true;
              constructorCallOpenDelimiter = "{";
              constructorCallCloseDelimiter = "}";
              functionAnalysis = analyseFunction(value);
              if (functionAnalysis.type === "arrow") {
                if (functionAnalysis.isAsync) {
                  subtype = functionAnalysis.isGenerator
                    ? "AsyncArrowFunction"
                    : "ArrowFunction";
                }
                subtype = functionAnalysis.isGenerator
                  ? "GeneratorArrowFunction"
                  : "ArrowFunction";
              } else if (functionAnalysis.isAsync) {
                subtype = functionAnalysis.isGenerator
                  ? "AsyncGeneratorFunction"
                  : "AsyncFunction";
              }
              subtype = functionAnalysis.isGenerator
                ? "GeneratorFunction"
                : "Function";
              if (functionAnalysis.type === "class") {
                const prototype = Object.getPrototypeOf(value);
                if (prototype && prototype !== Function.prototype) {
                  extendedClassName = prototype.name;
                }
              }
            } else if (
              type === "entry_value" &&
              entryKey === "prototype" &&
              parent.parent.isFunction
            ) {
              isFunctionPrototype = true;
              subtype = parent.parent.value.name;
            } else {
              subtype = getSubtype(value);
              if (typeof Buffer === "function" && Buffer.isBuffer(value)) {
                isBuffer = true;
                canHaveIndexedValues = true;
              }
            }
            reference =
              wellKnownPath || isPrototype ? null : getReference(value, node);
            if (!isPrototype) {
              visitPrototypes(value, (proto) => {
                const parentConstructor = proto.constructor;
                if (!parentConstructor) {
                  return;
                }
                // try {
                //   const isInstance = value instanceof parentConstructor;
                //   if (!isInstance) {
                //     return;
                //   }
                // } catch (e) {
                //   return;
                // }
                if (parentConstructor.name === "Array") {
                  isArray = true;
                  canHaveIndexedValues = true;
                } else if (
                  // "Int8Array",
                  // "Uint8Array",
                  // "Uint8ClampedArray",
                  // "Int16Array",
                  // "Uint16Array",
                  // "Int32Array",
                  // "Uint32Array",
                  // "Float32Array",
                  // "Float64Array",
                  // "BigInt64Array",
                  // "BigUint64Array",
                  parentConstructor.name === "TypedArray"
                ) {
                  isTypedArray = true;
                  canHaveIndexedValues = true;
                } else if (parentConstructor.name === "Set") {
                  isSet = true;
                } else if (parentConstructor.name === "String") {
                  isObjectForString = true;
                  canHaveIndexedValues = true;
                } else if (parentConstructor.name === "Number") {
                  isObjectForNumber = true;
                } else if (parentConstructor.name === "URL") {
                  isUrl = true;
                } else if (parentConstructor.name === "Date") {
                  isDate = true;
                } else if (parentConstructor.name === "RegExp") {
                  isRegExp = true;
                  constructorCallOpenDelimiter = "";
                  constructorCallCloseDelimiter = "";
                } else if (parentConstructor.name === "Error") {
                  isError = true;
                } else if (parentConstructor.name === "Map") {
                  isMap = true;
                  canHaveInternalEntries = true;
                }
              });
            }

            if (
              subtype === "String" ||
              subtype === "Boolean" ||
              subtype === "Number"
            ) {
              constructorCallUseNew = true;
            }

            if (isMapEntryKey) {
            } else if (isError) {
              subtypeDisplayed = subtypeDisplayedWhenCollapsed = [
                { type: "identifier", value: value.constructor.name },
              ];
            } else if (
              subtype === "Object" ||
              subtype === "Array" ||
              subtype === "RegExp"
            ) {
              // prefer
              // - {} over Object {}
              // - [] over Array []
              // - /a/ over Regexp(/a/)
              subtypeDisplayed = [];
              subtypeDisplayedWhenCollapsed = [
                { type: "value", value: subtype },
              ];
            } else if (isFunctionPrototype) {
              // do not set subtypeDisplayed when function is displayed
              // ```
              // function Foo() {} {
              //   prototype: { name: "foo" }
              // }
              // ```
              // is better than
              // ```
              // function Foo() {} {
              //   prototype: Foo { name: "foo" }
              // }
              // ```
            } else {
              subtypeDisplayed = subtypeDisplayedWhenCollapsed = [
                { type: "value", value: subtype },
              ];
            }

            if (canHaveIndexedValues) {
              openDelimiter = "[";
              closeDelimiter = "]";
            } else {
              openDelimiter = "{";
              closeDelimiter = "}";
            }
          } else if (value === null) {
            parts = [{ type: "value", value }];
            subtype = "null";
          } else {
            subtype = typeof value;
            if (subtype === "string") {
              isString = true;
              canHaveIndexedValues = true;
              if (type === "line") {
                if (parent.isStringForRegExp) {
                  isRegExpLine = true;
                }
                parts = [
                  { type: isRegExpLine ? "regexp_source_line" : "line", value },
                ];
                canHaveChars = true;
                chars = splitChars(value);
                openDelimiter = isRegExpLine ? "" : `${index + 1} | `;
                preserveLineBreaks = parent.preserveLineBreaks;
              } else if (type === "char") {
                if (parent.isRegExpLine) {
                  isRegExpChar = true;
                }
                parts = [
                  { type: isRegExpChar ? "regexp_source_char" : "char", value },
                ];
                preserveLineBreaks = parent.preserveLineBreaks;
              } else if (isDateEntry) {
                parts = [{ type: "date_part", value }];
              } else {
                isStringForRegExp = parent && parent.isRegExp;
                parts = [
                  {
                    type: isStringForRegExp ? "regexp_source" : "string",
                    value,
                  },
                ];
                if (isUrlEntry || isDateEntry || isStringForRegExp) {
                  preserveLineBreaks = true;
                } else {
                  preserveLineBreaks = preserveLineBreaksOption;
                }
                canHaveLines = true;
                lines = value.split(/\r?\n/);
                isMultiline = lines.length > 1;
                isErrorMessageString =
                  entryKey === "message" && parent.parent.isError;
                if (
                  isMultiline &&
                  !isErrorMessageString &&
                  !isStringForRegExp
                ) {
                  useLineNumbersOnTheLeft = true;
                }
                if (isErrorMessageString) {
                  // no quote around error message (it is displayed in the "label diff")
                } else if (isStringForRegExp) {
                  // no quote around string source
                } else if (isOneOfUrlSearchParamValue) {
                  // no quote around url search param key/value
                } else if (type === "entry_key") {
                  if (
                    (isSpecialProperty ||
                      isValidPropertyIdentifier(entryKey)) &&
                    !isMapEntryKey
                  ) {
                    // this property does not require quotes
                  } else {
                    useQuotes = true;
                    quote = DOUBLE_QUOTE;
                    openDelimiter = quote;
                    closeDelimiter = quote;
                  }
                } else if (isMultiline) {
                  // no quote around multiline
                } else if (isUrlEntry) {
                  // no quote around url property
                  if (entryKey === "search") {
                    isStringForUrlSearchParams = true;
                    canHaveInternalEntries = true;
                  }
                } else if (isDateEntry) {
                  // no quote around date property
                } else {
                  useQuotes = true;
                  quote =
                    quoteOption === "auto"
                      ? pickBestQuote(value, { canUseTemplateString: true })
                      : quoteOption;
                  openDelimiter = quote;
                  closeDelimiter = quote;
                  if (canParseUrl(value)) {
                    isStringForUrl = true;
                    canHaveInternalEntries = true;
                  } else if (canParseDate(value)) {
                    isStringForDate = true;
                    canHaveInternalEntries = true;
                  }
                }
              }
            } else if (subtype === "symbol") {
              isSymbol = true;
              if (wellKnownPath) {
                parts = wellKnownPath.parts;
              } else {
                parts = [{ type: "value", value }];
                symbolKey = Symbol.keyFor(value);
                if (symbolKey) {
                  subtypeDisplayed = subtypeDisplayedWhenCollapsed = [
                    { type: "identifier", value: "Symbol" },
                    { type: "property_dot", value: "." },
                    { type: "property_identifier", value: "for" },
                  ];
                } else {
                  subtypeDisplayed = subtypeDisplayedWhenCollapsed = [
                    { type: "identifier", value: "Symbol" },
                  ];
                  symbolDescription = symbolToDescription(value);
                }
              }
            } else if (subtype === "number") {
              isNumber = true;
              if (wellKnownPath) {
                parts = wellKnownPath.parts;
              } else if (getIsNan(value)) {
                isNaN = true;
                parts.push({ type: "NaN", value: "NaN" });
              } else if (value === Infinity) {
                parts.push(
                  {
                    type: "number_sign",
                    value: "+",
                    displayOnlyIfModified: true,
                  },
                  { type: "integer", value: "Infinity" },
                );
              } else if (value === -Infinity) {
                parts.push(
                  { type: "number_sign", value: "-" },
                  { type: "integer", value: "Infinity" },
                );
              } else if (getIsNegativeZero(value)) {
                isNegativeZero = true;
                parts.push(
                  { type: "number_sign", value: "-" },
                  { type: "number", value: "0" },
                );
              } else {
                if (Math.sign(value) === -1) {
                  parts.push({
                    type: "number_sign",
                    value: "-",
                  });
                } else {
                  parts.push({
                    type: "number_sign",
                    value: "+",
                    displayOnlyIfModified: true,
                  });
                }
                if (value % 1 === 0) {
                  isInteger = true;
                  const { integer } = tokenizeInteger(Math.abs(value));
                  parts.push({
                    type: "integer",
                    value:
                      isUrlEntry || isDateEntry
                        ? integer
                        : groupDigits(integer),
                  });
                } else {
                  isFloat = true;
                  const { integer, decimalSeparator, decimal } = tokenizeFloat(
                    Math.abs(value),
                  );
                  parts.push(
                    { type: "integer", value: groupDigits(integer) },
                    { type: "decimal_separator", value: decimalSeparator },
                    { type: "decimal", value: groupDigits(decimal) },
                  );
                }
              }
              if (isIndexedEntry && parent.parent.isTypedArray) {
                isNumberForByte = true;
              }
            } else if (subtype === "bigint") {
              parts = [{ type: "bigint", value: `${value}n` }];
              isBigInt = true;
            } else {
              parts = [{ type: "value", value }];
            }
          }
        }

        if (type === "internal_value" && parent.isSet) {
          constructorCallOpenDelimiter = "";
          constructorCallCloseDelimiter = "";
          // prefer Set(2)
          // over Set(Array(2))
          subtypeDisplayed = subtypeDisplayedWhenCollapsed = [];
        }

        let depth;
        if (parent) {
          if (type === "entry") {
            depth = parent.depth;
          } else if (type === "internal_value") {
            if (displayedIn === "properties") {
              depth = parent.depth + 1;
            } else {
              depth = parent.depth;
            }
          } else if (isUrlEntry || isDateEntry) {
            depth = parent.depth;
          } else if (isClassPrototype) {
            depth = parent.depth;
          } else {
            depth = parent.depth + 1;
          }
        } else {
          depth = 0;
        }
        Object.assign(node, {
          parent,
          depth,
          type,
          value,
          valueOf: () => {
            throw new Error(`use ${name}.value`);
          },
          parts,

          entryKey,
          isInternalEntry,
          isIndexedEntry,
          index,
          isPropertyEntry,
          isPropertyDescriptor,
          descriptor,
          isPropertyValue,
          isArrayEntry,
          isTypedArrayEntry,
          isStringEntry,
          isSetEntry,
          isMapEntry,
          isUrlEntry,
          isDateEntryKey,
          isDateEntryValue,
          isUrlSearchParamEntry,
          isUrlSearchParamEntryKey,
          isOneOfUrlSearchParamValue,
          isDateEntry,
          isIndexedValue,
          isSetValue,
          isMapEntryKey,
          isMapEntryValue,
          isUrlEntryKey,
          isUrlEntryValue,
          isPrototype,
          isClassStaticProperty,
          isClassPrototype,
          isClassSourceCode,
          isSpecialProperty,

          subtype,
          subtypeDisplayed,
          subtypeDisplayedWhenCollapsed,
          isComposite: composite,
          isPrimitive: primitive,
          isSourceCode,
          isBuffer,
          isString,
          isNumber,
          isBigInt,
          isNumberForByte,
          isNaN,
          isNegativeZero,
          isInteger,
          isFloat,
          isStringForUrl,
          isStringForUrlSearchParams,
          isDate,
          isStringForDate,
          isRegExp,
          isStringForRegExp,
          isRegExpLine,
          isRegExpChar,
          isErrorMessageString,
          isMultiline,
          useLineNumbersOnTheLeft,
          useQuotes,
          canHaveLines,
          preserveLineBreaks,
          lines,
          canHaveChars,
          chars,
          isObjectForString,
          isObjectForNumber,
          isFunction,
          functionAnalysis,
          isFunctionPrototype,
          extendedClassName,
          isArray,
          isTypedArray,
          isSet,
          isUrl,
          isError,
          isMap,
          isSymbol,
          symbolKey,
          symbolDescription,
          canHaveInternalEntries,
          canHaveIndexedValues,
          canHaveProps,
          propsFrozen,
          propsSealed,
          propsExtensionsPrevented,
          wellKnownId: wellKnownPath ? wellKnownPath.toString() : "",
          valueSeparator,
          valueStartSeparator,
          valueEndSeparator,
          constructorCall,
          constructorCallUseNew,
          constructorCallOpenDelimiter,
          constructorCallCloseDelimiter,
          openDelimiter,
          closeDelimiter,
          quote,
          displayedIn,
          hidden,
          shouldHideWhenSame,
          reference,
          referenceFromOthersSet: new Set(),
        });
      }

      const childNodes = {
        prototype: null,
        internalValue: null,
        internalEntryMap: new Map(),
        indexedEntryMap: new Map(),
        propertyEntryMap: new Map(),
        key: null,
        value: null,
        get: null,
        set: null,
        enumerable: null,
        writable: null,
        configurable: null,
        lines: [],
        chars: [],
      };
      node.childNodes = childNodes;
      node.structureIsKnown = Boolean(node.wellKnownId || node.reference);
      if (node.structureIsKnown) {
        return node;
      }

      const createPropertyLikeNode = (property, params) => {
        const propertyLikeNode = _createValueNode({
          ...params,
          path: path.append(property),
          entryKey: property,
        });
        const keyNode = _createValueNode({
          parent: propertyLikeNode,
          path: propertyLikeNode.path,
          type: "entry_key",
          value: property,
          entryKey: property,
          isSpecialProperty: property.endsWith("()"),
          shouldHideWhenSame: false,
        });
        propertyLikeNode.childNodes.key = keyNode;
        return propertyLikeNode;
      };
      prototype: {
        if (!node.isComposite) {
          break prototype;
        }
        const prototypeValue = Object.getPrototypeOf(node.value);
        if (shouldIgnorePrototype(node, prototypeValue)) {
          break prototype;
        }
        const prototypeNode = createPropertyLikeNode("__proto__", {
          parent: node,
          type: "prototype",
          valueSeparator: ":",
          value: prototypeValue,
          valueEndSeparator: ",",
          shouldHideWhenSame: true,
          isPrototype: true,
        });
        childNodes.prototype = prototypeNode;
      }
      // internal value (.valueOf(), .href, .toString())
      internal_value: {
        if (node.isFunction) {
          let argsAndBodySource = node.functionAnalysis.argsAndBodySource;
          if (node.functionAnalysis.type === "class") {
            argsAndBodySource = argsAndBodySource.slice(1, -1).trim();
          }
          if (argsAndBodySource.length) {
            const functionBody = createSourceCode(
              node.functionAnalysis.argsAndBodySource,
            );
            const internalValueNode = createPropertyLikeNode("toString()", {
              parent: node,
              type: "internal_value",
              value: functionBody,
              displayedIn: "properties",
              isSourceCode: true,
              valueEndSeparator:
                node.functionAnalysis.type === "class" ? ";" : ",",
            });
            childNodes.internalValue = internalValueNode;
          }
        } else if (node.isSet) {
          const setValues = [];
          for (const setValue of node.value) {
            setValues.push(setValue);
          }
          const setInternalValueNode = createPropertyLikeNode(
            "Symbol.iterator()",
            {
              parent: node,
              type: "internal_value",
              value: setValues,
              displayedIn: "label",
            },
          );
          node.constructorCall = true;
          childNodes.internalValue = setInternalValueNode;
        } else if (node.isUrl) {
          const urlString = node.value.href;
          const urlStringNode = createPropertyLikeNode("toString()", {
            parent: node,
            type: "internal_value",
            value: urlString,
            displayedIn: "label",
          });
          node.constructorCall = true;
          childNodes.internalValue = urlStringNode;
        } else if (node.isDate) {
          const dateString = node.value.toString();
          const urlStringNode = createPropertyLikeNode("toString()", {
            parent: node,
            type: "internal_value",
            value: dateString,
            displayedIn: "label",
          });
          node.constructorCall = true;
          childNodes.internalValue = urlStringNode;
        } else if (node.isRegExp) {
          let regexpSource = node.value.source;
          if (regexpSource === "(?:)") {
            regexpSource = "";
          }
          regexpSource = `/${regexpSource}/${node.value.flags}`;
          const regexSourceNode = createPropertyLikeNode("source", {
            parent: node,
            type: "internal_value",
            value: regexpSource,
            displayedIn: "label",
          });
          node.constructorCall = true;
          childNodes.internalValue = regexSourceNode;
        } else if (node.isSymbol) {
          const { symbolDescription, symbolKey } = node;
          if (symbolDescription) {
            const symbolDescriptionNode = createPropertyLikeNode("toString()", {
              parent: node,
              type: "internal_value",
              value: symbolDescription,
              displayedIn: "label",
            });
            node.constructorCall = true;
            childNodes.internalValue = symbolDescriptionNode;
          } else if (symbolKey) {
            const symbolKeyNode = createPropertyLikeNode("keyFor()", {
              parent: node,
              type: "internal_value",
              value: symbolKey,
              displayedIn: "label",
            });
            node.constructorCall = true;
            childNodes.internalValue = symbolKeyNode;
          } else {
            node.constructorCall = true;
          }
        }
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/toPrimitive
        else if (
          node.isComposite &&
          Symbol.toPrimitive in node.value &&
          typeof node.value[Symbol.toPrimitive] === "function"
        ) {
          const toPrimitiveReturnValue =
            node.value[Symbol.toPrimitive]("string");
          const internalValueNode = createPropertyLikeNode(
            "Symbol.toPrimitive()",
            {
              parent: node,
              type: "internal_value",
              value: toPrimitiveReturnValue,
              displayedIn: "properties",
              valueSeparator: ":",
            },
          );
          // node.constructorCall = true;
          childNodes.internalValue = internalValueNode;
        } else if (
          node.isComposite &&
          "valueOf" in node.value &&
          typeof node.value.valueOf === "function" &&
          node.value.valueOf !== Object.prototype.valueOf
        ) {
          const valueOfReturnValue = node.value.valueOf();
          const displayedIn = // we display in constructor when a subtype is displayed
            // otherwise it's displayed as a prop
            node.subtype === "Object" || node.subtype === "Array"
              ? "properties"
              : "label";
          const internalValueNode = createPropertyLikeNode("valueOf()", {
            parent: node,
            type: "internal_value",
            value: valueOfReturnValue,
            displayedIn,
            valueSeparator: ":",
            valueEndSeparator: displayedIn === "label" ? "" : ",",
          });
          node.constructorCall = internalValueNode.displayedIn === "label";
          childNodes.internalValue = internalValueNode;
        }
      }

      // key/value pairs
      // where key can be integers, string or symbols
      // aka "properties"
      props: {
        const createFacadePropertyDescriptor = (value) => {
          return {
            enumerable: true,
            /* eslint-disable no-unneeded-ternary */
            configurable: node.propsFrozen || node.propsSealed ? false : true,
            writable: node.propsFrozen ? false : true,
            /* eslint-enable no-unneeded-ternary */
            value,
          };
        };

        const associatedValueMetaMap = new Map();
        // string chars
        if (node.isString || node.isObjectForString) {
          let index = 0;
          while (index < node.value.length) {
            associatedValueMetaMap.set(String(index), {
              isIndexedEntry: true,
              isStringEntry: true,
              propertyDescriptor: Object.getOwnPropertyDescriptor(
                node.value,
                index,
              ),
            });
            index++;
          }
        }
        // typed array values
        else if (node.isTypedArray) {
          let index = 0;
          while (index < node.value.length) {
            associatedValueMetaMap.set(String(index), {
              isIndexedEntry: true,
              isTypedArrayEntry: true,
              index,
              propertyDescriptor: Object.getOwnPropertyDescriptor(
                node.value,
                index,
              ),
              valueEndSeparator: ",",
            });
            index++;
          }
        }
        // array values
        else if (node.isArray) {
          let index = 0;
          while (index < node.value.length) {
            if (node.parent && node.parent.isSet) {
              associatedValueMetaMap.set(String(index), {
                isIndexedEntry: true,
                isSetEntry: true,
                value: node.value[index],
                valueEndSeparator: ",",
              });
            } else if (node.parent && node.parent.isUrlSearchParamEntry) {
              const isFirstSearchParam = node.index === 0;
              associatedValueMetaMap.set(String(index), {
                isIndexedEntry: true,
                isArrayEntry: true,
                isOneOfUrlSearchParamValue: true,
                index,
                value: node.value[index],
                valueStartSeparator:
                  isFirstSearchParam && index === 0 ? "?" : "&",
                valueSeparator: "=",
              });
            } else {
              associatedValueMetaMap.set(String(index), {
                isIndexedEntry: true,
                isArrayEntry: true,
                index,
                propertyDescriptor: Object.hasOwn(node.value, index)
                  ? Object.getOwnPropertyDescriptor(node.value, index)
                  : createFacadePropertyDescriptor(ARRAY_EMPTY_VALUE),
                valueEndSeparator: ",",
              });
            }
            index++;
          }
        }
        // object own symbols
        if (node.isComposite) {
          const propertySymbols = Object.getOwnPropertySymbols(node.value);
          for (const propertySymbol of propertySymbols) {
            const propertyDescriptor = Object.getOwnPropertyDescriptor(
              node.value,
              propertySymbol,
            );
            let isClassStaticProperty = false;
            let valueSeparator = "";
            let valueEndSeparator = "";
            if (node.functionAnalysis.type === "class") {
              isClassStaticProperty = true;
              valueSeparator = "=";
              valueEndSeparator = ";";
            } else {
              valueSeparator = ":";
              valueEndSeparator = ",";
            }

            associatedValueMetaMap.set(propertySymbol, {
              isPropertyEntry: true,
              propertyDescriptor,
              isClassStaticProperty,
              valueSeparator,
              valueEndSeparator,
            });
          }
        }
        // object own properties
        if (node.isComposite) {
          const propertyNames = Object.getOwnPropertyNames(node.value);
          for (const propertyName of propertyNames) {
            if (associatedValueMetaMap.has(propertyName)) {
              continue;
            }
            const propertyDescriptor = Object.getOwnPropertyDescriptor(
              node.value,
              propertyName,
            );
            let displayedIn;
            let isPrototype = false;
            let isClassPrototype = false;
            let isClassStaticProperty = false;
            let valueSeparator = "";
            let valueEndSeparator = "";

            if (node.isClassPrototype) {
              valueSeparator = "=";
              valueEndSeparator = "";
            } else if (node.functionAnalysis.type === "class") {
              isClassStaticProperty = true;
              valueSeparator = "=";
              valueEndSeparator = ";";
            } else {
              valueSeparator = ":";
              valueEndSeparator = ",";
            }
            if (propertyName === "name") {
              if (
                node.functionAnalysis.type === "classic" ||
                node.functionAnalysis.type === "class"
              ) {
                // function name or class name will be displayed in the "subtypeDiff"
                displayedIn = "label";
                valueSeparator = valueEndSeparator = "";
              }
            } else if (propertyName === "message") {
              if (node.isError) {
                displayedIn = "label";
                valueSeparator = valueEndSeparator = "";
              }
            } else if (propertyName === "prototype") {
              isPrototype = true;
              if (isClassStaticProperty) {
                isClassPrototype = true;
                valueSeparator = valueEndSeparator = "";
              }
            }

            associatedValueMetaMap.set(propertyName, {
              isPropertyEntry: true,
              propertyDescriptor,
              isPrototype,
              isClassStaticProperty,
              isClassPrototype,
              valueSeparator,
              valueEndSeparator,
              displayedIn,
            });
          }
        }

        // map entries
        if (node.isMap) {
          const subtypeCounterMap = new Map();
          for (const [mapEntryKey, mapEntryValue] of node.value) {
            let pathPart = "";
            if (isComposite(mapEntryKey)) {
              const keySubtype = getSubtype(mapEntryKey);
              if (subtypeCounterMap.has(keySubtype)) {
                const subtypeCount = subtypeCounterMap.get(keySubtype) + 1;
                subtypeCounterMap.set(keySubtype, subtypeCount);
                pathPart = `${keySubtype}#${subtypeCount}`;
              } else {
                subtypeCounterMap.set(keySubtype, 1);
                pathPart = `${keySubtype}#1`;
              }
            } else {
              pathPart = String(mapEntryKey);
            }
            associatedValueMetaMap.set(mapEntryKey, {
              isInternalEntry: true,
              isMapEntry: true,
              value: mapEntryValue,
              valueSeparator: "=>",
              valueEndSeparator: ",",
              pathPart,
            });
          }
        }
        // url special properties
        else if (node.isStringForUrl) {
          const urlParts = new URL(node.value);
          for (const urlInternalPropertyName of URL_INTERNAL_PROPERTY_NAMES) {
            const urlInternalPropertyValue = urlParts[urlInternalPropertyName];
            if (!urlInternalPropertyValue) {
              continue;
            }
            const meta = {
              isInternalEntry: true,
              isUrlEntry: true,
              value: normalizeUrlPart(
                urlInternalPropertyName,
                urlInternalPropertyValue,
              ),
              valueSeparator: "",
              valueEndSeparator: "",
            };
            if (urlInternalPropertyName === "protocol") {
              meta.valueEndSeparator = "//";
            } else if (urlInternalPropertyName === "username") {
              if (urlParts.password) {
                meta.valueEndSeparator = ":";
              } else {
                meta.valueEndSeparator = "@";
              }
            } else if (urlInternalPropertyName === "password") {
              meta.valueEndSeparator = "@";
            } else if (urlInternalPropertyName === "port") {
              meta.valueStartSeparator = ":";
            } else if (urlInternalPropertyName === "search") {
            } else if (urlInternalPropertyName === "hash") {
            }
            associatedValueMetaMap.set(urlInternalPropertyName, meta);
          }
        }
        // url "search"
        else if (node.isStringForUrlSearchParams) {
          // we don't use new URLSearchParams to preserve plus signs, see
          // see https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams#preserving_plus_signs
          const params = node.value.slice(1).split("&");
          let index = 0;
          for (const param of params) {
            let [key, value] = param.split("=");
            value = decodeURIComponent(value);
            const meta = {
              isInternalEntry: true,
              isUrlSearchParamEntry: true,
              value,
              valueStartSeparator: "?",
              valueSeparator: "=",
            };
            const existingAssociation = associatedValueMetaMap.get(key);
            if (existingAssociation) {
              meta.index = existingAssociation.index;
              meta.value = [...existingAssociation.value, value];
            } else {
              meta.index = index;
              meta.value = [value];
              index++;
            }
            associatedValueMetaMap.set(key, meta);
          }
        }
        // date special properties
        else if (node.isStringForDate) {
          const localTimezoneOffset = new Date(0).getTimezoneOffset() * 60_000;
          let dateString = node.value;
          let dateTimestamp = Date.parse(dateString);
          let timezoneOffset = localTimezoneOffset;
          // const match = dateString.match(/([\+\-])([0-9][0-9])\:([0-9][0-9])$/);
          // if (match) {
          //   let [
          //     ,
          //     sign,
          //     timezoneOffsetHoursDigits,
          //     timezoneOffsetMinutesDigits,
          //   ] = match;
          //   if (timezoneOffsetHoursDigits !== "00") {
          //     let timezoneOffsetHours = parseInt(timezoneOffsetHoursDigits);
          //     if (sign === "-") {
          //       timezoneOffsetHours = -timezoneOffsetHours;
          //     }
          //     timezoneOffset += timezoneOffsetHours * 3_600_000;
          //   }
          //   if (timezoneOffsetMinutesDigits !== "00") {
          //     let timezoneOffsetMinutes = parseInt(timezoneOffsetMinutesDigits);
          //     if (sign === "-") {
          //       timezoneOffsetMinutes = -timezoneOffsetMinutes;
          //     }
          //     timezoneOffset += timezoneOffsetMinutes * 60_000;
          //   }
          //   timezoneOffset = localTimezoneOffset;
          // } else {
          //   timezoneOffset = localTimezoneOffset;
          // }
          const date = new Date(dateTimestamp + timezoneOffset);
          const props = {
            year: date.getFullYear(),
            month: date.getMonth(),
            day: date.getDate(),
            hours: date.getHours(),
            minutes: date.getMinutes(),
            seconds: date.getSeconds(),
            milliseconds: date.getMilliseconds(),
          };
          for (const key of Object.keys(props)) {
            const value = props[key];
            const meta = {
              isInternalEntry: true,
              isDateEntry: true,
              value,
              valueSeparator: "",
              valueEndSeparator: "",
            };
            if (key === "month") {
              meta.valueStartSeparator = "-";
              meta.value = String(value + 1).padStart(2, "0");
            } else if (key === "day") {
              meta.valueStartSeparator = "-";
              meta.value = String(value).padStart(2, "0");
            } else if (key === "hours") {
              meta.valueStartSeparator = " ";
              meta.value = String(value).padStart(2, "0");
            } else if (key === "minutes") {
              meta.valueStartSeparator = ":";
              meta.value = String(value).padStart(2, "0");
            } else if (key === "seconds") {
              meta.valueStartSeparator = ":";
              meta.value = String(value).padStart(2, "0");
            } else if (key === "milliseconds") {
              meta.valueStartSeparator = ".";
              meta.valueEndSeparator = "Z";
              meta.value = String(value).padStart(3, "0");
            }
            associatedValueMetaMap.set(key, meta);
          }
        }

        const internalEntryMap = childNodes.internalEntryMap;
        const indexedEntryMap = childNodes.indexedEntryMap;
        const propertyEntryMap = childNodes.propertyEntryMap;
        for (const [
          entryKey,
          {
            pathPart,
            index,
            isIndexedEntry,
            isInternalEntry,
            isPropertyEntry,
            isArrayEntry,
            isTypedArrayEntry,
            isStringEntry,
            isSetEntry,
            isMapEntry,
            isUrlEntry,
            isDateEntry,
            isUrlSearchParamEntry,
            isPrototype,
            isClassStaticProperty,
            isClassPrototype,
            isOneOfUrlSearchParamValue,
            value,
            propertyDescriptor,
            valueSeparator,
            valueStartSeparator,
            valueEndSeparator,
            displayedIn,
            shouldHide,
            shouldHideWhenSame,
          },
        ] of associatedValueMetaMap) {
          if (isSetEntry) {
            const setEntryNode = _createValueNode({
              parent: node,
              path: path.append(entryKey, { isIndexedEntry: true }),
              type: "entry_value",
              value,
              isSetValue: true,
              valueEndSeparator,
            });
            indexedEntryMap.set(entryKey, setEntryNode);
            continue;
          }
          if (isOneOfUrlSearchParamValue) {
            const searchParamEntryNode = _createValueNode({
              parent: node,
              path: path.append(entryKey),
              type: "entry_value",
              index,
              entryKey: node.parent.entryKey,
              value,
              isOneOfUrlSearchParamValue: true,
              valueSeparator,
              valueStartSeparator,
              valueEndSeparator,
            });
            indexedEntryMap.set(entryKey, searchParamEntryNode);
            continue;
          }
          if (
            isStringEntry ||
            (isPropertyEntry &&
              shouldIgnorePropertyEntry(node, entryKey, { propertyDescriptor }))
          ) {
            continue;
          }
          let entryShouldHideWhenSame =
            shouldHideWhenSame || node.shouldHideWhenSame === "deep";
          if (!entryShouldHideWhenSame) {
            if (entryKey === "prototype") {
              entryShouldHideWhenSame = true;
            } else if (propertyDescriptor && !propertyDescriptor.enumerable) {
              if (entryKey === "message" && node.isError) {
              } else {
                entryShouldHideWhenSame = true;
              }
            } else if (entryKey === "lastIndex" && node.isRegExp) {
              entryShouldHideWhenSame = true;
            } else if (typeof entryKey === "symbol") {
              entryShouldHideWhenSame = true;
            }
          }

          const entrySharedInfo = {
            entryKey,
            index,
            isIndexedEntry,
            isInternalEntry,
            isPropertyEntry,
            isArrayEntry,
            isTypedArrayEntry,
            isStringEntry,
            isSetEntry,
            isMapEntry,
            isUrlEntry,
            isDateEntry,
            isUrlSearchParamEntry,
            isPrototype,
            isClassStaticProperty,
            isClassPrototype,
            isOneOfUrlSearchParamValue,
            displayedIn,
          };
          const entryNode = _createValueNode({
            parent: node,
            path: path.append(pathPart || entryKey, {
              isIndexedEntry,
            }),
            type: "entry",
            value: null,
            ...entrySharedInfo,
            shouldHideWhenSame: entryShouldHideWhenSame,
            hidden: hidden || shouldHide,
          });
          let needKeyNode;
          if (isIndexedEntry) {
            indexedEntryMap.set(entryKey, entryNode);
          } else if (isInternalEntry) {
            internalEntryMap.set(entryKey, entryNode);
            needKeyNode = true;
          } else {
            // isPropertyEntry
            if (node.canHaveInternalEntries || node.canHaveIndexedValues) {
              node.shouldExpand = true;
            }
            propertyEntryMap.set(entryKey, entryNode);
            needKeyNode = true;
          }
          if (needKeyNode) {
            const keyNode = _createValueNode({
              parent: entryNode,
              path: entryNode.path,
              type: "entry_key",
              value: entryKey,
              ...entrySharedInfo,
              isMapEntryKey: isMapEntry,
              isUrlEntryKey: isUrlEntry,
              isDateEntryKey: isDateEntry,
              isUrlSearchParamEntryKey: isUrlSearchParamEntry,
              shouldHideWhenSame: false,
              valueStartSeparator: typeof entryKey === "symbol" ? "[" : "",
              valueEndSeparator: typeof entryKey === "symbol" ? "]" : "",
            });
            entryNode.childNodes.key = keyNode;
          }

          if (isInternalEntry) {
            const entryValueNode = _createValueNode({
              parent: entryNode,
              path: entryNode.path,
              type: "entry_value",
              value,
              ...entrySharedInfo,
              isMapEntryValue: isMapEntry,
              isUrlEntryValue: isUrlEntry,
              isDateEntryValue: isDateEntry,
              valueSeparator,
              valueStartSeparator,
              valueEndSeparator,
            });
            entryNode.childNodes.value = entryValueNode;
          } else {
            const useAccessor =
              propertyDescriptor.get || propertyDescriptor.set;
            const toVisitWhenFrozen = useAccessor
              ? ["get", "set", "enumerable"]
              : ["value", "enumerable"];
            const toVisitWhenSealed = useAccessor
              ? ["get", "set", "enumerable", "writable"]
              : ["value", "enumerable", "writable"];
            const toVisitOtherwise = useAccessor
              ? ["get", "set", "enumerable", "configurable", "writable"]
              : ["value", "enumerable", "configurable", "writable"];
            const propertyDescriptorNames = node.propsFrozen
              ? toVisitWhenFrozen
              : node.propsSealed
                ? toVisitWhenSealed
                : toVisitOtherwise;
            for (const propertyDescriptorName of propertyDescriptorNames) {
              const propertyDescriptorValue =
                propertyDescriptor[propertyDescriptorName];
              if (
                shouldIgnorePropertyDescriptor(
                  node,
                  entryKey,
                  propertyDescriptorName,
                  propertyDescriptorValue,
                )
              ) {
                continue;
              }
              const isPropertyValue = propertyDescriptorName === "value";
              const isIndexedValue = isIndexedEntry && isPropertyValue;
              const propertyDescriptorNode = _createValueNode({
                parent: entryNode,
                path: propertyDescriptorValue
                  ? entryNode.path
                  : entryNode.path.append(propertyDescriptorName, {
                      isPropertyDescriptor: true,
                    }),
                type: "entry_value",
                value: propertyDescriptorValue,
                ...entrySharedInfo,
                descriptor: propertyDescriptorName,
                isPropertyDescriptor: true,
                isPropertyValue,
                isIndexedValue,
                shouldHideWhenSame: entryShouldHideWhenSame || !isPropertyValue,
                valueSeparator:
                  propertyDescriptorName === "get" ||
                  propertyDescriptorName === "set"
                    ? ""
                    : valueSeparator,
                valueStartSeparator,
                valueEndSeparator,
              });
              entryNode.childNodes[propertyDescriptorName] =
                propertyDescriptorNode;
            }
          }
        }
      }
      // string (lines and chars)
      if (node.canHaveLines) {
        const lineNodes = [];

        const lines = node.lines;
        for (const line of lines) {
          let lineEntryKey = `#L${lineNodes.length + 1}`;
          const lineNode = _createValueNode({
            parent: node,
            path: path.append(lineEntryKey),
            type: "line",
            value: line,
            index: lineNodes.length,
            entryKey: lineEntryKey,
          });
          lineNodes[lineNode.index] = lineNode;
        }

        childNodes.lines = lineNodes;
      }
      if (node.canHaveChars) {
        const charNodes = [];

        const chars = node.chars;
        for (const char of chars) {
          let charEntryKey = `C${charNodes.length + 1}`;
          const charNode = _createValueNode({
            parent: node,
            path: path.append(charEntryKey),
            type: "char",
            value: char,
            index: charNodes.length,
            entryKey: `${node.parent.entryKey}${charEntryKey}`,
          });
          charNodes[charNode.index] = charNode;
        }

        childNodes.chars = charNodes;
      }
      return node;
    };

    const valueNode = _createValueNode({
      path: createValuePath(),
      type: "value",
      value,
    });
    return valueNode;
  };

  const visitPrototypes = (obj, callback) => {
    while (obj || isUndetectableObject(obj)) {
      const proto = Object.getPrototypeOf(obj);
      if (!proto) {
        break;
      }
      callback(proto);
      obj = proto;
    }
  };
  const getSubtype = (obj) => {
    // https://github.com/nodejs/node/blob/384fd1787634c13b3e5d2f225076d2175dc3b96b/lib/internal/util/inspect.js#L859
    while (obj || isUndetectableObject(obj)) {
      const constructorDescriptor = Object.getOwnPropertyDescriptor(
        obj,
        "constructor",
      );
      if (
        constructorDescriptor !== undefined &&
        typeof constructorDescriptor.value === "function" &&
        constructorDescriptor.value.name !== ""
      ) {
        return String(constructorDescriptor.value.name);
      }
      const toStringTagDescriptor = Object.getOwnPropertyDescriptor(
        obj,
        Symbol.toStringTag,
      );
      if (
        toStringTagDescriptor &&
        typeof toStringTagDescriptor.value === "string"
      ) {
        return toStringTagDescriptor.value;
      }

      obj = Object.getPrototypeOf(obj);
      if (obj === null) {
        return "Object";
      }
    }
    return "";
  };
  const isUndetectableObject = (v) =>
    typeof v === "undefined" && v !== undefined;

  const normalizeUrlPart = (name, value) => {
    if (name === "port") {
      if (value === "") {
        return "";
      }
      return parseInt(value);
    }
    if (name === "search") {
      return value;
    }
    if (name === "hash") {
      return value;
    }
    return value;
  };

  const DOUBLE_QUOTE = `"`;
  const SINGLE_QUOTE = `'`;
  const BACKTICK = "`";
  const pickBestQuote = (
    string,
    { canUseTemplateString, quoteDefault = DOUBLE_QUOTE } = {},
  ) => {
    const containsDoubleQuote = string.includes(DOUBLE_QUOTE);
    if (!containsDoubleQuote) {
      return DOUBLE_QUOTE;
    }
    const containsSimpleQuote = string.includes(SINGLE_QUOTE);
    if (!containsSimpleQuote) {
      return SINGLE_QUOTE;
    }
    if (canUseTemplateString) {
      const containsBackTick = string.includes(BACKTICK);
      if (!containsBackTick) {
        return BACKTICK;
      }
    }
    const doubleQuoteCount = string.split(DOUBLE_QUOTE).length - 1;
    const singleQuoteCount = string.split(SINGLE_QUOTE).length - 1;
    if (singleQuoteCount > doubleQuoteCount) {
      return DOUBLE_QUOTE;
    }
    if (doubleQuoteCount > singleQuoteCount) {
      return SINGLE_QUOTE;
    }
    return quoteDefault;
  };
}

let writeDiff;
{
  writeDiff = (comparison, context) => {
    if (comparison.hidden) {
      return "";
    }
    let node = comparison[context.resultType];
    if (node.hidden) {
      return "";
    }
    if (
      comparison.type === "internal_value" &&
      node.type !== "internal_value"
    ) {
      return "";
    }
    context.onComparisonDisplayed(comparison);

    let diff = "";
    const selfContext = createSelfContext(comparison, context);

    if (node.type === "entry_value" && node.isUrlSearchParamEntry) {
      for (const [, childNode] of node.childNodes.indexedEntryMap) {
        diff += writeDiff(childNode.comparison, selfContext);
      }
      return diff;
    }

    const getDisplayedKey = (node) => {
      if (node.type === "entry_key") {
        return "";
      }
      if (node.displayedIn === "label") {
        return "";
      }
      if (node.isClassPrototype) {
        return "";
      }
      if (node.functionAnalysis.type === "method") {
        return "";
      }
      if (node.isIndexedEntry && node.isPropertyValue) {
        return "";
      }
      if (node.isUrlEntry) {
        return "";
      }
      if (node.isDateEntry) {
        return "";
      }
      if (node.isSourceCode) {
        return "";
      }
      return node.entryKey;
    };
    const getNodeValueEndSeparator = (node) => {
      if (node.isMultiline) {
        // when using
        // foo: 1| line 1
        //      2| line 2
        //      3| line 3
        // the "," separator is removed because it's not correctly separated from the multiline
        // and it becomes hard to know if "," is part of the string or not
        return "";
      }
      if (comparison === selfContext.startComparison) {
        return "";
      }
      return node.valueEndSeparator || "";
    };

    let displayedKey = getDisplayedKey(node);
    let valueSeparator = node.valueSeparator;
    let valueStartSeparator = node.valueStartSeparator;
    let valueEndSeparator = context.valueEndSeparatorDisabled
      ? ""
      : getNodeValueEndSeparator(node);

    let isValue = false;
    if (node.type === "entry_key") {
      const maxColumns = selfContext.maxColumns;
      selfContext.maxColumns = Math.round(maxColumns * 0.5);
      if (node.isMapEntryKey) {
        isValue = true;
      }
    } else if (node.type === "entry_value") {
      if (node.displayedIn !== "label") {
        isValue = true;
      }
    } else if (node.type === "prototype") {
      isValue = true;
    } else if (node.type === "internal_value") {
      if (node.displayedIn !== "label") {
        isValue = true;
      }
    }

    if (isValue) {
      if (context.collapsedWithOverview) {
        selfContext.collapsedWithOverview = false;
        selfContext.collapsed = true;
      } else if (context.collapsed) {
      } else {
        const relativeDepth = node.depth + selfContext.initialDepth;
        auto_collapse_with_overview: {
          if (!node.isMultiline && relativeDepth >= selfContext.maxDepth) {
            selfContext.collapsedWithOverview = true;
            break auto_collapse_with_overview;
          }
          if (!comparison.hasAnyDiff) {
            selfContext.collapsedWithOverview = true;
            break auto_collapse_with_overview;
          }
          if (node.isMapEntryKey) {
            selfContext.collapsedWithOverview = true;
            break auto_collapse_with_overview;
          }
        }

        if (
          !node.isMapEntryKey &&
          !node.isOneOfUrlSearchParamValue &&
          !node.isStringForUrlSearchParams
        ) {
          let indent = `  `.repeat(relativeDepth);
          if (selfContext.signs) {
            if (selfContext.removed) {
              if (selfContext.resultType === "expectNode") {
                diff += ANSI.color(removedSign, removedSignColor);
                indent = indent.slice(1);
              }
            } else if (selfContext.added) {
              if (selfContext.resultType === "actualNode") {
                diff += ANSI.color(addedSign, addedSignColor);
                indent = indent.slice(1);
              }
            } else if (selfContext.modified) {
              if (selfContext.resultType === "actualNode") {
                diff += ANSI.color(unexpectSign, unexpectSignColor);
                indent = indent.slice(1);
              }
            }
          }
          diff += indent;
        }
      }
    }
    if (isValue) {
      if (displayedKey && comparison !== selfContext.startComparison) {
        if (node.descriptor && node.descriptor !== "value") {
          const descriptorName = node.descriptor;
          const descriptorNameColor = pickColor(
            comparison,
            selfContext,
            (node) => node.descriptor,
          );
          diff += ANSI.color(descriptorName, descriptorNameColor);
          diff += " ";
        }
        let nodeHoldingKey;
        if (node.isOneOfUrlSearchParamValue) {
          nodeHoldingKey = node.parent.parent;
        } else if (node.type === "entry_value") {
          nodeHoldingKey = node.parent;
        } else {
          nodeHoldingKey = node;
        }
        const keyComparison = nodeHoldingKey.childNodes.key.comparison;
        const keyContext = {
          ...selfContext,
          modified: context.modified,
          collapsedWithOverview: !node.isMapEntryValue,
        };
        const keyDiff = writeDiff(keyComparison, keyContext);
        diff += keyDiff;
      }
      if (
        (displayedKey || node.isSetValue) &&
        valueSeparator &&
        comparison !== selfContext.startComparison
      ) {
        const spacing = !node.isOneOfUrlSearchParamValue;
        const valueSeparatorColor = pickColor(
          comparison,
          selfContext,
          (node) => node.valueSeparator,
        );
        if (valueSeparator === "=" || valueSeparator === "=>") {
          if (spacing) {
            diff += " ";
          }
          diff += ANSI.color(valueSeparator, valueSeparatorColor);
          if (spacing) {
            diff += " ";
          }
        } else {
          diff += ANSI.color(valueSeparator, valueSeparatorColor);
          if (spacing) {
            diff += " ";
          }
        }
      }
    }

    selfContext.textIndent += stringWidth(diff);
    if (valueStartSeparator) {
      selfContext.maxColumns -= valueStartSeparator.length;
    }
    if (valueEndSeparator) {
      selfContext.maxColumns -= valueEndSeparator.length;
    }
    if (
      comparison.hasAnyDiff &&
      node.type !== "entry" &&
      node.type !== "line"
    ) {
      let maxDepthInsideDiff = selfContext.maxDepthInsideDiff;
      if (
        comparison.reasons.self.modified.has("function_type") &&
        (comparison.actualNode.functionAnalysis.type === "class" ||
          comparison.expectNode.functionAnalysis.type === "class")
      ) {
        // maxDepthInsideDiff++;
      }
      selfContext.maxDepth = Math.min(
        node.depth + maxDepthInsideDiff,
        selfContext.maxDepth,
      );
    }

    let displaySubtype = true;
    if (node.reference) {
      displaySubtype = false;
    }

    let labelDiff = "";
    if (displaySubtype) {
      labelDiff = writeLabelDiff(comparison, selfContext);
    }
    let valueDiff = "";
    value: {
      if (node.type === "entry") {
        if (selfContext.collapsed) {
          break value;
        }
        const propertyDescriptorComparisons = comparison.childComparisons;
        if (selfContext.collapsedWithOverview) {
          const propertyGetterComparison = propertyDescriptorComparisons.get;
          const propertySetterComparison = propertyDescriptorComparisons.set;
          const propertyGetterNode = propertyGetterComparison
            ? propertyGetterComparison[selfContext.resultType]
            : null;
          const propertySetterNode = propertySetterComparison
            ? propertySetterComparison[selfContext.resultType]
            : null;
          if (propertyGetterNode && propertySetterNode) {
            valueDiff += writeDiff(propertyGetterComparison, selfContext);
            break value;
          }
          if (propertyGetterNode) {
            valueDiff += writeDiff(propertyGetterComparison, selfContext);
            break value;
          }
          if (propertySetterNode) {
            valueDiff += writeDiff(propertySetterComparison, selfContext);
            break value;
          }
          const propertyValueComparison = propertyDescriptorComparisons.value;
          valueDiff += writeDiff(propertyValueComparison, selfContext);
          break value;
        }
        let propertyDiff = "";
        for (const propertyDescriptorName of [
          "value",
          "get",
          "set",
          "enumerable",
          "configurable",
          "writable",
        ]) {
          const propertyDescriptorComparison =
            propertyDescriptorComparisons[propertyDescriptorName];
          if (propertyDescriptorComparison === null) {
            continue;
          }
          const propertyDescriptorNode =
            propertyDescriptorComparison[context.resultType];
          if (!propertyDescriptorNode) {
            continue;
          }
          let propertyDescriptorDiff = "";

          propertyDescriptorDiff += writeDiff(
            propertyDescriptorComparison,
            selfContext,
          );
          if (propertyDescriptorDiff.trim()) {
            if (propertyDiff) {
              propertyDiff += "\n";
              selfContext.textIndent = 0;
            }
            propertyDiff += propertyDescriptorDiff;
          }
        }
        valueDiff += propertyDiff;
        break value;
      }
      if (node.type === "entry_key") {
        if (node.isClassStaticProperty) {
          const staticColor = pickColor(
            comparison,
            selfContext,
            (node) => node.isClassStaticProperty,
          );
          valueDiff += ANSI.color("static", staticColor);
          valueDiff += " ";
        }
      }

      // referencing an other composite
      if (node.reference) {
        const refColor = pickColor(comparison, selfContext, (node) =>
          node.reference ? node.reference.path.toString() : null,
        );
        valueDiff += ANSI.color(
          `<ref #${selfContext.getDisplayedId(node.reference.id)}>`,
          refColor,
        );
        break value;
      }
      // will be referenced by a composite
      let referenceFromOtherDisplayed;
      for (const referenceFromOther of node.referenceFromOthersSet) {
        const referenceFromOtherComparison = referenceFromOther.comparison;
        if (
          !referenceFromOtherComparison ||
          referenceFromOtherComparison.hidden
        ) {
          continue;
        }
        referenceFromOtherDisplayed = referenceFromOther;
        break;
      }
      if (referenceFromOtherDisplayed) {
        const refColor = pickColor(comparison, selfContext, (targetNode) => {
          if (targetNode === node) {
            return referenceFromOtherDisplayed.reference.path.toString();
          }
          return node.reference ? node.reference.path.toString() : null;
        });
        valueDiff += ANSI.color(
          `<ref #${selfContext.getDisplayedId(
            referenceFromOtherDisplayed.reference.id,
          )}>`,
          refColor,
        );
        valueDiff += " ";
      }

      if (node.wellKnownId) {
        valueDiff += writeValueDiff(comparison, selfContext);
        break value;
      }
      if (node.isSourceCode) {
        const valueColor = pickValueColor(comparison, selfContext);
        valueDiff += ANSI.color("[source code]", valueColor);
        break value;
      }
      if (node.isStringForUrl) {
        valueDiff += writeUrlDiff(comparison, selfContext);
        break value;
      }
      if (node.isStringForDate) {
        valueDiff += writeDateDiff(comparison, selfContext);
        break value;
      }
      if (node.canHaveLines) {
        valueDiff += writeLinesDiff(comparison, selfContext);
        break value;
      }
      if (node.type === "line") {
        valueDiff += writeOneLineDiff(comparison, selfContext);
        break value;
      }
      if (node.type === "char") {
        valueDiff += writeCharDiff(comparison, selfContext);
        break value;
      }
      if (node.isSymbol) {
        // already in subtype
        break value;
      }
      if (node.isNumber) {
        valueDiff += writeValueDiff(comparison, selfContext);
        break value;
      }
      if (node.isBigInt) {
        valueDiff += writeValueDiff(comparison, selfContext);
        break value;
      }
      if (node.isPrimitive) {
        const value = node.value;
        const valueColor = pickValueColor(comparison, selfContext);
        let valueDiffRaw =
          value === undefined
            ? "undefined"
            : value === null
              ? "null"
              : JSON.stringify(value);
        if (node.isString && !node.quote) {
          valueDiffRaw = valueDiffRaw.slice(1, -1);
        }
        if (
          valueDiffRaw.length >
          selfContext.maxColumns - selfContext.textIndent
        ) {
          valueDiffRaw = valueDiffRaw.slice(
            0,
            selfContext.maxColumns - selfContext.textIndent - "…".length,
          );
          valueDiffRaw += "…";
        }
        valueDiff += ANSI.color(valueDiffRaw, valueColor);
        break value;
      }

      if (selfContext.collapsed) {
        break value;
      }
      const pickCanReset = (getter) => {
        const actualCan = pickSelfOrInternalNode(comparison.actualNode, getter);
        const expectCan = pickSelfOrInternalNode(comparison.expectNode, getter);
        return Boolean(actualCan && expectCan);
      };
      const canResetModifiedOnInternalEntry = pickCanReset(
        (node) => node.canHaveInternalEntries,
      );
      const canResetModifiedOnIndexedEntry = pickCanReset(
        (node) => node.canHaveIndexedValues,
      );
      const canResetModifiedOnPropertyEntry = pickCanReset(
        (node) => node.canHaveProps,
      );

      let childCollapsedWithOverview = selfContext.collapsedWithOverview;
      if (!childCollapsedWithOverview && !selfContext.collapsed) {
        childCollapsedWithOverview = !node.shouldExpand;
      }
      if (childCollapsedWithOverview) {
        if (node.canHaveUrlParts) {
          break value;
        }
        const valueColor = pickValueColor(comparison, selfContext);
        const openDelimiter = node.openDelimiter;
        const closeDelimiter = node.closeDelimiter;
        const nestedValueSeparator = node.canHaveProps ? "," : "";
        const nestedValueSpacing =
          node.canHaveProps && !node.canHaveIndexedValues;
        const ellipsis = "...";

        let labelDiffCollapsed = writeLabelDiff(comparison, {
          ...selfContext,
          collapsedWithOverview: false,
          collapsed: true,
        });
        if (labelDiffCollapsed) {
          labelDiffCollapsed += " ";
        }
        const estimatedCollapsedBoilerplate = `${labelDiffCollapsed}${openDelimiter}${nestedValueSeparator} ${ellipsis} ${closeDelimiter}`;
        const estimatedCollapsedBoilerplateWidth = stringWidth(
          estimatedCollapsedBoilerplate,
        );
        const remainingWidth =
          selfContext.maxColumns -
          selfContext.textIndent -
          estimatedCollapsedBoilerplateWidth;

        let insideOverview = "";
        let isFirst = true;
        let width = 0;
        const nestedComparisons = node.canHaveInternalEntries
          ? createInternalEntryComparisonIterable(node)
          : node.canHaveIndexedValues
            ? createIndexedEntryComparisonIterable(node)
            : createPropertyEntryComparisonIterable(node);

        for (const nestedComparison of nestedComparisons) {
          if (nestedComparison.hidden) {
            continue;
          }
          const nestedNode = nestedComparison[context.resultType];
          if (nestedNode.displayedIn === "label") {
            continue;
          }
          // TODO: we should respect maxValueInsideDiff here too
          let valueDiffOverview = "";
          const canReset = nestedNode.isInternalEntry
            ? canResetModifiedOnInternalEntry
            : nestedNode.isIndexedEntry
              ? canResetModifiedOnIndexedEntry
              : nestedNode.isPropertyEntry
                ? canResetModifiedOnPropertyEntry
                : false;
          const nestedValueContext = {
            ...selfContext,
            collapsedWithOverview: true,
            modified: canReset ? false : selfContext.modified,
            valueEndSeparatorDisabled:
              nestedComparison ===
                nestedComparisons[nestedComparisons.length - 1] &&
              !nestedNode.isClassStaticProperty,
          };
          const markersColor = pickColor(nestedComparison, nestedValueContext);
          valueDiffOverview += writeDiff(nestedComparison, nestedValueContext);
          const valueWidth = stringWidth(valueDiffOverview);
          if (width + valueWidth > remainingWidth) {
            let overviewTruncated = "";
            overviewTruncated += labelDiffCollapsed;
            overviewTruncated += ANSI.color(openDelimiter, markersColor);
            if (insideOverview) {
              if (nestedValueSpacing) {
                overviewTruncated += " ";
              }
              overviewTruncated += insideOverview;
              if (nestedNode.valueSeparator) {
                overviewTruncated += ANSI.color(
                  nestedNode.valueSeparator,
                  markersColor,
                );
              }
            }
            if (nestedValueSpacing) {
              overviewTruncated += " ";
            }
            overviewTruncated += ANSI.color(ellipsis, valueColor);
            if (nestedValueSpacing) {
              overviewTruncated += " ";
            }
            overviewTruncated += ANSI.color(closeDelimiter, markersColor);
            valueDiff += overviewTruncated;
            break value;
          }
          if (isFirst) {
            isFirst = false;
          } else if (nestedValueSpacing) {
            insideOverview += " ";
            width += " ".length;
          }
          insideOverview += valueDiffOverview;
          width += valueWidth;
        }
        let shouldDisplayDelimiters;
        if (node.isClassPrototype) {
          shouldDisplayDelimiters = false;
        } else if (node.isString || node.isObjectForString) {
          shouldDisplayDelimiters = false;
        } else if (node.canHaveIndexedValues) {
          shouldDisplayDelimiters = true;
        } else if (node.canHaveInternalEntries) {
          shouldDisplayDelimiters = true;
        } else if (labelDiff) {
          shouldDisplayDelimiters = insideOverview.length > 0;
        } else {
          shouldDisplayDelimiters = true;
        }
        if (shouldDisplayDelimiters) {
          const delimitersColor = pickDelimitersColor(comparison, selfContext);

          let insideOverviewDiff = "";
          insideOverviewDiff += ANSI.color(openDelimiter, delimitersColor);
          if (insideOverview) {
            if (nestedValueSpacing) {
              insideOverviewDiff += " ";
              insideOverviewDiff += insideOverview;
              insideOverviewDiff += " ";
            } else {
              insideOverviewDiff += insideOverview;
            }
          }
          insideOverviewDiff += ANSI.color(closeDelimiter, delimitersColor);
          valueDiff += insideOverviewDiff;
        } else {
          valueDiff += insideOverview;
        }
        break value;
      }

      // composite
      let insideDiff = "";
      if (node.canHaveInternalEntries) {
        const internalEntryComparisons =
          createInternalEntryComparisonIterable(node);
        const internalEntriesDiff = writeNestedValueGroupDiff({
          comparison,
          context: selfContext,
          parentContext: context,
          nestedValueName: "entry",
          nestedValueNamePlural: "entries",
          openDelimiter: "{",
          closeDelimiter: "}",
          forceDelimitersWhenEmpty: true,
          resetModified: canResetModifiedOnInternalEntry,
          nestedComparisons: internalEntryComparisons,
        });
        insideDiff += internalEntriesDiff;
      }
      if (node.canHaveIndexedValues) {
        const indexedEntryComparisons =
          createIndexedEntryComparisonIterable(node);
        const indexedValuesDiff = writeNestedValueGroupDiff({
          comparison,
          context: selfContext,
          parentContext: context,
          ...(node.isBuffer
            ? {
                nestedValueName: "byte",
                nestedValueNamePlural: "bytes",
              }
            : node.isString || node.isObjectForString
              ? {
                  nestedValueName: "char",
                  nestedValueNamePlural: "chars",
                }
              : {
                  nestedValueName: "value",
                  nestedValueNamePlural: "values",
                }),
          openDelimiter: "[",
          closeDelimiter: "]",
          forceDelimitersWhenEmpty: !node.isString && !node.isObjectForString,
          resetModified: canResetModifiedOnIndexedEntry,
          nestedComparisons: indexedEntryComparisons,
        });
        insideDiff += indexedValuesDiff;
      }
      if (node.canHaveProps) {
        const propsComparisons = createPropertyEntryComparisonIterable(
          node,
          selfContext,
        );
        let forceDelimitersWhenEmpty =
          !node.canHaveIndexedValues && !node.isMap && labelDiff.length === 0;
        if (node.isFunction) {
          forceDelimitersWhenEmpty = true;
        }
        if (node.isClassPrototype) {
          forceDelimitersWhenEmpty = false;
        }
        let propsDiff = writeNestedValueGroupDiff({
          comparison,
          context: selfContext,
          parentContext: context,
          nestedValueName: "prop",
          nestedValueNamePlural: "props",
          openDelimiter: node.isClassPrototype ? "" : "{",
          closeDelimiter: node.isClassPrototype ? "" : "}",
          forceDelimitersWhenEmpty,
          resetModified: canResetModifiedOnPropertyEntry,
          nestedComparisons: propsComparisons,
        });
        if (propsDiff) {
          if (insideDiff) {
            insideDiff += " ";
          }
          insideDiff += propsDiff;
        }
      }
      valueDiff += insideDiff;
      break value;
    }

    const spaceBetweenLabelAndValue =
      labelDiff && valueDiff && !node.isSet && !node.isFunction;
    const getObjectIntegrityCallPath = (node) => {
      if (node.propsFrozen) {
        return [
          { type: "identifier", value: "Object" },
          { type: "property_dot", value: "." },
          { type: "property_identifier", value: "freeze" },
        ];
      }
      if (node.propsSealed) {
        return [
          { type: "identifier", value: "Object" },
          { type: "property_dot", value: "." },
          { type: "property_identifier", value: "seal" },
        ];
      }
      if (node.propsExtensionsPrevented) {
        return [
          { type: "identifier", value: "Object" },
          { type: "property_dot", value: "." },
          { type: "property_identifier", value: "preventExtensions" },
        ];
      }
      return [];
    };
    const objectIntegrityCallPath = getObjectIntegrityCallPath(node);
    if (objectIntegrityCallPath.length) {
      let objectIntegrityDiff = writePathDiff(
        comparison,
        selfContext,
        getObjectIntegrityCallPath,
        { preferSolorColor: true },
      );
      const objectIntegrityCallColor = pickColor(
        comparison,
        selfContext,
        (node) => {
          return getObjectIntegrityCallPath(node).length > 0;
        },
        { preferSolorColor: true },
      );
      diff += objectIntegrityDiff;
      diff += ANSI.color(`(`, objectIntegrityCallColor);
      diff += labelDiff;
      if (spaceBetweenLabelAndValue) {
        diff += " ";
      }
      diff += valueDiff;
      diff += ANSI.color(")", objectIntegrityCallColor);
    } else {
      diff += labelDiff;
      if (spaceBetweenLabelAndValue) {
        diff += " ";
      }
      diff += valueDiff;
    }
    if (valueStartSeparator) {
      const valueStartSeparatorColor = pickColor(
        comparison,
        selfContext,
        (node) => node.valueStartSeparator,
      );
      diff = ANSI.color(valueStartSeparator, valueStartSeparatorColor) + diff;
    }
    if (valueEndSeparator) {
      const valueEndSeparatorColor = pickColor(
        comparison,
        selfContext,
        getNodeValueEndSeparator,
      );
      diff += ANSI.color(valueEndSeparator, valueEndSeparatorColor);
    }
    return diff;
  };

  const createSelfContext = (comparison, context) => {
    const selfContext = { ...context };
    const selfModified = context.modified || comparison.selfHasModification;
    if (comparison.reasons.self.added.has("internal_value")) {
      selfContext.added = true;
      selfContext.removed = false;
      selfContext.modified = false;
    } else if (comparison.reasons.self.removed.has("internal_value")) {
      selfContext.added = false;
      selfContext.removed = false;
      selfContext.modified = true;
    } else if (selfModified) {
      selfContext.added = false;
      selfContext.removed = false;
      selfContext.modified = true;
    } else {
      selfContext.added = context.added || comparison.selfHasAddition;
      selfContext.removed = context.removed || comparison.selfHasRemoval;
      selfContext.modified = false;
    }
    return selfContext;
  };

  const writeLabelDiff = (comparison, context) => {
    let labelDiff = "";
    const node = comparison[context.resultType];
    if (node.wellKnownId) {
      return "";
    }
    if (node.isFunction) {
      labelDiff += writeFunctionLabelDiff(comparison, context);
    } else {
      if (node.constructorCall) {
        if (node.constructorCallUseNew) {
          const constructorCallNewColor = pickColor(
            comparison,
            context,
            (node) =>
              node.constructorCall ? node.constructorCallUseNew : false,
          );
          labelDiff += ANSI.color(`new`, constructorCallNewColor);
          labelDiff += " ";
        }
      }
      let subtypeDisplayed = context.collapsed
        ? node.subtypeDisplayedWhenCollapsed
        : node.subtypeDisplayed;
      if (subtypeDisplayed === undefined) {
        return "";
      }
      if (subtypeDisplayed.length > 0) {
        labelDiff += writePathDiff(comparison, context, (node) =>
          context.collapsed
            ? node.subtypeDisplayedWhenCollapsed || []
            : node.subtypeDisplayed || [],
        );
      }
    }

    const constructorCallDelimitersColor = pickColor(
      comparison,
      context,
      (node) => (node.constructorCall ? node.constructorCallOpenDelimiter : ""),
    );
    if (node.isError) {
      const messagePropertyNode =
        node.childNodes.propertyEntryMap.get("message");
      if (messagePropertyNode) {
        const errorMessageSeparatorColor = pickColor(
          comparison,
          context,
          (node) =>
            node.isError && node.childNodes.propertyEntryMap.has("message"),
        );
        labelDiff += ANSI.color(":", errorMessageSeparatorColor);
        labelDiff += " ";
        const messagePropertyComparison = messagePropertyNode.comparison;
        labelDiff += writeDiff(messagePropertyComparison, context);
      }
    } else if (node.constructorCall) {
      const internalValueNode = node.childNodes.internalValue;
      let internalValueDiff = "";
      internal_value: {
        if (internalValueNode && internalValueNode.displayedIn === "label") {
          const internalValueComparison = internalValueNode.comparison;
          // const actualCanHaveInternalValue = Boolean(
          //   internalValueComparison.actualNode &&
          //     internalValueComparison.actualNode.type === "internal_value",
          // );
          // const expectCanHaveInternalValue = Boolean(
          //   internalValueComparison.expectNode &&
          //     internalValueComparison.expectNode.type === "internal_value",
          // );
          // const canResetModifiedOnInternalValue =
          //   actualCanHaveInternalValue && expectCanHaveInternalValue;
          internalValueDiff = writeDiff(internalValueComparison, {
            ...context,
            modified: false,
          });
        }
      }
      if (node.constructorCallOpenDelimiter) {
        labelDiff += ANSI.color(
          node.constructorCallOpenDelimiter,
          constructorCallDelimitersColor,
        );
        labelDiff += internalValueDiff;
        labelDiff += ANSI.color(
          node.constructorCallCloseDelimiter,
          constructorCallDelimitersColor,
        );
      } else {
        labelDiff += internalValueDiff;
      }
    }

    const shouldDisplayNestedValueCount =
      context.collapsed && node.type !== "map_entry_key" && !node.isSourceCode;
    if (!shouldDisplayNestedValueCount) {
      return labelDiff;
    }
    if (node.isString || node.isObjectForString) {
      return labelDiff;
    }
    if (node.canHaveIndexedValues) {
      const indexedEntrySize = node.childNodes.indexedEntryMap.size;
      const sizeColor = pickColorAccordingToChild(comparison, context, (node) =>
        node.childNodes.indexedEntryMap.values(),
      );
      const indexedSizeDiff = ANSI.color(indexedEntrySize, sizeColor);
      if (node.constructorCallOpenDelimiter) {
        labelDiff += ANSI.color(
          node.constructorCallOpenDelimiter,
          constructorCallDelimitersColor,
        );
        labelDiff += indexedSizeDiff;
        labelDiff += ANSI.color(
          node.constructorCallCloseDelimiter,
          constructorCallDelimitersColor,
        );
      } else {
        labelDiff += indexedSizeDiff;
      }
      const propertySize = node.childNodes.propertyEntryMap.size;
      if (propertySize) {
        const delimitersColor = pickDelimitersColor(comparison, context);
        const propertySizeColor = pickColorAccordingToChild(
          comparison,
          context,
          (node) => node.childNodes.propertyEntryMap.values(),
        );
        labelDiff += " ";
        labelDiff += ANSI.color("{", delimitersColor);
        labelDiff += ANSI.color(propertySize, propertySizeColor);
        labelDiff += ANSI.color("}", delimitersColor);
      }
      return labelDiff;
    }
    if (node.canHaveInternalEntries) {
      const internalSize = node.childNodes.internalEntryMap.size;
      const internalSizeColor = pickColorAccordingToChild(
        comparison,
        context,
        (node) => node.childNodes.internalEntryMap.values(),
      );
      labelDiff += ANSI.color("(", constructorCallDelimitersColor);
      labelDiff += ANSI.color(internalSize, internalSizeColor);
      labelDiff += ANSI.color(")", constructorCallDelimitersColor);
      const propertySize = node.childNodes.propertyEntryMap.size;
      if (propertySize) {
        const delimitersColor = pickDelimitersColor(comparison, context);
        const propertySizeColor = pickColorAccordingToChild(
          comparison,
          context,
          (node) => node.childNodes.propertyEntryMap.values(),
        );
        labelDiff += " ";
        labelDiff += ANSI.color("{", delimitersColor);
        labelDiff += ANSI.color(propertySize, propertySizeColor);
        labelDiff += ANSI.color("}", delimitersColor);
      }
      return labelDiff;
    }
    if (node.canHaveProps) {
      const propertySize = node.childNodes.propertyEntryMap.size;
      const propertySizeColor = pickColorAccordingToChild(
        comparison,
        context,
        (node) => node.childNodes.propertyEntryMap.values(),
      );
      if (node.isFunction) {
        labelDiff += ANSI.color("{", constructorCallDelimitersColor);
        labelDiff += " ";
        labelDiff += ANSI.color(
          "[source code]",
          pickColor(comparison, context),
        );
        labelDiff += " ";
        labelDiff += ANSI.color("}", constructorCallDelimitersColor);
      } else if (node.constructorCall) {
        if (propertySize) {
          labelDiff += " ";
          labelDiff += ANSI.color("{", constructorCallDelimitersColor);
          labelDiff += ANSI.color(propertySize, propertySizeColor);
          labelDiff += ANSI.color("}", constructorCallDelimitersColor);
        }
      } else {
        labelDiff += ANSI.color("(", constructorCallDelimitersColor);
        labelDiff += ANSI.color(propertySize, propertySizeColor);
        labelDiff += ANSI.color(")", constructorCallDelimitersColor);
      }
    }
    return labelDiff;
  };
  const writeFunctionLabelDiff = (comparison, context) => {
    let functionLabelDiff = "";
    const node = comparison[context.resultType];
    const prototypeComparison = comparison.childComparisons.prototype;
    if (prototypeComparison) {
      context.onComparisonDisplayed(prototypeComparison, true);
    }
    if (node.isClassStaticProperty) {
      const staticColor = pickColor(
        comparison,
        context,
        (node) => node.isClassStaticProperty,
      );
      functionLabelDiff += ANSI.color("static", staticColor);
    }
    if (node.wellKnownId) {
      return "";
    }
    if (node.functionAnalysis.type === "class") {
      const classKeywordColor = pickColor(
        comparison,
        context,
        (node) => node.functionAnalysis.type === "class",
      );
      if (functionLabelDiff) {
        functionLabelDiff += " ";
      }
      functionLabelDiff += ANSI.color("class", classKeywordColor);
    }
    if (node.functionAnalysis.isAsync) {
      const asyncKeywordColor = pickColor(
        comparison,
        context,
        (node) => node.functionAnalysis.isAsync,
      );
      functionLabelDiff += ANSI.color("async", asyncKeywordColor);
    }
    if (node.functionAnalysis.type === "classic") {
      const getFunctionLabel = (node) => {
        if (node.functionAnalysis.type === "classic") {
          if (node.functionAnalysis.isGenerator) {
            return "function*";
          }
          return "function";
        }
        return "other";
      };
      const functionLabelColor = pickColor(
        comparison,
        context,
        getFunctionLabel,
      );
      if (functionLabelDiff) {
        functionLabelDiff += " ";
      }
      functionLabelDiff += ANSI.color(
        getFunctionLabel(node),
        functionLabelColor,
      );
    }
    if (node.functionAnalysis.name) {
      const functionNameColor = pickColor(
        comparison,
        {
          ...context,
          modified: true,
        },
        (node) => node.functionAnalysis.name,
      );
      if (functionLabelDiff) {
        functionLabelDiff += " ";
      }
      functionLabelDiff += ANSI.color(node.value.name, functionNameColor);
      // consider the function.name as displayed
      // context.onComparisonDisplayed(functionNameComparison, true);
    }
    const extendedClassName = node.extendedClassName;
    if (extendedClassName) {
      const extendsKeywordColor = pickColor(comparison, context, (node) =>
        Boolean(node.extendedClassName),
      );
      functionLabelDiff += " ";
      functionLabelDiff += ANSI.color("extends", extendsKeywordColor);
      functionLabelDiff += " ";
      const extendedClassNameColor = pickColor(
        comparison,
        context,
        (node) => node.extendedClassName,
      );
      functionLabelDiff += ANSI.color(
        node.extendedClassName,
        extendedClassNameColor,
      );
    }
    const beforeFunctionBodyColor = pickColor(comparison, context, (node) => {
      if (node.functionAnalysis.type === "arrow") {
        return "() => ";
      }
      if (node.functionAnalysis.type === "class") {
        return "";
      }
      if (
        node.functionAnalysis.getterName ||
        node.functionAnalysis.setterName ||
        node.isFunction
      ) {
        return "()";
      }
      return null;
    });
    if (node.functionAnalysis.type === "arrow") {
      if (functionLabelDiff) {
        functionLabelDiff += " ";
      }
      functionLabelDiff += ANSI.color("() =>", beforeFunctionBodyColor);
      functionLabelDiff += " ";
    } else if (node.functionAnalysis.type === "method") {
      if (functionLabelDiff) {
        functionLabelDiff += " ";
      }
      if (node.functionAnalysis.getterName) {
        functionLabelDiff += ANSI.color("get", beforeFunctionBodyColor);
        functionLabelDiff += " ";
        functionLabelDiff += ANSI.color(node.entryKey, beforeFunctionBodyColor);
        functionLabelDiff += ANSI.color("()", beforeFunctionBodyColor);
        functionLabelDiff += " ";
      } else if (node.functionAnalysis.setterName) {
        functionLabelDiff += ANSI.color("set", beforeFunctionBodyColor);
        functionLabelDiff += " ";
        functionLabelDiff += ANSI.color(node.entryKey, beforeFunctionBodyColor);
        functionLabelDiff += ANSI.color("()", beforeFunctionBodyColor);
        functionLabelDiff += " ";
      } else {
        functionLabelDiff += ANSI.color(node.entryKey, beforeFunctionBodyColor);
        functionLabelDiff += ANSI.color("()", beforeFunctionBodyColor);
        functionLabelDiff += " ";
      }
    } else if (node.functionAnalysis.type === "classic") {
      if (functionLabelDiff) {
        functionLabelDiff += " ";
      }
      functionLabelDiff += ANSI.color("()", beforeFunctionBodyColor);
      functionLabelDiff += " ";
    } else if (functionLabelDiff) {
      functionLabelDiff += " ";
    }
    return functionLabelDiff;
  };

  const writeLinesDiff = (comparison, context) => {
    const stringNode = comparison[context.resultType];
    const lineNodes = stringNode.childNodes.lines;
    const lineComparisons = comparison.childComparisons.lines;
    // single line string (both actual and expect)
    const isSingleLine = lineComparisons.length === 1;
    const actualSelfOrInternalNode = pickSelfOrInternalNode(
      comparison.actualNode,
      (node) => node.canHaveLines,
    );
    const expectSelfOrInternalNode = pickSelfOrInternalNode(
      comparison.expectNode,
      (node) => node.canHaveLines,
    );
    const resetModified =
      actualSelfOrInternalNode &&
      actualSelfOrInternalNode.canHaveLines &&
      expectSelfOrInternalNode &&
      expectSelfOrInternalNode.canHaveLines;
    const stringContext = {
      ...context,
      modified: resetModified ? false : context.modified,
      quotes: stringNode.useQuotes ? stringNode.quote : null,
      useLineNumbersOnTheLeft: stringNode.useLineNumbersOnTheLeft,
      biggestLineIndex: undefined,
      focusedCharIndex: undefined,
    };

    single_line: {
      if (!isSingleLine) {
        break single_line;
      }
      const firstLineComparison = lineComparisons[0];
      stringContext.focusedCharIndex = getFocusedCharIndex(
        firstLineComparison,
        stringContext,
      );
      return writeDiff(firstLineComparison, stringContext);
    }
    multiline: {
      let focusedLineIndex = lineNodes.findIndex((lineNode) => {
        return lineNode.comparison.hasAnyDiff;
      });
      if (focusedLineIndex === -1) {
        focusedLineIndex = lineNodes.length - 1;
      }
      const focusedLineComparison = lineComparisons[focusedLineIndex];
      stringContext.focusedCharIndex = getFocusedCharIndex(
        focusedLineComparison,
        context,
      );
      stringContext.biggestLineIndex = focusedLineIndex;

      if (context.collapsed || context.collapsedWithOverview) {
        let focusedLineDiff = writeDiff(focusedLineComparison, {
          ...stringContext,
          overflowLeft: focusedLineIndex > 0,
          overflowRight: lineNodes.length - 1 - focusedLineIndex > 0,
        });
        return focusedLineDiff;
      }

      const lineBeforeArray = [];
      let maxLineBefore = context.maxLineBeforeDiff - 1;
      while (maxLineBefore--) {
        const previousLineIndex = focusedLineIndex - lineBeforeArray.length - 1;
        const hasPreviousLine = previousLineIndex >= 0;
        if (!hasPreviousLine) {
          break;
        }
        const previousLineComparison = lineComparisons[previousLineIndex];
        lineBeforeArray.push(previousLineComparison);
      }
      let previousLineRemaining = focusedLineIndex - lineBeforeArray.length;
      if (previousLineRemaining === 1) {
        lineBeforeArray.push(lineComparisons[0]);
        previousLineRemaining = 0;
      }

      const lineAfterArray = [];
      let maxLineAfter = context.maxLineAfterDiff - 1;
      while (maxLineAfter--) {
        const nextLineIndex = focusedLineIndex + lineAfterArray.length + 1;
        const hasNextLine = nextLineIndex < lineNodes.length;
        if (!hasNextLine) {
          break;
        }
        const nextLineComparison = lineComparisons[nextLineIndex];
        lineAfterArray.push(nextLineComparison);
        if (nextLineIndex > focusedLineIndex) {
          stringContext.biggestLineIndex = nextLineIndex;
        }
      }
      let nextLineRemaining =
        lineNodes.length - 1 - focusedLineIndex - lineAfterArray.length;
      if (nextLineRemaining === 1) {
        lineAfterArray.push(lineComparisons[lineComparisons.length - 1]);
        nextLineRemaining = 0;
      }

      const diffLines = [];
      if (previousLineRemaining) {
        let previousLinesSkippedDiff = "";
        previousLinesSkippedDiff += " ".repeat(
          String(stringContext.biggestLineIndex + 1).length,
        );
        previousLinesSkippedDiff += ANSI.color(
          `↑ ${previousLineRemaining} lines ↑`,
          sameColor,
        );
        diffLines.push(previousLinesSkippedDiff);
      }
      for (const lineBefore of lineBeforeArray) {
        diffLines.push(writeDiff(lineBefore, stringContext));
      }
      diffLines.push(writeDiff(focusedLineComparison, stringContext));
      for (const lineAfter of lineAfterArray) {
        diffLines.push(writeDiff(lineAfter, stringContext));
      }
      if (nextLineRemaining) {
        const skippedCounters = {
          total: 0,
          modified: 0,
          added: 0,
          removed: 0,
        };
        const from = focusedLineIndex + lineAfterArray.length + 1;
        const to = lineNodes.length;
        let index = from;
        while (index < to) {
          const nextLineComparison = lineComparisons[index];
          index++;
          skippedCounters.total++;
          if (stringContext.modified) {
            context.onComparisonDisplayed(nextLineComparison, true);
            skippedCounters.modified++;
          } else if (nextLineComparison.selfHasAddition) {
            context.onComparisonDisplayed(nextLineComparison, true);
            skippedCounters.added++;
          } else if (nextLineComparison.selfHasRemoval) {
            context.onComparisonDisplayed(nextLineComparison, true);
            skippedCounters.removed++;
          } else if (nextLineComparison.hasAnyDiff) {
            context.onComparisonDisplayed(nextLineComparison, true);
            skippedCounters.modified++;
          }
        }

        let markersColor;
        let summaryColor;
        let summaryDetails = [];
        if (skippedCounters.removed === skippedCounters.total) {
          summaryColor = removedColor;
          markersColor = removedColor;
        } else if (skippedCounters.added === skippedCounters.total) {
          summaryColor = addedColor;
          markersColor = addedColor;
        } else {
          markersColor = pickColor(comparison, context);
          summaryColor = pickColor(comparison, context);
          if (skippedCounters.removed) {
            summaryDetails.push(
              ANSI.color(`${skippedCounters.removed} removed`, removedColor),
            );
          }
          if (skippedCounters.added) {
            summaryDetails.push(
              ANSI.color(`${skippedCounters.added} added`, addedColor),
            );
          }
          if (skippedCounters.modified) {
            summaryDetails.push(
              ANSI.color(
                `${skippedCounters.modified} modified`,
                context.resultColor,
              ),
            );
          }
        }

        let nextLinesSkippedDiff = "";
        nextLinesSkippedDiff += " ".repeat(
          String(stringContext.biggestLineIndex + 1).length,
        );
        nextLinesSkippedDiff += ANSI.color("↓", markersColor);
        nextLinesSkippedDiff += " ";
        nextLinesSkippedDiff += ANSI.color(
          `${skippedCounters.total} lines`,
          summaryColor,
        );
        if (summaryDetails.length) {
          nextLinesSkippedDiff += ` `;
          nextLinesSkippedDiff += ANSI.color(`(`, markersColor);
          nextLinesSkippedDiff += summaryDetails.join(" ");
          nextLinesSkippedDiff += ANSI.color(`)`, markersColor);
        }
        nextLinesSkippedDiff += " ";
        nextLinesSkippedDiff += ANSI.color("↓", markersColor);
        diffLines.push(nextLinesSkippedDiff);
      }
      let separator = `\n`;
      if (context.textIndent && stringNode.useLineNumbersOnTheLeft) {
        separator += " ".repeat(context.textIndent);
      }
      return diffLines.join(separator);
    }
  };
  const writeNestedValueGroupDiff = ({
    comparison,
    context,
    parentContext,
    nestedValueName,
    nestedValueNamePlural,
    openDelimiter,
    closeDelimiter,
    forceDelimitersWhenEmpty,
    resetModified,
    nestedComparisons,
  }) => {
    const node = comparison[context.resultType];
    const relativeDepth = node.depth + context.initialDepth;
    let indent = "  ".repeat(relativeDepth);
    let diffCount = 0;
    let canResetTextIndent = !node.isClassPrototype;
    const writeNestedValueDiff = (nestedComparison, { resetModified }) => {
      const nestedContext = {
        ...context,
        modified: resetModified ? false : context.modified,
      };
      if (canResetTextIndent) {
        nestedContext.textIndent = 0;
        canResetTextIndent = false;
      }
      let nestedValueDiff = writeDiff(nestedComparison, nestedContext);
      if (
        nestedValueDiff &&
        nestedComparison !== context.startComparison &&
        !nestedComparison[context.resultType].isClassPrototype
      ) {
        nestedValueDiff += `\n`;
        canResetTextIndent = true;
      }
      return nestedValueDiff;
    };

    let groupDiff = "";
    const entryBeforeDiffArray = [];
    let skippedArray = [];
    const maxDiff =
      context.modified || context.added || context.removed
        ? context.maxValueInsideDiff
        : context.maxDiffPerObject;
    for (const nestedComparison of nestedComparisons) {
      if (nestedComparison.hidden) {
        continue;
      }
      const nestedNode = nestedComparison[context.resultType];
      if (nestedNode.displayedIn === "label") {
        continue;
      }
      if (!nestedComparison.hasAnyDiff) {
        entryBeforeDiffArray.push(nestedComparison);
        continue;
      }
      diffCount++;
      // too many diff
      if (diffCount > maxDiff) {
        skippedArray.push(nestedComparison);
        continue;
      }
      // not enough space remaining
      // first write nested value (prop, value) before the diff
      const entryBeforeDiffCount = entryBeforeDiffArray.length;
      if (entryBeforeDiffCount) {
        let beforeDiff = "";
        let from =
          entryBeforeDiffCount === context.maxValueBeforeDiff
            ? 0
            : Math.max(
                entryBeforeDiffCount - context.maxValueBeforeDiff + 1,
                0,
              );
        let to = entryBeforeDiffCount;
        let index = from;
        while (index !== to) {
          const entryBeforeDiff = entryBeforeDiffArray[index];
          beforeDiff += writeNestedValueDiff(entryBeforeDiff, {
            resetModified,
          });
          index++;
        }
        skippedArray = entryBeforeDiffArray.slice(0, from);
        entryBeforeDiffArray.length = 0;

        let skipped = skippedArray.length;
        if (skipped) {
          let aboveSummary = "";
          aboveSummary += `${skipped} ${nestedValueNamePlural}`;
          groupDiff += `${indent}  `;
          const arrowSign = diffCount > 1 ? `↕` : `↑`;
          groupDiff += ANSI.color(
            `${arrowSign} ${aboveSummary} ${arrowSign}`,
            pickColor(comparison, context),
          );
          groupDiff += "\n";
        }
        groupDiff += beforeDiff;
        skippedArray.length = 0;
      }
      const nestedValueDiff = writeNestedValueDiff(nestedComparison, {
        resetModified,
      });
      groupDiff += nestedValueDiff;
    }

    skippedArray.push(...entryBeforeDiffArray);
    // now display the values after
    const skippedCount = skippedArray.length;
    if (skippedCount) {
      const maxValueAfterDiff =
        context.modified || context.added || context.removed
          ? context.maxValueInsideDiff + 1
          : context.maxValueAfterDiff;
      let from = 0;
      let to =
        skippedCount === maxValueAfterDiff
          ? skippedCount
          : Math.min(maxValueAfterDiff - 1, skippedCount);
      let index = from;
      while (index !== to) {
        const nextComparison = skippedArray[index];
        if (nextComparison.hasAnyDiff) {
          // do not display when they come from maxDiffPerObject
          break;
        }
        index++;
        groupDiff += writeNestedValueDiff(nextComparison, {
          resetModified,
        });
      }
      skippedArray = skippedArray.slice(index);
    }
    remaining_summary: {
      if (skippedArray.length === 0) {
        break remaining_summary;
      }
      const skippedCounters = {
        total: 0,
        removed: 0,
        added: 0,
        modified: 0,
      };
      if (context.added) {
        skippedCounters.total = skippedCounters.added = skippedArray.length;
      } else if (context.removed) {
        skippedCounters.total = skippedCounters.removed = skippedArray.length;
      } else if (context.modified) {
        skippedCounters.total = skippedCounters.modified = skippedArray.length;
      } else {
        for (const skippedComparison of skippedArray) {
          skippedCounters.total++;
          if (skippedComparison.selfHasAddition) {
            context.onComparisonDisplayed(skippedComparison, true);
            skippedCounters.added++;
            continue;
          }
          if (skippedComparison.selfHasRemoval) {
            context.onComparisonDisplayed(skippedComparison, true);
            skippedCounters.removed++;
            continue;
          }
          if (context.modified || skippedComparison.hasAnyDiff) {
            context.onComparisonDisplayed(skippedComparison, true);
            skippedCounters.modified++;
            continue;
          }
          continue;
        }
      }
      let markersColor;
      let summaryColor;
      let summaryDetails = [];

      if (skippedCounters.removed === skippedCounters.total) {
        markersColor = summaryColor = removedColor;
      } else if (skippedCounters.added === skippedCounters.total) {
        markersColor = summaryColor = addedColor;
      } else if (skippedCounters.modified === skippedCounters.total) {
        markersColor = summaryColor = context.resultColor;
      } else {
        markersColor = pickColor(comparison, context);
        summaryColor = markersColor;
        if (skippedCounters.removed) {
          summaryDetails.push(
            ANSI.color(`${skippedCounters.removed} removed`, removedColor),
          );
        }
        if (skippedCounters.added) {
          summaryDetails.push(
            ANSI.color(`${skippedCounters.added} added`, addedColor),
          );
        }
        if (skippedCounters.modified) {
          summaryDetails.push(
            ANSI.color(
              `${skippedCounters.modified} modified`,
              context.resultColor,
            ),
          );
        }
      }
      groupDiff += `${indent}  `;
      groupDiff += ANSI.color(`↓`, markersColor);
      groupDiff += " ";
      groupDiff += ANSI.color(
        skippedCounters.total === 1
          ? `${skippedCounters.total} ${nestedValueName}`
          : `${skippedCounters.total} ${nestedValueNamePlural}`,
        summaryColor,
      );
      if (summaryDetails.length) {
        groupDiff += ` `;
        groupDiff += ANSI.color(`(`, markersColor);
        groupDiff += summaryDetails.join(" ");
        groupDiff += ANSI.color(`)`, markersColor);
      }
      groupDiff += " ";
      groupDiff += ANSI.color(`↓`, markersColor);
      groupDiff += "\n";
    }
    if (context.signs) {
      if (context.resultType === "actualNode") {
        if (parentContext.added) {
          groupDiff += ANSI.color(addedSign, addedSignColor);
          indent = indent.slice(1);
        } else if (parentContext.modified) {
          groupDiff += ANSI.color(unexpectSign, unexpectSignColor);
          indent = indent.slice(1);
        }
      } else if (parentContext.removed) {
        groupDiff += ANSI.color(removedSign, removedSignColor);
        indent = indent.slice(1);
      }
    }
    if (groupDiff) {
      if (node.isComposite) {
        if (!node.isClassPrototype) {
          groupDiff = `\n${groupDiff}`;
        }
        groupDiff += indent;
      }
    }
    if (groupDiff.length > 0 || forceDelimitersWhenEmpty) {
      let groupDiff2 = "";
      const delimitersColor = pickDelimitersColor(comparison, context);
      groupDiff2 += ANSI.color(openDelimiter, delimitersColor);
      groupDiff2 += groupDiff;
      groupDiff2 += ANSI.color(closeDelimiter, delimitersColor);
      return groupDiff2;
    }
    return groupDiff;
  };

  const writeBreakableDiff = ({
    comparison,
    context,
    childNodes,
    focusedChildIndex,
    resetModified,
    overflowStartMarker,
    overflowEndMarker,
    startDelimiter,
    openDelimiter,
    closeDelimiter,
  }) => {
    const node = comparison[context.resultType];
    const childContext = {
      ...context,
      modified: resetModified ? false : context.modified,
    };
    // child can break
    const inheritedMaxColumns = context.parentMaxColumns || context.maxColumns;
    const allocatedWidth = inheritedMaxColumns - context.textIndent;
    if (node.isStringForUrlSearchParams || node.isStringForUrl) {
      childContext.maxColumns = Infinity;
      childContext.parentMaxColumns = inheritedMaxColumns;
    }
    let remainingWidth = allocatedWidth;
    const beforeDiffArray = [];
    const afterDiffArray = [];

    let focusedChildNode = childNodes[focusedChildIndex];
    if (!focusedChildNode) {
      focusedChildIndex = childNodes.length - 1;
      focusedChildNode = childNodes[focusedChildIndex];
    }
    let focusedChildDiff = "";
    if (focusedChildNode) {
      focusedChildDiff = writeDiff(focusedChildNode.comparison, childContext);
      remainingWidth -= stringWidth(focusedChildDiff);
    }

    const overflowStartWidth = overflowStartMarker.length;
    const overflowEndWidth = overflowEndMarker.length;
    let tryBeforeFirst = true;
    let previousChildAttempt = 0;
    let nextChildAttempt = 0;
    while (remainingWidth) {
      let childIndex;
      const previousChildIndex = focusedChildIndex - previousChildAttempt - 1;
      const nextChildIndex = focusedChildIndex + nextChildAttempt + 1;
      let hasPreviousChild = previousChildIndex >= 0;
      const hasNextChild = nextChildIndex < childNodes.length;
      if (!hasPreviousChild && !hasNextChild) {
        break;
      }
      if (!tryBeforeFirst && hasNextChild) {
        hasPreviousChild = false;
      }
      if (hasPreviousChild) {
        previousChildAttempt++;
        childIndex = previousChildIndex;
      } else if (hasNextChild) {
        nextChildAttempt++;
        childIndex = nextChildIndex;
      }
      const childNode = childNodes[childIndex];
      if (!childNode) {
        continue;
      }
      if (tryBeforeFirst && hasPreviousChild) {
        tryBeforeFirst = false;
      }
      const childDiff = writeDiff(childNode.comparison, childContext);
      const childWidth = stringWidth(childDiff);
      let nextWidth = childWidth;
      if (childIndex - 1 > 0) {
        nextWidth += overflowStartWidth;
      }
      if (childIndex + 1 < childNodes.length - 1) {
        nextWidth += overflowEndWidth;
      }
      if (nextWidth >= remainingWidth) {
        if (hasPreviousChild) {
          previousChildAttempt--;
        } else {
          nextChildAttempt--;
        }
        break;
      }
      if (childIndex < focusedChildIndex) {
        beforeDiffArray.push(childDiff);
      } else {
        afterDiffArray.push(childDiff);
      }
      remainingWidth -= childWidth;
    }
    let breakableDiff = "";
    let hasStartOverflow =
      focusedChildIndex - previousChildAttempt > 0 || context.overflowLeft;
    let hasEndOverflow =
      focusedChildIndex + nextChildAttempt < childNodes.length - 1 ||
      context.overflowRight;
    const overflowColor = pickColor(comparison, childContext);
    if (hasStartOverflow) {
      breakableDiff += ANSI.color(overflowStartMarker, overflowColor);
    }
    if (openDelimiter) {
      const delimiterColor = pickDelimitersColor(comparison, childContext);
      breakableDiff += ANSI.color(openDelimiter, delimiterColor);
    }
    if (startDelimiter) {
      breakableDiff += ANSI.color(startDelimiter);
    }
    breakableDiff += beforeDiffArray.reverse().join("");
    breakableDiff += focusedChildDiff;
    breakableDiff += afterDiffArray.join("");

    if (closeDelimiter) {
      const delimiterColor = pickDelimitersColor(comparison, childContext);
      breakableDiff += ANSI.color(closeDelimiter, delimiterColor);
    }
    if (hasEndOverflow) {
      breakableDiff += ANSI.color(overflowEndMarker, overflowColor);
    }
    return breakableDiff;
  };

  const writeOneLineDiff = (comparison, context) => {
    return writeBreakableDiff({
      comparison,
      context,
      childNodes: comparison[context.resultType].childNodes.chars,
      focusedChildIndex: context.focusedCharIndex,
      resetModified: (() => {
        const actualNode = comparison.actualNode;
        const expectNode = comparison.expectNode;
        if (actualNode && expectNode) {
          if (actualNode.canHaveChars && expectNode.canHaveChars) {
            if (actualNode.isRegExpLine === expectNode.isRegExpLine) {
              return true;
            }
          }
        }
        return false;
      })(),
      overflowStartMarker: "…",
      overflowEndMarker: "…",
      openDelimiter: context.quotes,
      closeDelimiter: context.quotes,
      startDelimiter: (() => {
        if (context.collapsed) return "";
        if (context.collapsedWithOverview) return "";
        if (!context.useLineNumbersOnTheLeft) return "";

        let linerNumberAside = "";
        const lineNumberColor = pickColor(comparison, context);
        const lineNumberString = String(comparison.index + 1);
        if (
          context.biggestLineIndex &&
          String(context.biggestLineIndex + 1).length > lineNumberString.length
        ) {
          linerNumberAside += " ";
        }
        linerNumberAside += ANSI.color(lineNumberString, lineNumberColor);
        // lineDiff += " ";
        linerNumberAside += ANSI.color("|", lineNumberColor);
        linerNumberAside += " ";
        return linerNumberAside;
      })(),
    });
  };
  const writeCharDiff = (charComparison, context) => {
    const node = charComparison[context.resultType];
    const { quotes } = context;
    const char = node.value;
    if (quotes && char === quotes) {
      node.parts[0].value = `\\${char}`;
    } else if (node.preserveLineBreaks && (char === "\n" || char === "\r")) {
    } else if (node.isRegExpChar && regExpSpecialCharSet.has(char)) {
    } else {
      const point = char.charCodeAt(0);
      if (point === 8232) {
        // line separator 1
        node.parts[0].value = `\\u2028`;
      } else if (point === 8233) {
        // line separator 2
        node.parts[0].value = `\\u2029`;
      } else if (point === 92 || point < 32 || (point > 126 && point < 160)) {
        node.parts[0].value = charMeta[point];
      }
    }
    return writeValueDiff(charComparison, context);
  };
  const regExpSpecialCharSet = new Set([
    "/",
    "^",
    "\\",
    "[",
    "]",
    "(",
    ")",
    "{",
    "}",
    "?",
    "+",
    "*",
    ".",
    "|",
    "$",
  ]);
  // prettier-ignore
  const charMeta = [
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

  const writeUrlDiff = (comparison, context) => {
    const node = comparison[context.resultType];
    const childNodes = [];
    for (const [urlPartName, urlPartNode] of node.childNodes.internalEntryMap) {
      if (
        urlPartName === "href" ||
        urlPartName === "host" ||
        urlPartName === "origin" ||
        urlPartName === "searchParams"
      ) {
        continue;
      }
      if (urlPartName === "search") {
        const searchParamsNode = urlPartNode.childNodes.value;
        for (const [, searchParamValueNode] of searchParamsNode.childNodes
          .internalEntryMap) {
          childNodes.push(searchParamValueNode);
        }
        continue;
      }

      childNodes.push(urlPartNode);
    }
    const focusedUrlPartIndex = childNodes.findIndex((childNode) => {
      return childNode.comparison.hasAnyDiff;
    });
    const resetModified = (() => {
      const actualNodeWhoCanHaveUrlPars = pickSelfOrInternalNode(
        comparison.actualNode,
        (node) => node.isStringForUrl,
      );
      const expectNodeWhoCanHaveUrlParts = pickSelfOrInternalNode(
        comparison.expectNode,
        (node) => node.isStringForUrl,
      );
      return Boolean(
        actualNodeWhoCanHaveUrlPars && expectNodeWhoCanHaveUrlParts,
      );
    })();
    return writeBreakableDiff({
      comparison,
      context,
      childNodes,
      focusedChildIndex: focusedUrlPartIndex,
      openDelimiter: node.quote,
      closeDelimiter: node.quote,
      overflowStartMarker: "…",
      overflowEndMarker: "…",
      resetModified,
    });
  };
  const writeDateDiff = (comparison, context) => {
    let dateDiff = "";
    const node = comparison[context.resultType];
    const actualNodeWhoCanHaveDatePars = pickSelfOrInternalNode(
      comparison.actualNode,
      (node) => node.isStringForDate,
    );
    const expectNodeWhoCanHaveDateParts = pickSelfOrInternalNode(
      comparison.expectNode,
      (node) => node.isStringForDate,
    );
    const canResetModifiedOnDatePart = Boolean(
      actualNodeWhoCanHaveDatePars && expectNodeWhoCanHaveDateParts,
    );
    const datePartContext = {
      ...context,
      modified: canResetModifiedOnDatePart ? false : context.modified,
    };

    const writeDatePart = (datePartName) => {
      const datePartNode = node.childNodes.internalEntryMap.get(datePartName);
      const datePartComparison = datePartNode.comparison;
      const datePartValueComparison = datePartComparison.childComparisons.value;
      const datePartDiff = writeDiff(datePartValueComparison, datePartContext);
      return datePartDiff;
    };
    const delimitersColor = pickDelimitersColor(comparison, datePartContext);
    dateDiff += ANSI.color(node.quote, delimitersColor);
    dateDiff += writeDatePart("year");
    dateDiff += writeDatePart("month");
    dateDiff += writeDatePart("day");
    date_time: {
      const timePartHasAnyDiff = (timePartName) => {
        const timePartNode = node.childNodes.internalEntryMap.get(timePartName);
        const timePartComparison = timePartNode.comparison;
        const timePartValueComparison =
          timePartComparison.childComparisons.value;
        return timePartValueComparison.hasAnyDiff;
      };
      const timeHasAnyDiff = [
        "hours",
        "minutes",
        "seconds",
        "milliseconds",
      ].some((timePartName) => {
        return timePartHasAnyDiff(timePartName);
      });
      if (timeHasAnyDiff) {
        dateDiff += writeDatePart("hours");
        dateDiff += writeDatePart("minutes");
        dateDiff += writeDatePart("seconds");
        if (timePartHasAnyDiff("milliseconds")) {
          dateDiff += writeDatePart("milliseconds");
        }
      }
    }
    dateDiff += ANSI.color(node.quote, delimitersColor);
    return dateDiff;
  };

  const createInternalEntryComparisonIterable = (node) => {
    const internalEntryNodeMap = node.childNodes.internalEntryMap;
    let internalEntryKeys = Array.from(internalEntryNodeMap.keys());
    if (node.isStringForUrl) {
      internalEntryKeys = internalEntryKeys.filter(
        (internalEntryKey) =>
          !URL_INTERNAL_PROPERTY_NAMES.includes(internalEntryKey),
      );
    }
    const internalEntryComparisons = internalEntryKeys.map(
      (internalEntryKey) =>
        internalEntryNodeMap.get(internalEntryKey).comparison,
    );
    return internalEntryComparisons;
  };
  const createIndexedEntryComparisonIterable = (node) => {
    const indexedEntryMap = node.childNodes.indexedEntryMap;
    const indexedEntryNodes = Array.from(indexedEntryMap.values());
    const indexedEntryComparisons = indexedEntryNodes.map(
      (indexedEntryNode) => indexedEntryNode.comparison,
    );
    return indexedEntryComparisons;
  };
  const createPropertyEntryComparisonIterable = (node) => {
    const propertyEntryNodeMap = node.childNodes.propertyEntryMap;
    let propertyNames = Array.from(propertyEntryNodeMap.keys());
    let internalValueNode = node.childNodes.internalValue;
    let internalValueComparison;
    if (internalValueNode && internalValueNode.displayedIn === "properties") {
      internalValueComparison = internalValueNode.comparison;
    }

    if (node.isFunction) {
      const prototypePropertyIndex = propertyNames.indexOf("prototype");
      if (prototypePropertyIndex > -1) {
        propertyNames.splice(prototypePropertyIndex, 1);
        propertyNames.push("prototype");
      }
    }

    const propertyComparisons = [];
    for (const propertyName of propertyNames) {
      const propertyComparison =
        propertyEntryNodeMap.get(propertyName).comparison;
      if (!propertyComparison.hidden) {
        propertyComparisons.push(propertyComparison);
      }
    }

    let prototypeNode = node.childNodes.prototype;
    let prototypeComparison;
    if (prototypeNode) {
      prototypeComparison = prototypeNode.comparison;
      if (prototypeComparison && prototypeComparison.hidden) {
        prototypeComparison = null;
      }
    }

    if (node.isClassPrototype || node.isFunctionPrototype) {
      return [
        ...(internalValueComparison ? [internalValueComparison] : []),
        ...propertyComparisons,
        ...(prototypeComparison ? [prototypeComparison] : []),
      ];
    }
    return [
      ...(internalValueComparison ? [internalValueComparison] : []),
      ...(prototypeComparison ? [prototypeComparison] : []),
      ...propertyComparisons,
    ];
  };

  const pickValueColor = (comparison, context) => {
    return pickColor(comparison, context, (node) => {
      return node.childNodes.internalValue
        ? node.childNodes.internalValue.value
        : node.value;
    });
  };
}

const isComposite = (value) => {
  if (value === null) return false;
  if (typeof value === "object") return true;
  if (typeof value === "function") return true;
  return false;
};
const humanizeSymbol = (symbol) => {
  const symbolWellKnownValuePath = getWellKnownValuePath(symbol);
  if (symbolWellKnownValuePath) {
    return symbolWellKnownValuePath.toString();
  }
  const description = symbolToDescription(symbol);
  if (description) {
    const key = Symbol.keyFor(symbol);
    if (key) {
      return `Symbol.for(${description})`;
    }
    return `Symbol(${description})`;
  }
  return `Symbol()`;
};
const isValidPropertyIdentifier = (propertyName) => {
  return (
    typeof propertyName === "number" ||
    !isNaN(propertyName) ||
    isDotNotationAllowed(propertyName)
  );
};
const isDotNotationAllowed = (propertyName) => {
  return (
    /^[a-z_$]+[0-9a-z_&]$/i.test(propertyName) ||
    /^[a-z_$]$/i.test(propertyName)
  );
};
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
const createValuePath = (parts = []) => {
  return {
    parts,
    toString: () => parts.map((part) => part.value).join(""),
    valueOf: () => parts.map((part) => part.value).join(""),
    append: (
      property,
      { isIndexedEntry, isPropertyDescriptor, isMeta } = {},
    ) => {
      let propertyKey = "";
      let propertyKeyCanUseDot = false;
      if (isIndexedEntry) {
        propertyKey = `[${property}]`;
      } else if (typeof property === "symbol") {
        propertyKey = humanizeSymbol(property);
      } else if (typeof property === "string") {
        if (
          // first "property" is a "global" variable name that does not need to be wrapped
          // in quotes
          parts.length === 0 ||
          isDotNotationAllowed(property)
        ) {
          propertyKey = property;
          propertyKeyCanUseDot = true;
        } else {
          propertyKey = `"${property}"`; // TODO: property escaping
        }
      } else {
        propertyKey = String(property);
        propertyKeyCanUseDot = true;
      }
      if (parts.length === 0) {
        return createValuePath([
          {
            type: "identifier",
            value: propertyKey,
          },
        ]);
      }
      if (isPropertyDescriptor || isMeta) {
        return createValuePath([
          ...parts,
          { type: "property_open_delimiter", value: "[[" },
          { type: "property_identifier", value: propertyKey },
          { type: "property_close_delimiter", value: "]]" },
        ]);
      }
      if (propertyKeyCanUseDot) {
        return createValuePath([
          ...parts,
          { type: "property_dot", value: "." },
          { type: "property_identifier", value: propertyKey },
        ]);
      }
      return createValuePath([
        ...parts,
        { type: "property_open_delimiter", value: "[" },
        { type: "property_identifier", value: propertyKey },
        { type: "property_close_delimiter", value: "]" },
      ]);
    },
  };
};

const AsyncFunction = async function () {}.constructor;
const GeneratorFunction = function* () {}.constructor;
const AsyncGeneratorFunction = async function* () {}.constructor;

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap
let getWellKnownValuePath;
{
  const wellKnownWeakMap = new WeakMap();
  const numberWellKnownMap = new Map();
  const symbolWellKnownMap = new Map();
  getWellKnownValuePath = (value) => {
    if (!wellKnownWeakMap.size) {
      visitValue(global, createValuePath());
      visitValue(
        AsyncFunction,
        createValuePath([
          {
            type: "identifier",
            value: "AsyncFunction",
          },
        ]),
      );
      visitValue(
        GeneratorFunction,
        createValuePath([
          {
            type: "identifier",
            value: "GeneratorFunction",
          },
        ]),
      );
      visitValue(
        AsyncGeneratorFunction,
        createValuePath([
          { type: "identifier", value: "AsyncGeneratorFunction" },
        ]),
      );
      for (const numberOwnPropertyName of Object.getOwnPropertyNames(Number)) {
        if (
          numberOwnPropertyName === "MAX_VALUE" ||
          numberOwnPropertyName === "MIN_VALUE" ||
          numberOwnPropertyName === "MAX_SAFE_INTEGER" ||
          numberOwnPropertyName === "MIN_SAFE_INTEGER" ||
          numberOwnPropertyName === "EPSILON"
        ) {
          numberWellKnownMap.set(Number[numberOwnPropertyName], [
            { type: "identifier", value: "Number" },
            { type: "property_dot", value: "." },
            { type: "property_identifier", value: numberOwnPropertyName },
          ]);
        }
      }
      for (const mathOwnPropertyName of Object.getOwnPropertyNames(Math)) {
        if (
          mathOwnPropertyName === "E" ||
          mathOwnPropertyName === "LN2" ||
          mathOwnPropertyName === "LN10" ||
          mathOwnPropertyName === "LOG2E" ||
          mathOwnPropertyName === "LOG10E" ||
          mathOwnPropertyName === "PI" ||
          mathOwnPropertyName === "SQRT1_2" ||
          mathOwnPropertyName === "SQRT2"
        ) {
          numberWellKnownMap.set(Math[mathOwnPropertyName], [
            { type: "identifier", value: "Math" },
            { type: "property_dot", value: "." },
            { type: "property_identifier", value: mathOwnPropertyName },
          ]);
        }
      }
    }
    if (typeof value === "symbol") {
      return symbolWellKnownMap.get(value);
    }
    if (typeof value === "number") {
      return numberWellKnownMap.get(value);
    }
    return wellKnownWeakMap.get(value);
  };

  const visitValue = (value, valuePath) => {
    if (typeof value === "symbol") {
      symbolWellKnownMap.set(value, valuePath);
      return;
    }
    if (!isComposite(value)) {
      return;
    }

    if (wellKnownWeakMap.has(value)) {
      // prevent infinite recursion on circular structures
      return;
    }
    wellKnownWeakMap.set(value, valuePath);

    const visitProperty = (property) => {
      let descriptor;
      try {
        descriptor = Object.getOwnPropertyDescriptor(value, property);
      } catch (e) {
        // may happen if you try to access some iframe properties or stuff like that
        if (e.name === "SecurityError") {
          return;
        }
        throw e;
      }
      if (!descriptor) {
        return;
      }
      // do not trigger getter/setter
      if ("value" in descriptor) {
        const propertyValue = descriptor.value;
        visitValue(propertyValue, valuePath.append(property));
      }
    };
    for (const property of Object.getOwnPropertyNames(value)) {
      visitProperty(property);
    }
    for (const symbol of Object.getOwnPropertySymbols(value)) {
      visitProperty(symbol);
    }
    if (isComposite(value)) {
      const protoValue = Object.getPrototypeOf(value);
      if (protoValue && !wellKnownWeakMap.has(protoValue)) {
        visitValue(protoValue, valuePath.append("__proto__"));
      }
    }
  };
}

const splitChars = (string) => {
  // eslint-disable-next-line new-cap
  const splitter = new Graphemer.default();
  return splitter.splitGraphemes(string);
};

const writeValueDiff = (comparison, context) => {
  return writePathDiff(comparison, context, (node) => node.parts);
};

const writePathDiff = (
  comparison,
  context,
  getter,
  { preferSolorColor } = {},
) => {
  const node = comparison[context.resultType];
  const otherNode = comparison[context.otherResultType];
  let path = getter(node);
  let otherPath = otherNode ? getter(otherNode) : [];
  path = Array.isArray(path) ? path : [];
  otherPath = Array.isArray(otherPath) ? otherPath : [];

  let pathDiff = "";
  let index = 0;
  // as long as they have the same type we can consider solo
  let sameType = otherPath.length > 0;
  while (index < path.length) {
    const part = path[index];
    const otherPart = otherPath[index];
    let partColor;
    let partValue = part.value;
    if (context.removed || context.added) {
      partColor = context.resultColorWhenSolo;
      if (part.displayOnlyIfModified) {
        partValue = "";
      }
    } else if (context.modified) {
      if (!otherNode || index >= otherPath.length) {
        // other part does not exists
        partColor =
          preferSolorColor || sameType
            ? context.resultColorWhenSolo
            : context.resultColor;
        if (part.displayOnlyIfModified) {
          partValue = "";
        }
      } else if (part.type !== otherPart.type) {
        sameType = false;
        partColor = context.resultColor;
        if (part.displayOnlyIfModified) {
          partValue = "";
        }
      } else if (part.value === otherPart.value) {
        partColor = sameColor;
        if (part.displayOnlyIfModified) {
          partValue = "";
        }
      } else {
        partColor = context.resultColor;
      }
    } else {
      if (part.displayOnlyIfModified) {
        partValue = "";
      }
      partColor = sameColor;
    }
    pathDiff += ANSI.color(partValue, partColor);
    index++;
  }
  return pathDiff;
};

const pickColor = (comparison, context, getter, { preferSolorColor } = {}) => {
  if (context.removed || context.added) {
    return context.resultColorWhenSolo;
  }
  if (context.modified) {
    const node = comparison[context.resultType];
    let otherNode = comparison[context.otherResultType];
    if (!otherNode) {
      if (node.isOneOfUrlSearchParamValue) {
        // then the other node is:
        // - not a url
        // - a url without multi search param
        const urlNode = node.parent.parent.parent;
        const otherUrlNodeCandidate =
          urlNode.comparison[context.otherResultType];
        if (otherUrlNodeCandidate) {
          otherNode = otherUrlNodeCandidate.childNodes.internalEntryMap.get(
            node.entryKey,
          )?.childNodes.value;
        }
      }
    }
    if (!otherNode) {
      return preferSolorColor
        ? context.resultColorWhenSolo
        : context.resultColor;
    }
    if (otherNode.hidden) {
      return context.resultColorWhenSolo;
    }
    if (!getter) {
      return sameColor;
    }
    const currentValue = getter(node, otherNode);
    const otherValue = getter(otherNode, node);
    if (
      currentValue !== otherValue ||
      getIsNegativeZero(currentValue) !== getIsNegativeZero(otherValue)
    ) {
      return preferSolorColor
        ? context.resultColorWhenSolo
        : context.resultColor;
    }
  }
  return sameColor;
};
const pickDelimitersColor = (comparison, context) => {
  return pickColor(comparison, context, (node) => {
    if (comparison.reasons.self.modified.has("primitive")) {
      return node.openDelimiter;
    }
    const internalNode = node.childNodes.internalValue;
    if (internalNode) {
      return internalNode.openDelimiter;
    }
    return node.openDelimiter;
  });
};
const pickColorAccordingToChild = (comparison, context, getter) => {
  if (context.removed || context.added) {
    return context.resultColorWhenSolo;
  }
  if (context.modified || comparison.hasAnyDiff) {
    const node = comparison[context.resultType];
    const otherNode = comparison[context.otherResultType];
    if (!otherNode) {
      return context.resultColor;
    }
    let childNodes = getter(node);
    let someSolo = false;
    for (const childNode of childNodes) {
      const childComparison = childNode.comparison;
      if (childComparison.reasons.overall.modified.size > 0) {
        return context.resultColor;
      }
      if (
        childComparison.reasons.overall.added.size ||
        childComparison.reasons.overall.removed.size
      ) {
        someSolo = true;
      }
    }
    if (someSolo) {
      return context.resultColorWhenSolo;
    }
  }
  return sameColor;
};

const getOwnerNode = (node) => {
  if (node.type === "value") {
    return node;
  }
  if (node.type === "entry") {
    return node.parent;
  }
  if (node.isSetValue) {
    return node.parent;
  }
  if (node.type === "entry_value") {
    return node.parent.parent;
  }
  if (node.type === "line") {
    return node.parent;
  }
  if (node.type === "char") {
    return node.parent;
  }
  if (node.type === "prototype") {
    return node.parent;
  }
  if (node.type === "internal_value") {
    return node.parent;
  }
  return null;
};

const pickSelfOrInternalNode = (node, getter) => {
  if (!node) {
    return null;
  }
  if (getter(node)) {
    return node;
  }
  const internalValueNode = node.childNodes.internalValue;
  if (internalValueNode && getter(internalValueNode)) {
    return internalValueNode;
  }
  return null;
};

const getFocusedCharIndex = (comparison, context) => {
  const node = comparison[context.resultType];
  const charComparisons = comparison.childComparisons.chars;
  const charWithDiffIndex = node.childNodes.chars.findIndex((_, index) => {
    const charComparison = charComparisons[index];
    return charComparison.hasAnyDiff;
  });
  if (charWithDiffIndex !== -1) {
    return charWithDiffIndex;
  }
  return -1;
  // const charNodes = comparison[context.resultType].charNodes;
  // return charNodes.length - 1;
};

const getIsNan = (value) => {
  // eslint-disable-next-line no-self-compare
  return value !== value;
};

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
const URL_INTERNAL_PROPERTY_NAMES = [
  "protocol",
  "username",
  "password",
  "hostname",
  "port",
  "pathname",
  // for search params I'll have to think about it
  // for now we'll handle it as a string
  "search",
  "hash",

  "href",
  "host",
  "origin",
  "searchParams",
];

const canParseDate = (value) => {
  // see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/parse#non-standard_date_strings
  if (/^[0-9]$/.test(value)) {
    return false;
  }
  if (/^[0-9]{2}$/.test(value)) {
    return false;
  }
  if (/^[0-9]{2}\//.test(value)) {
    return false;
  }
  const returnValue = Date.parse(value);
  if (getIsNan(returnValue)) {
    return false;
  }
  return true;
};

// under some rare and odd circumstances firefox Object.is(-0, -0)
// returns false making test fail.
// it is 100% reproductible with big.test.js.
// However putting debugger or executing Object.is just before the
// comparison prevent Object.is failure.
// It makes me thing there is something strange inside firefox internals.
// All this to say avoid relying on Object.is to test if the value is -0
const getIsNegativeZero = (value) => {
  return typeof value === "number" && 1 / value === -Infinity;
};

const groupDigits = (digitsAsString) => {
  const digitCount = digitsAsString.length;
  if (digitCount < 4) {
    return digitsAsString;
  }

  let digitsWithSeparator = digitsAsString.slice(-3);
  let remainingDigits = digitsAsString.slice(0, -3);
  while (remainingDigits.length) {
    const group = remainingDigits.slice(-3);
    remainingDigits = remainingDigits.slice(0, -3);
    digitsWithSeparator = `${group}_${digitsWithSeparator}`;
  }
  return digitsWithSeparator;
};

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Not_a_valid_code_point
// const isValidCodePoint = (number) => number > 0 && number < 1_114_111;
