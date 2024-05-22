/*
 * LE PLUS DUR QU'IL FAUT FAIRE AVANT TOUT:
 *
 * - respecter ordre des props actual !== ordre props expected
 * - s'arreter au premier diff dans les props
 * - mode one liner lorsque pas de diff du tout
 * - donner du contexte autour du diff
 * - max depth
 *   lorsque la diff est tres profonde alors on skip ce qui est pareil pour afficher
 *   qu'a partir d'un certain point
 *   ça ça devrait etre facile en partant d'un point précis de l'arbre de comparaison
 * - map depth inside diff
 *   - lorsque une diff porte sur un objet (modified, added, removed)
 *   alors on print l'objet mais cela a une limite assez basse pour que on ai
 *   juste un aperçu sans heurter la lisibilité
 *
 * -> il faut tout de meme créer un arbre de comparison MAIS
 * cet arbre est un sous ensemble de la réalité (pour perf + lisibilité)
 * donc on auras des trucs comme
 * - nodeForPreviousProps(2)
 * - nodeForNextProps(4)
 * pour gérer les props restantes par exemple
 *
 * donc il faut créer un AST pour la comparison
 * comparison: {
 *   actualNode: GHOST_NODE | ADDED_OR_REMOVED_NODE | valueNode,
 *   expectNode: GHOST_NODE | ADDED_OR_REMOVED_NODE | valueNode,
 *   ownPropertyComparisonMap: Map<comparison>
 * }
 *
 */

import { ANSI } from "@jsenv/humanize";

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

const setColor = (text, color) => {
  if (text.trim() === "") {
    // cannot set color of blank chars
    return text;
  }
  return ANSI.color(text, color);
};

