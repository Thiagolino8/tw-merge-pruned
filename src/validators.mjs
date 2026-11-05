// Validadores de sintaxe derivados de tailwind-merge (MIT; ver LICENSE).
const arbitraryValue = /^\[(?:(\w[\w-]*):)?(.+)\]$/i;
const arbitraryVariable = /^\((?:(\w[\w-]*):)?(.+)\)$/i;
const length =
  /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/;
const color = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix|color|light-dark)\(.+\)$/;
const image =
  /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/;
const shadow = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/;

export const isNumber = (value) => !!value && !Number.isNaN(Number(value));
export const isInteger = (value) => !!value && Number.isInteger(Number(value));
export const isFraction = (value) => /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/.test(value);
export const isPercent = (value) => value.endsWith("%") && isNumber(value.slice(0, -1));
export const isTshirtSize = (value) => /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/.test(value);
export const isAny = () => true;
export const isArbitraryValue = (value) => arbitraryValue.test(value);
export const isArbitraryVariable = (value) => arbitraryVariable.test(value);
export const isAnyNonArbitrary = (value) => !isArbitraryValue(value) && !isArbitraryVariable(value);

const matchesValue = (value, labels, test) => {
  const match = arbitraryValue.exec(value);
  return !!match && (match[1] ? labels.includes(match[1]) : test(match[2]));
};
const matchesVariable = (value, labels, unlabeled = false) => {
  const match = arbitraryVariable.exec(value);
  return !!match && (match[1] ? labels.includes(match[1]) : unlabeled);
};
const never = () => false;
const sizeLabels = ["length", "size", "bg-size"];
const positionLabels = ["position", "percentage"];
const imageLabels = ["image", "url"];
const weightLabels = ["number", "weight"];

export const isArbitraryLength = (value) =>
  matchesValue(value, ["length"], (text) => length.test(text) && !color.test(text));
export const isArbitraryNumber = (value) => matchesValue(value, ["number"], isNumber);
export const isArbitraryWeight = (value) => matchesValue(value, weightLabels, isAny);
export const isArbitraryFamilyName = (value) => matchesValue(value, ["family-name"], never);
export const isArbitraryPosition = (value) => matchesValue(value, positionLabels, never);
export const isArbitrarySize = (value) => matchesValue(value, sizeLabels, never);
export const isArbitraryImage = (value) =>
  matchesValue(value, imageLabels, (text) => image.test(text));
export const isArbitraryShadow = (value) =>
  matchesValue(value, ["shadow"], (text) => shadow.test(text));
export const isArbitraryVariableLength = (value) => matchesVariable(value, ["length"]);
export const isArbitraryVariableWeight = (value) => matchesVariable(value, weightLabels, true);
export const isArbitraryVariableFamilyName = (value) => matchesVariable(value, ["family-name"]);
export const isArbitraryVariablePosition = (value) => matchesVariable(value, positionLabels);
export const isArbitraryVariableSize = (value) => matchesVariable(value, sizeLabels);
export const isArbitraryVariableImage = (value) => matchesVariable(value, imageLabels);
export const isArbitraryVariableShadow = (value) => matchesVariable(value, ["shadow"], true);
