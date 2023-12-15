import he from "he";

export const startGeneratingSvg = (attributes) => {
  const createElement = (name, attributes = {}) => {
    const canSelfClose = canSelfCloseNames.includes(name);
    const canReceiveChild = canReceiveChildNames.includes(name);
    const canReceiveContent = canReceiveContentNames.includes(name);

    const children = [];
    const setAttributes = (namedValues) => {
      Object.assign(attributes, namedValues);
    };

    const node = {
      name,
      content: "",
      children,
      attributes,
      canSelfClose,
      setAttributes,
      createElement,
      appendChild: (childNode) => {
        if (!canReceiveChild) {
          throw new Error(`cannot appendChild into ${name}`);
        }
        children.push(childNode);
      },
      setContent: (value) => {
        if (!canReceiveContent) {
          throw new Error(`cannot setContent on ${name}`);
        }
        node.content = value;
      },
      renderAsString: () => {
        const renderNode = (node, { depth }) => {
          let nodeString = "";
          nodeString += `<${node.name}`;

          write_attributes: {
            const attributeNames = Object.keys(node.attributes);
            if (attributeNames.length) {
              let attributesSingleLine = "";
              let attributesMultiLine = "";

              for (const attributeName of attributeNames) {
                let attributeValue = node.attributes[attributeName];
                if (typeof attributeValue === "number") {
                  attributeValue = round(attributeValue);
                }
                if (attributeName === "viewBox") {
                  attributeValue = attributeValue
                    .split(",")
                    .map((v) => round(parseFloat(v.trim())))
                    .join(", ");
                }
                attributesSingleLine += ` ${attributeName}="${attributeValue}"`;
                attributesMultiLine += `\n  `;
                attributesMultiLine += "  ".repeat(depth);
                attributesMultiLine += `${attributeName}="${attributeValue}"`;
              }
              attributesMultiLine += "\n";
              attributesMultiLine += "  ".repeat(depth);

              if (attributesSingleLine.length < 100) {
                nodeString += attributesSingleLine;
              } else {
                nodeString += attributesMultiLine;
              }
            }
          }

          let innerHTML = "";
          if (node.content) {
            if (node.name !== "text") {
              innerHTML += "\n  ";
              innerHTML += "  ".repeat(depth);
            }
            const contentEncoded = he.encode(node.content, { decimal: false });
            innerHTML += contentEncoded;
            if (node.name !== "text") {
              innerHTML += "\n";
              innerHTML += "  ".repeat(depth);
            }
          }
          write_children: {
            if (node.children.length > 0) {
              for (const child of node.children) {
                innerHTML += "\n  ";
                innerHTML += "  ".repeat(depth);
                innerHTML += renderNode(child, {
                  depth: depth + 1,
                });
              }
              innerHTML += "\n";
              innerHTML += "  ".repeat(depth);
            }
          }
          if (innerHTML === "") {
            if (node.canSelfClose) {
              nodeString += `/>`;
            } else {
              nodeString += `></${node.name}>`;
            }
          } else {
            nodeString += `>`;
            nodeString += innerHTML;
            nodeString += `</${node.name}>`;
          }
          return nodeString;
        };

        return renderNode(node, {
          depth: 0,
        });
      },
    };

    return node;
  };

  return createElement("svg", attributes);
};

const canSelfCloseNames = ["path", "rect", "circle"];
const canReceiveChildNames = ["svg", "foreignObject", "g"];
const canReceiveContentNames = ["text", "style"];

// Round: Make number values smaller in output
// Eg: 14.23734 becomes 14.24
// Credit @Chris Martin: https://stackoverflow.com/a/43012696/2816869
const round = (x) => {
  const rounded = Number(`${Math.round(`${x}e2`)}e-2`);
  return rounded;
};

// const svg = startGeneratingSvg();

// svg.setAttributes({
//   width: 200,
// });
// const g = svg.createElement("g");
// g.setAttributes({
//   fill: "red",
// });
// svg.appendChild(g);

// const string = svg.renderAsString();
// console.log(string);