export const assert = ({ actual, expect }) => {
  const rootActualNode = createRootNode({
    colorWhenSolo: addedColor,
    colorWhenSame: sameColor,
    colorWhenModified: unexpectColor,
    name: "actual",
    type: "root",
    value: actual,
    otherValue: expect,
  });
  const rootExpectNode = createRootNode({
    colorWhenSolo: removedColor,
    colorWhenSame: sameColor,
    colorWhenModified: expectColor,
    name: "expect",
    type: "root",
    value: expect,
    otherValue: actual,
  });

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
  const compare = (actualNode, expectNode, isAbstract) => {
    // eslint-disable-next-line no-unused-vars
    let actualCurrentNode;
    // eslint-disable-next-line no-unused-vars
    let expectCurrentNode;

    const reasons = createReasons();
    const comparison = {
      isComparison: true,
      actualNode,
      expectNode,
      reasons,
      done: false,
      subcompare: (a, b, isAbstract) => {
        const childComparison = compare(a, b, isAbstract);
        appendReasonGroup(
          comparison.reasons.inside,
          childComparison.reasons.overall,
        );
        return childComparison;
      },
    };
    if (isAbstract) {
      return comparison;
    }

    const onSelfDiff = (reason) => {
      reasons.self.modified.add(reason);
    };
    const renderPrimitiveDiff = (node) => {
      return JSON.stringify(node.value);
    };
    const renderPropertiesWhenNoDiff = () => {
      let diff = "";
      diff += "TODO: properties diff compact mode";
      return diff;
    };
    const getIndexToDisplayArray = (diffIndexArray, names) => {
      const MAX_PROP_BEFORE_DIFF = 2;
      const MAX_PROP_AFTER_DIFF = 2;

      const indexToDisplaySet = new Set();
      for (const diffIndex of diffIndexArray) {
        let beforeDiffIndex = diffIndex - 1;
        let beforeCount = 0;
        while (beforeDiffIndex > -1) {
          if (beforeCount === MAX_PROP_BEFORE_DIFF) {
            break;
          }
          indexToDisplaySet.add(beforeDiffIndex);
          beforeCount++;
          beforeDiffIndex--;
        }
        indexToDisplaySet.add(diffIndex);
        let afterDiffIndex = diffIndex + 1;
        let afterCount = 0;
        while (afterDiffIndex < names.length - 1) {
          if (afterCount === MAX_PROP_AFTER_DIFF) {
            break;
          }
          indexToDisplaySet.add(afterDiffIndex);
          afterCount++;
          afterDiffIndex--;
        }
      }
      return Array.from(indexToDisplaySet);
    };
    const renderPropertiesDiff = ({
      node,
      diffIndexArray,
      ownPropertyNames,
      ownPropertyNodeMap,
    }) => {
      diffIndexArray.sort();
      const indexToDisplayArray = getIndexToDisplayArray(
        diffIndexArray,
        ownPropertyNames,
      );
      let atLeastOnePropertyDisplayed = false;
      let diff = "";
      let color = node.modified
        ? node.colorWhenModified
        : node.solo
          ? node.colorWhenSolo
          : node.colorWhenSame;
      let propertiesDiff = "";
      for (const indexToDisplay of indexToDisplayArray) {
        const propertyName = ownPropertyNames[indexToDisplay];
        const propertyNode = ownPropertyNodeMap.get(propertyName);
        if (atLeastOnePropertyDisplayed) {
          propertiesDiff += "\n";
          propertiesDiff += propertyNode.render();
        } else {
          propertiesDiff += propertyNode.render();
          atLeastOnePropertyDisplayed = true;
        }
      }
      if (atLeastOnePropertyDisplayed) {
        diff += setColor("{", color);
        diff += "\n";
        diff += propertiesDiff;
        diff += "\n";
        diff += "  ".repeat(node.depth);
        diff += setColor("}", color);
      } else {
        diff += setColor("{", color);
        diff += setColor("}", color);
      }
      return diff;
    };

    visit: {
      // comparing primitives
      if (actualNode.isPrimitive && expectNode.isPrimitive) {
        // comparing primitives
        if (actualNode.value === expectNode.value) {
          // we already know there will be no diff
          // but for now we'll still visit the primitive constituents
        } else {
          onSelfDiff("primitive_value");
        }
        actualNode.render = () => {
          return renderPrimitiveDiff(actualNode);
        };
        expectNode.render = () => {
          return renderPrimitiveDiff(expectNode);
        };
        break visit;
      }

      // comparing composites
      if (actualNode.isComposite && expectNode.isComposite) {
        const actualOwnPropertyNames = actualNode.ownPropertyNames;
        const expectOwnPropertyNames = expectNode.ownPropertyNames;
        const actualOwnPropertyNodeMap = new Map();
        const expectOwnPropertyNodeMap = new Map();
        const propComparisonMap = new Map();
        const getPropComparison = (propName) => {
          if (propComparisonMap.has(propName)) {
            return propComparisonMap.get(propName);
          }
          const actualOwnPropertyNode = createOwnPropertyNode(
            actualNode,
            propName,
          );
          actualOwnPropertyNodeMap.set(propName, actualOwnPropertyNode);
          const expectOwnPropertyNode = createOwnPropertyNode(
            expectNode,
            propName,
          );
          expectOwnPropertyNodeMap.set(propName, expectOwnPropertyNode);
          const ownPropertyComparison = comparison.subcompare(
            actualOwnPropertyNode,
            expectOwnPropertyNode,
          );
          propComparisonMap.set(propName, ownPropertyComparison);
          return ownPropertyComparison;
        };
        const MAX_DIFF_PER_OBJECT = 2;
        const diffPropertyNameSet = new Set();
        const actualDiffIndexArray = [];
        const expectDiffIndexArray = [];
        for (const actualPropName of actualOwnPropertyNames) {
          const propValueComparison = getPropComparison(actualPropName);
          propComparisonMap.set(actualPropName, propValueComparison);
          if (propValueComparison.hasAnyDiff) {
            actualDiffIndexArray.push(
              actualOwnPropertyNames.indexOf(actualPropName),
            );
            expectDiffIndexArray.push(
              expectOwnPropertyNames.indexOf(actualPropName),
            );
            diffPropertyNameSet.add(actualPropName);
            if (diffPropertyNameSet.size === MAX_DIFF_PER_OBJECT) {
              break;
            }
          }
        }
        if (diffPropertyNameSet.size === 0) {
          actualNode.render = () => {
            return renderPropertiesWhenNoDiff({
              node: actualNode,
              diffIndexArray: actualDiffIndexArray,
              ownPropertyNames: actualOwnPropertyNames,
              ownPropertyNodeMap: actualOwnPropertyNodeMap,
            });
          };
          expectNode.render = () => {
            return renderPropertiesWhenNoDiff({
              node: expectNode,
              diffIndexArray: expectDiffIndexArray,
              ownPropertyNames: expectOwnPropertyNames,
              ownPropertyNodeMap: expectOwnPropertyNodeMap,
            });
          };
          break visit;
        }
        actualNode.render = () => {
          return renderPropertiesDiff({
            node: actualNode,
            diffIndexArray: actualDiffIndexArray,
            ownPropertyNames: actualOwnPropertyNames,
            ownPropertyNodeMap: actualOwnPropertyNodeMap,
          });
        };
        expectNode.render = () => {
          return renderPropertiesDiff({
            node: expectNode,
            diffIndexArray: expectDiffIndexArray,
            ownPropertyNames: expectOwnPropertyNames,
            ownPropertyNodeMap: expectOwnPropertyNodeMap,
          });
        };
        break visit;
      }

      // primitive vs composite
      if (actualNode.isPrimitive && expectNode.isComposite) {
        onSelfDiff("should_be_composite");
        actualNode.render = () => {
          return renderPrimitiveDiff(actualNode);
        };
        expectNode.render = () => {
          return "TODO: expect when composite solo";
        };
        break visit;
      }

      // composite vs primitive
      if (actualNode.isComposite && expectNode.isPrimitive) {
        onSelfDiff("should_be_primitive");
        actualNode.render = () => {
          return "TODO: actual when composite solo";
        };
        expectNode.render = () => {
          return renderPrimitiveDiff(expectNode);
        };
        break visit;
      }

      // comparing own property (always compared together)
      if (actualNode.type === "own_property") {
        const renderPropertyDiff = (node) => {
          let propertyDiff = "";
          const propertyNameNode = node.propertyNameNode;
          propertyDiff += "  ".repeat(propertyNameNode.depth);
          propertyDiff += propertyNameNode.render();
          propertyDiff += ":";
          propertyDiff += " ";
          const propertyValueNode = node.propertyValueNode;
          propertyDiff += propertyValueNode.render();
          propertyDiff += ",";
          return propertyDiff;
        };
        actualNode.render = () => {
          return renderPropertyDiff(actualNode);
        };
        expectNode.render = () => {
          return renderPropertyDiff(expectNode);
        };
        comparison.subcompare(
          actualNode.propertyNameNode,
          expectNode.propertyNameNode,
        );
        comparison.subcompare(
          actualNode.propertyValueNode,
          expectNode.propertyValueNode,
        );
        break visit;
      }

      if (expectNode.placeholder) {
        actualNode.render = () => {
          return "TODO: actual when ? solo ";
        };
        break visit;
      }

      if (actualNode.placeholder) {
        expectNode.render = () => {
          return "TODO: expect when ? solo ";
        };
        break visit;
      }
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

    return comparison;
  };

  const rootComparison = compare(rootActualNode, rootExpectNode);
  if (!rootComparison.hasAnyDiff) {
    return;
  }

  let diff = ``;
  diff += ANSI.color("actual:", sameColor);
  diff += " ";
  diff += rootComparison.actualNode.render();
  diff += `\n`;
  diff += ANSI.color("expect:", sameColor);
  diff += " ";
  diff += rootComparison.expectNode.render();
  throw diff;
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
    type,
    value,
  }) => {
    const rootNode = createNode({
      colorWhenSolo,
      colorWhenSame,
      colorWhenModified,
      name,
      type,
      value,
      parent: null,
      depth: 0,
      meta: {},
    });

    return rootNode;
  };

  const createNode = ({
    colorWhenSolo,
    colorWhenSame,
    colorWhenModified,
    name,
    type,
    value,
    parent,
    depth,
    meta = {},
  }) => {
    const node = {
      colorWhenSolo,
      colorWhenSame,
      colorWhenModified,
      name,
      type,
      value,
      parent,
      depth,
      meta,
      appendChild: ({ type, value, depth = node.depth + 1 }) => {
        return createNode({
          colorWhenSolo: node.colorWhenSolo,
          colorWhenSame: node.colorWhenSame,
          colorWhenModified: node.colorWhenModified,
          name: node.name,
          type,
          value,
          parent: node,
          depth,
        });
      },
      // info
      isPrimitive: false,
      isComposite: false,
      isSymbol: false,
      // render info
      render: () => {},
    };

    if (value === PLACEHOLDER_FOR_NOTHING) {
      return node;
    }
    if (value === PLACEHOLDER_WHEN_ADDED_OR_REMOVED) {
      return node;
    }
    if (type === "own_property") {
      return node;
    }
    if (type === "own_property_name") {
      node.isPrimitive = true;
      return node;
    }
    if (type === "own_property_symbol") {
      node.isPrimitive = true;
      node.isSymbol = true;
      return node;
    }
    if (typeof value === "object") {
      node.isComposite = true;
      node.valueStartDelimiter = "{";
      node.valueEndDelimiter = "}";

      const ownPropertyNames = [];
      for (const ownPropertyName of Object.getOwnPropertyNames(value)) {
        if (shouldIgnoreOwnPropertyName(node, ownPropertyName)) {
          continue;
        }
        ownPropertyNames.push(ownPropertyName);
      }
      node.ownPropertyNames = ownPropertyNames;

      return node;
    }

    node.isPrimitive = true;
    node.render = () => {
      return JSON.stringify(value);
    };
    return node;
  };
}

