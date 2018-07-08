const isArr = Array.isArray;

const isQuery = res => isArr(res) || typeof res === "function";

const isText = node => "text" in node;

const isNew = node => "data" in node || isText(node)

module.exports = { isArr, isQuery, isNew, isText }