const createOwnPropertyNode = (node, ownPropertyName) => {
  const ownPropertyNode = node.appendChild({
    type: "own_property",
    value: "",
    depth: node.depth,
  });
  ownPropertyNode.propertyNameNode = ownPropertyNode.appendChild({
    type: "own_property_name",
    value: ownPropertyName,
  });
  ownPropertyNode.propertyValueNode = ownPropertyNode.appendChild({
    type: "own_property_value",
    value: node.value[ownPropertyName],
  });
  return ownPropertyNode;
};

const shouldIgnoreOwnPropertyName = (node, ownPropertyName) => {
  if (ownPropertyName === "prototype") {
    if (node.isFunction) {
      return false;
    }
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
    const prototypeValueIsComposite = typeof prototypeValue === "object";
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
    return node.canHaveIndexedValues || node.isFunction;
  }
  if (ownPropertyName === "name") {
    return node.isFunction;
  }
  if (ownPropertyName === "stack") {
    return node.isError;
  }
  if (ownPropertyName === "valueOf") {
    return (
      node.childNodes.wrappedValue &&
      node.childNodes.wrappedValue.key === "valueOf()"
    );
  }
  if (ownPropertyName === "toString") {
    return (
      node.childNodes.wrappedValue &&
      node.childNodes.wrappedValue.key === "toString()"
    );
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
